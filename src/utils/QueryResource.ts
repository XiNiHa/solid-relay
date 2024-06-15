import type {
	Disposable,
	FetchPolicy,
	GraphQLResponse,
	IEnvironment,
	Observable,
	Observer,
	OperationAvailability,
	OperationDescriptor,
	ReaderFragment,
	RenderPolicy,
	Snapshot,
	Subscription,
} from "relay-runtime";
import invariant from "tiny-invariant";

import * as LRUCache from "./LRUCache";
import SuspenseResource from "./SuspenseResource";

const CACHE_CAPACITY = 1000;
const DEFAULT_FETCH_POLICY = "store-or-network";
const DEFAULT_LIVE_FETCH_POLICY = "store-and-network";

type QueryResourceCacheEntry = {
	id: number;
	cacheIdentifier: string;
	operationAvailability: OperationAvailability | null;
	// The number of received payloads for the operation.
	// We want to differentiate the initial graphql response for the operation
	// from the incremental responses, so later we can choose how to handle errors
	// in the incremental payloads.
	processedPayloadsCount: number;
	getValue(): Error | Promise<void> | QueryResult;
	setNetworkSubscription(subscription: Subscription | null): void;
	setValue(value: Error | Promise<void> | QueryResult): void;
	temporaryRetain(environment: IEnvironment): Disposable;
	permanentRetain(environment: IEnvironment): Disposable;
	releaseTemporaryRetain(): void;
};

export interface QueryResult {
	cacheIdentifier: string;
	fragmentNode: ReaderFragment;
	fragmentRef: unknown;
	operation: OperationDescriptor;
}

const WEAKMAP_SUPPORTED = typeof WeakMap === "function";
interface IMap<K, V> {
	get(key: K): V | undefined;
	set(key: K, value: V): IMap<K, V>;
}

function operationIsLiveQuery(operation: OperationDescriptor): boolean {
	return operation.request.node.params.metadata.live !== undefined;
}

export function getQueryCacheIdentifier(
	environment: IEnvironment,
	operation: OperationDescriptor,
	maybeFetchPolicy?: FetchPolicy | null,
	maybeRenderPolicy?: RenderPolicy | null,
	cacheBreaker?: string | number,
): string {
	const fetchPolicy =
		maybeFetchPolicy ??
		(operationIsLiveQuery(operation)
			? DEFAULT_LIVE_FETCH_POLICY
			: DEFAULT_FETCH_POLICY);
	const renderPolicy =
		maybeRenderPolicy ?? environment.UNSTABLE_getDefaultRenderPolicy();
	const cacheIdentifier = `${fetchPolicy}-${renderPolicy}-${operation.request.identifier}`;
	if (cacheBreaker != null) {
		return `${cacheIdentifier}-${cacheBreaker}`;
	}
	return cacheIdentifier;
}

function getQueryResult(
	operation: OperationDescriptor,
	cacheIdentifier: string,
): QueryResult {
	const rootFragmentRef = {
		__id: operation.fragment.dataID,
		__fragments: {
			[operation.fragment.node.name]: operation.request.variables,
		},
		__fragmentOwner: operation.request,
	};
	return {
		cacheIdentifier,
		fragmentNode: operation.request.node.fragment,
		fragmentRef: rootFragmentRef,
		operation,
	};
}

let nextID = 200000;

function createCacheEntry(
	cacheIdentifier: string,
	operation: OperationDescriptor,
	operationAvailability: OperationAvailability | null,
	value: Error | Promise<void> | QueryResult,
	networkSubscription: Subscription | null,
	onDispose: (entry: QueryResourceCacheEntry) => void,
): QueryResourceCacheEntry {
	const isLiveQuery = operationIsLiveQuery(operation);

	let currentValue: Error | Promise<void> | QueryResult = value;
	let currentNetworkSubscription: Subscription | null = networkSubscription;

	const suspenseResource = new SuspenseResource((environment) => {
		const retention = environment.retain(operation);
		return {
			dispose: () => {
				// Normally if this entry never commits, the request would've ended by the
				// time this timeout expires and the temporary retain is released. However,
				// we need to do this for live queries which remain open indefinitely.
				if (isLiveQuery && currentNetworkSubscription != null) {
					currentNetworkSubscription.unsubscribe();
				}
				retention.dispose();
				onDispose(cacheEntry);
			},
		};
	});

	const cacheEntry: QueryResourceCacheEntry = {
		cacheIdentifier,
		id: nextID++,
		processedPayloadsCount: 0,
		operationAvailability,
		getValue() {
			return currentValue;
		},
		setValue(val: QueryResult | Promise<void> | Error) {
			currentValue = val;
		},
		setNetworkSubscription(subscription: Subscription | null) {
			if (isLiveQuery && currentNetworkSubscription != null) {
				currentNetworkSubscription.unsubscribe();
			}
			currentNetworkSubscription = subscription;
		},
		temporaryRetain(environment: IEnvironment): Disposable {
			return suspenseResource.temporaryRetain(environment);
		},
		permanentRetain(environment: IEnvironment): Disposable {
			return suspenseResource.permanentRetain(environment);
		},
		releaseTemporaryRetain() {
			suspenseResource.releaseTemporaryRetain();
		},
	};

	return cacheEntry;
}

class QueryResource {
	#environment: IEnvironment;
	#cache: LRUCache.Cache<QueryResourceCacheEntry> =
		LRUCache.create(CACHE_CAPACITY);

	constructor(environment: IEnvironment) {
		this.#environment = environment;
	}

	prepare(
		operation: OperationDescriptor,
		fetchObservable: Observable<GraphQLResponse>,
		maybeFetchPolicy?: FetchPolicy | null,
		maybeRenderPolicy?: RenderPolicy | null,
		observer?: Observer<Snapshot> | null,
		cacheBreaker?: string | number | undefined,
	): QueryResult | Promise<void> {
		const cacheIdentifier = getQueryCacheIdentifier(
			this.#environment,
			operation,
			maybeFetchPolicy,
			maybeRenderPolicy,
			cacheBreaker,
		);
		return this.prepareWithIdentifier(
			cacheIdentifier,
			operation,
			fetchObservable,
			maybeFetchPolicy,
			maybeRenderPolicy,
			observer,
		);
	}

	prepareWithIdentifier(
		cacheIdentifier: string,
		operation: OperationDescriptor,
		fetchObservable: Observable<GraphQLResponse>,
		maybeFetchPolicy?: FetchPolicy | null,
		maybeRenderPolicy?: RenderPolicy | null,
		observer?: Observer<Snapshot> | null,
	): QueryResult | Promise<void> {
		const environment = this.#environment;
		const fetchPolicy =
			maybeFetchPolicy ??
			(operationIsLiveQuery(operation)
				? DEFAULT_LIVE_FETCH_POLICY
				: DEFAULT_FETCH_POLICY);
		const renderPolicy =
			maybeRenderPolicy ?? environment.UNSTABLE_getDefaultRenderPolicy();

		let cacheEntry = this.#cache.get(cacheIdentifier);
		let temporaryRetainDisposable: Disposable | null = null;
		if (cacheEntry == null) {
			cacheEntry = this.#fetchAndSaveQuery(
				cacheIdentifier,
				operation,
				fetchObservable,
				fetchPolicy,
				renderPolicy,
				{
					...observer,
					unsubscribe(subscription) {
						if (temporaryRetainDisposable != null) {
							temporaryRetainDisposable.dispose();
						}
						const observerUnsubscribe = observer?.unsubscribe;
						if (observerUnsubscribe) observerUnsubscribe(subscription);
					},
				},
			);
		}

		temporaryRetainDisposable = cacheEntry.temporaryRetain(environment);

		const value = cacheEntry.getValue();
		if (value instanceof Error) throw value;
		return value;
	}

	retain(queryResult: QueryResult): Disposable {
		const environment = this.#environment;
		const { cacheIdentifier, operation } = queryResult;
		const cacheEntry = this.#getOrCreateCacheEntry(
			cacheIdentifier,
			operation,
			null,
			queryResult,
			null,
		);
		const disposable = cacheEntry.permanentRetain(environment);

		return {
			dispose() {
				disposable.dispose();
			},
		};
	}

	releaseTemporaryRetain(queryResult: QueryResult) {
		const cacheEntry = this.#cache.get(queryResult.cacheIdentifier);
		if (cacheEntry != null) {
			cacheEntry.releaseTemporaryRetain();
		}
	}

	#clearCacheEntry = (cacheEntry: QueryResourceCacheEntry) => {
		this.#cache.delete(cacheEntry.cacheIdentifier);
	};

	#getOrCreateCacheEntry(
		cacheIdentifier: string,
		operation: OperationDescriptor,
		operationAvailability: OperationAvailability | null,
		value: Error | Promise<void> | QueryResult,
		networkSubscription: Subscription | null,
	): QueryResourceCacheEntry {
		let cacheEntry = this.#cache.get(cacheIdentifier);
		if (cacheEntry == null) {
			cacheEntry = createCacheEntry(
				cacheIdentifier,
				operation,
				operationAvailability,
				value,
				networkSubscription,
				this.#clearCacheEntry,
			);
			this.#cache.set(cacheIdentifier, cacheEntry);
		}
		return cacheEntry;
	}

	#fetchAndSaveQuery(
		cacheIdentifier: string,
		operation: OperationDescriptor,
		fetchObservable: Observable<GraphQLResponse>,
		fetchPolicy: FetchPolicy,
		renderPolicy: RenderPolicy,
		observer: Observer<Snapshot>,
	): QueryResourceCacheEntry {
		const environment = this.#environment;

		const queryAvailability = environment.check(operation);
		const queryStatus = queryAvailability.status;
		const hasFullQuery = queryStatus === "available";
		const canPartialRender =
			hasFullQuery || (renderPolicy === "partial" && queryStatus !== "stale");

		let shouldFetch: boolean;
		let shouldAllowRender: boolean;
		let resolveNetworkPromise: () => void = () => undefined;
		switch (fetchPolicy) {
			case "store-only": {
				shouldFetch = false;
				shouldAllowRender = true;
				break;
			}
			case "store-or-network": {
				shouldFetch = !hasFullQuery;
				shouldAllowRender = canPartialRender;
				break;
			}
			case "store-and-network": {
				shouldFetch = true;
				shouldAllowRender = canPartialRender;
				break;
			}
			case "network-only":
			default: {
				shouldFetch = true;
				shouldAllowRender = false;
				break;
			}
		}

		if (shouldAllowRender) {
			const queryResult = getQueryResult(operation, cacheIdentifier);
			const cacheEntry = createCacheEntry(
				cacheIdentifier,
				operation,
				queryAvailability,
				queryResult,
				null,
				this.#clearCacheEntry,
			);
			this.#cache.set(cacheIdentifier, cacheEntry);
		}

		if (shouldFetch) {
			const queryResult = getQueryResult(operation, cacheIdentifier);
			let networkSubscription: Subscription | null;
			fetchObservable.subscribe({
				start: (subscription) => {
					networkSubscription = subscription;
					const cacheEntry = this.#cache.get(cacheIdentifier);
					if (cacheEntry) {
						cacheEntry.setNetworkSubscription(networkSubscription);
					}
					observer.start?.({
						...subscription,
						unsubscribe: () => {
							// Only live queries should have their network requests canceled.
							if (operationIsLiveQuery(operation)) {
								subscription.unsubscribe();
							}
						},
					});
				},
				next: () => {
					const cacheEntry = this.#getOrCreateCacheEntry(
						cacheIdentifier,
						operation,
						queryAvailability,
						queryResult,
						networkSubscription,
					);
					cacheEntry.processedPayloadsCount += 1;
					cacheEntry.setValue(queryResult);
					resolveNetworkPromise();

					observer?.next?.(environment.lookup(operation.fragment));
				},
				error: (error: Error) => {
					const cacheEntry = this.#getOrCreateCacheEntry(
						cacheIdentifier,
						operation,
						queryAvailability,
						queryResult,
						networkSubscription,
					);

					if (cacheEntry.processedPayloadsCount === 0) {
						cacheEntry.setValue(error);
					} else {
						console.warn(
							`QueryResource: An incremental payload for query \`${operation.fragment.node.name}\` returned an error: \`${error.message}\`.`,
						);
					}
					resolveNetworkPromise();

					networkSubscription = null;
					cacheEntry.setNetworkSubscription(null);
					observer?.error?.(error);
				},
				complete: () => {
					resolveNetworkPromise();

					networkSubscription = null;
					const cacheEntry = this.#cache.get(cacheIdentifier);
					if (cacheEntry) {
						cacheEntry.setNetworkSubscription(null);
					}
					observer?.complete?.();
				},
				unsubscribe: observer?.unsubscribe,
			});

			let cacheEntry = this.#cache.get(cacheIdentifier);
			if (!cacheEntry) {
				const networkPromise = new Promise<void>((resolve) => {
					resolveNetworkPromise = resolve;

					// @ts-expect-error(2339): Expando to annotate Promises.
					networkPromise.displayName = `Relay(${operation.fragment.node.name})`;

					cacheEntry = createCacheEntry(
						cacheIdentifier,
						operation,
						queryAvailability,
						networkPromise,
						networkSubscription,
						this.#clearCacheEntry,
					);
					this.#cache.set(cacheIdentifier, cacheEntry);
				});
			}
		} else {
			observer?.complete?.();
		}
		const cacheEntry = this.#cache.get(cacheIdentifier);
		invariant(
			cacheEntry != null,
			"solid-relay: Expected to have cached a result when attempting to fetch query." +
				"If you're seeing this, this is likely a bug in solid-relay.",
		);
		return cacheEntry;
	}
}

export function createQueryResource(environment: IEnvironment): QueryResource {
	return new QueryResource(environment);
}

const dataResources: IMap<IEnvironment, QueryResource> = WEAKMAP_SUPPORTED
	? new WeakMap()
	: new Map();

export function getQueryResourceForEnvironment(
	environment: IEnvironment,
): QueryResource {
	const cached = dataResources.get(environment);
	if (cached) return cached;

	const newDataResource = createQueryResource(environment);
	dataResources.set(environment, newDataResource);
	return newDataResource;
}

export type { QueryResource };
