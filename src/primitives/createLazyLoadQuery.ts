import {
	type CacheConfig,
	type Disposable,
	type FetchPolicy,
	type GraphQLResponse,
	type GraphQLTaggedNode,
	Observable,
	type OperationDescriptor,
	type OperationType,
	type ReaderFragment,
	ReplaySubject,
	type VariablesOf,
	__internal,
	getRequest,
} from "relay-runtime";
import { observeFragment } from "relay-runtime/experimental.js";
import {
	type Accessor,
	batch,
	createComputed,
	createMemo,
	createResource,
	createSignal,
	onCleanup,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useRelayEnvironment } from "../RelayEnvironment";
import { type QueryCacheEntry, getQueryCache } from "../queryCache";
import { type MaybeAccessor, access } from "../utils/access";
import { createMemoOperationDescriptor } from "../utils/createMemoOperationDescriptor";
import { type DataProxy, makeDataProxy } from "../utils/dataProxy";
import { getQueryRef } from "../utils/getQueryRef";

type QueryResult<T> =
	| {
			data: T;
			error: undefined;
			pending: false;
	  }
	| {
			data: undefined;
			error: unknown;
			pending: false;
	  }
	| {
			data: undefined;
			error: undefined;
			pending: true;
	  };

export function createLazyLoadQuery<TQuery extends OperationType>(
	gqlQuery: MaybeAccessor<GraphQLTaggedNode>,
	variables: MaybeAccessor<VariablesOf<TQuery>>,
	options?: {
		fetchPolicy?: MaybeAccessor<FetchPolicy | undefined>;
		networkCacheConfig?: MaybeAccessor<CacheConfig | undefined>;
	},
): DataProxy<TQuery["response"]> {
	const environment = useRelayEnvironment();
	const operation = createMemoOperationDescriptor(
		gqlQuery,
		variables,
		options?.networkCacheConfig,
	);
	const fetchObservable = createMemo(() => {
		const op = operation();
		const env = environment();
		if (!op || !env) return;
		return __internal.fetchQuery(env, op);
	});

	return createLazyLoadQueryInternal({
		query: operation,
		fragment: () => getRequest(access(gqlQuery)).fragment,
		fetchObservable,
		fetchPolicy: () => access(options?.fetchPolicy),
	});
}

export function createLazyLoadQueryInternal<
	TQuery extends OperationType,
>(params: {
	query: Accessor<OperationDescriptor>;
	fragment: Accessor<ReaderFragment>;
	fetchObservable: Accessor<Observable<GraphQLResponse> | null | undefined>;
	fetchKey?: Accessor<string | number | null | undefined>;
	fetchPolicy?: Accessor<FetchPolicy | undefined>;
}): DataProxy<TQuery["response"]> {
	const environment = useRelayEnvironment();
	const queryCache = createMemo(() => getQueryCache(environment()));
	const [serverData, setServerData] = createSignal<TQuery["response"]>();

	const isLiveQuery = createMemo(
		() => params.query().request.node.params.metadata.live !== undefined,
	);
	const fetchPolicy = createMemo(
		() =>
			params.fetchPolicy?.() ??
			(isLiveQuery() ? "store-and-network" : "store-or-network"),
	);
	const cacheKey = createMemo(() => {
		return [
			fetchPolicy(),
			params.query().request.identifier,
			params.fetchKey?.(),
		]
			.filter((v) => v != null)
			.join("-");
	});
	const cacheEntry = createMemo(() => {
		const cache = queryCache();
		const existing = cache.get(cacheKey());
		if (existing != null) return existing;

		const operation = params.query();
		const queryAvailablility = environment().check(operation);
		const queryStatus = queryAvailablility.status;
		const hasFullQuery = queryStatus === "available";

		const shouldFetch = (() => {
			switch (fetchPolicy()) {
				case "store-only":
					return false;
				case "store-or-network":
					return !hasFullQuery;
				case "store-and-network":
				case "network-only":
					return true;
			}
		})();

		const replaySubject = new ReplaySubject<GraphQLResponse>();
		let subscriptionTarget = shouldFetch
			? environment().executeWithSource({
					operation,
					source: __internal.fetchQueryDeduped(
						environment(),
						operation.request.identifier,
						() => Observable.create((sink) => replaySubject.subscribe(sink)),
					),
				})
			: undefined;
		const [resource] = createResource(
			() => shouldFetch && params.fetchObservable(),
			async (observable) => {
				subscriptionTarget = observable;
				const stream = new ReadableStream<GraphQLResponse>({
					start(controller) {
						observable.subscribe({
							next(response) {
								controller.enqueue(response);
							},
							error(error: unknown) {
								controller.error(error);
							},
							complete() {
								controller.close();
							},
						});
					},
				});
				await observable.toPromise();
				return stream;
			},
			{
				onHydrated(operation, { value }) {
					if (!operation || !value) return;

					(async () => {
						try {
							for await (const response of value.values()) {
								replaySubject.next(response);
							}
							replaySubject.complete();
						} catch (error) {
							replaySubject.error(
								error instanceof Error ? error : new Error(String(error)),
							);
						}
					})();
				},
			},
		);

		let entry: QueryCacheEntry = false;
		if (shouldFetch) {
			const subscription = subscriptionTarget?.subscribe({});
			let retainCount = 0;
			let retention: Disposable | undefined;
			entry = {
				resource,
				retain: (environment) => {
					retainCount++;
					if (retainCount === 1) {
						retention = environment.retain(operation);
					}
					return {
						dispose: () => {
							retainCount = Math.max(retainCount - 1, 0);
							if (retainCount === 0) {
								retention?.dispose();
								if (isLiveQuery()) subscription?.unsubscribe();
								cache.delete(cacheKey());
							}
						},
					};
				},
			};
		}

		cache.set(cacheKey(), entry);
		return entry;
	});

	createComputed(() => {
		const entry = cacheEntry();
		if (!entry) return;
		const retention = entry.retain(environment());
		onCleanup(retention.dispose);
	});

	const initialResult: QueryResult<TQuery["response"]> = {
		data: undefined,
		error: undefined,
		pending: true,
	};
	const [result, setResult] =
		createStore<QueryResult<TQuery["response"]>>(initialResult);

	const updateData = (data: TQuery["response"]) => {
		if (typeof window !== "undefined") {
			setResult("data", reconcile(data, { key: "__id", merge: true }));
		} else setServerData(() => data);
	};

	createComputed(() => {
		setResult(initialResult);

		const operation = params.query();
		const env = environment();
		if (!operation || !env) return;

		const fragmentSubscription = observeFragment(
			env,
			params.fragment(),
			getQueryRef(operation),
		).subscribe({
			next(state) {
				batch(() => {
					if (state.state === "ok") {
						setResult("error", undefined);
						setResult("pending", false);
						updateData(state.value);
					} else if (state.state === "error") {
						updateData(undefined);
						setResult("error", state.error);
						setResult("pending", false);
					}
				});
			},
		});
		onCleanup(() => {
			fragmentSubscription.unsubscribe();
		});
	});

	return makeDataProxy(
		result,
		() => {
			const entry = cacheEntry();
			if (entry) entry.resource();
		},
		typeof window === "undefined" ? serverData : undefined,
	);
}
