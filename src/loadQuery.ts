import {
	__internal,
	type CacheConfig,
	type ConcreteRequest,
	createOperationDescriptor,
	type Disposable,
	type DisposeFn,
	type FetchPolicy,
	type GraphQLResponse,
	type GraphQLTaggedNode,
	getRequest,
	getRequestIdentifier,
	type IEnvironment,
	Observable,
	type OperationDescriptor,
	type OperationType,
	type PreloadableConcreteRequest,
	PreloadableQueryRegistry,
	ReplaySubject,
	type RequestParameters,
	type Subscription,
	type VariablesOf,
} from "relay-runtime";
import type { RequestIdentifier } from "relay-runtime/lib/util/getRequestIdentifier";
import { OpaqueReference } from "seroval";
import invariant from "tiny-invariant";

export type PreloadFetchPolicy = "store-or-network" | "store-and-network" | "network-only";

/**
 * Options for `loadQuery`.
 */
export interface LoadQueryOptions {
	/** Fetch policy for the preload request. */
	readonly fetchPolicy?: FetchPolicy | null | undefined;
	/** Cache configuration for the preload request. */
	readonly networkCacheConfig?: CacheConfig | null | undefined;
	/** Callback to invoke if the query AST takes too long to load. */
	readonly onQueryAstLoadTimeout?: (() => void) | null | undefined;
}

/**
 * A retained query reference produced by `loadQuery`.
 *
 * Pass this value to `createPreloadedQuery` to read the query result.
 * Dispose it when no longer needed to release retained data and cancel
 * any pending network work.
 */
export interface PreloadedQuery<TQuery extends OperationType> {
	/** Discriminator used to identify preloaded query references. */
	readonly kind: "PreloadedQuery";
	/** Persisted query id or cache id when available. */
	readonly id?: string | null | undefined;
	/** Operation name for diagnostics and debugging. */
	readonly name: string;
	/** Variables used when preloading the query. */
	readonly variables: VariablesOf<TQuery>;
	/** Monotonic key used to distinguish subsequent loads. */
	readonly fetchKey: string | number;
	/** Fetch policy used for the preload request. */
	readonly fetchPolicy: FetchPolicy;
	/** Cache config forwarded to the network layer. */
	readonly networkCacheConfig?: CacheConfig | null | undefined;
	/** Internal controls for retaining, disposing, and observing preload state. */
	readonly controls?:
		| OpaqueReference<{
				environment: IEnvironment;
				source: Observable<GraphQLResponse> | undefined;
				getNetworkError: () => Error | null;
				dispose: DisposeFn;
				isDisposed: () => boolean;
				releaseQuery: () => void;
		  }>
		| undefined;
}

let fetchKey = 100001;

/**
 * Preloads a query and returns a `PreloadedQuery` reference.
 *
 * Use this to start fetching before render (for example during route preload),
 * then consume the returned reference with `createPreloadedQuery`.
 *
 * @param environment - Relay environment used to execute and retain the query.
 * @param preloadableRequest - Query document or preloadable concrete request.
 * @param variables - Variables for the query operation.
 * @param options - Options for the preload request.
 * @returns A query reference that can be consumed by `createPreloadedQuery`.
 */
export function loadQuery<TQuery extends OperationType>(
	environment: IEnvironment,
	preloadableRequest: GraphQLTaggedNode | PreloadableConcreteRequest<TQuery>,
	variables: VariablesOf<TQuery>,
	options?: LoadQueryOptions,
): PreloadedQuery<TQuery> {
	fetchKey++;

	const fetchPolicy = options?.fetchPolicy ?? "store-or-network";
	const networkCacheConfig = {
		...options?.networkCacheConfig,
		force: true,
	};

	let retainReference: Disposable | undefined;
	let didExecuteNetworkSource = false;
	const executeWithNetworkSource = (
		operation: OperationDescriptor,
		networkObservable: Observable<GraphQLResponse>,
	): Observable<GraphQLResponse> => {
		didExecuteNetworkSource = true;
		return environment.executeWithSource({
			operation,
			source: networkObservable,
		});
	};

	const executionSubject = new ReplaySubject<GraphQLResponse>();
	const returnedObservable = Observable.create<GraphQLResponse>((sink) =>
		executionSubject.subscribe(sink),
	);

	let networkRequestSubscription: Subscription | undefined;
	let networkError: Error | null = null;
	let didMakeNetworkRequest = false;
	const makeNetworkRequest = (params: RequestParameters): Observable<GraphQLResponse> => {
		didMakeNetworkRequest = true;

		const subject = new ReplaySubject<GraphQLResponse>();

		const identifier: RequestIdentifier =
			"raw-network-request-" + getRequestIdentifier(params, variables);
		const observable = __internal.fetchQueryDeduped(environment, identifier, () => {
			const network = environment.getNetwork();
			return network.execute(params, variables, networkCacheConfig);
		});

		networkRequestSubscription = observable.subscribe({
			error(err: Error) {
				networkError = err;
				subject.error(err);
			},
			next(data) {
				subject.next(data);
			},
			complete() {
				subject.complete();
			},
		});
		return Observable.create((sink) => {
			const subjectSubscription = subject.subscribe(sink);
			return () => {
				subjectSubscription.unsubscribe();
				networkRequestSubscription?.unsubscribe();
			};
		});
	};

	let executionSubcription: Subscription | undefined;
	const executeDeduped = (
		operation: OperationDescriptor,
		fetchFn: () => Observable<GraphQLResponse>,
	) => {
		didMakeNetworkRequest = true;
		executionSubcription = __internal
			.fetchQueryDeduped(environment, operation.request.identifier, fetchFn)
			.subscribe({
				error(err: Error) {
					executionSubject.error(err);
				},
				next(data) {
					executionSubject.next(data);
				},
				complete() {
					executionSubject.complete();
				},
			});
	};

	const checkAvailabilityAndExecute = (concreteRequest: ConcreteRequest) => {
		const operation = createOperationDescriptor(concreteRequest, variables, networkCacheConfig);
		retainReference = environment.retain(operation);
		if (fetchPolicy === "store-only") {
			return;
		}

		const shouldFetch =
			fetchPolicy !== "store-or-network" || environment.check(operation).status !== "available";

		if (shouldFetch) {
			executeDeduped(operation, () => {
				const networkObservable = makeNetworkRequest(concreteRequest.params);
				const executeObservable = executeWithNetworkSource(operation, networkObservable);
				return executeObservable;
			});
		}
	};

	let params: RequestParameters | undefined;
	let cancelOnLoadCallback: () => void;
	let queryId: string | null | undefined;
	if ("kind" in preloadableRequest && preloadableRequest.kind === "PreloadableConcreteRequest") {
		const preloadableConcreteRequest = preloadableRequest as PreloadableConcreteRequest<TQuery>;
		params = preloadableConcreteRequest.params;

		queryId = params.id;
		invariant(
			queryId != null,
			`Relay: \`loadQuery\` requires that preloadable query \`${params.name}\` has a persisted query id`,
		);

		const module = PreloadableQueryRegistry.get(queryId);

		if (module != null) {
			checkAvailabilityAndExecute(module);
		} else {
			const networkObservable = fetchPolicy === "store-only" ? null : makeNetworkRequest(params);
			cancelOnLoadCallback = PreloadableQueryRegistry.onLoad(queryId, (preloadedModule) => {
				cancelOnLoadCallback();
				const operation = createOperationDescriptor(preloadedModule, variables, networkCacheConfig);
				retainReference = environment.retain(operation);
				if (networkObservable != null) {
					executeDeduped(operation, () => executeWithNetworkSource(operation, networkObservable));
				}
			}).dispose;
		}
	} else {
		const graphQlTaggedNode = preloadableRequest as GraphQLTaggedNode;
		const request = getRequest(graphQlTaggedNode);
		params = request.params;
		queryId = "cacheID" in params && params.cacheID != null ? params.cacheID : params.id;
		checkAvailabilityAndExecute(request);
	}

	let isDisposed = false;
	let isReleased = false;
	let isNetworkRequestCanceled = false;
	const releaseQuery = () => {
		if (isReleased) return;
		retainReference?.dispose();
		isReleased = true;
	};
	const cancelNetworkRequest = () => {
		if (isNetworkRequestCanceled) return;
		if (didExecuteNetworkSource) {
			executionSubcription?.unsubscribe();
		} else {
			networkRequestSubscription?.unsubscribe();
		}
		cancelOnLoadCallback?.();
		isNetworkRequestCanceled = true;
	};
	return {
		kind: "PreloadedQuery",
		id: queryId,
		name: params.name,
		variables,
		fetchKey,
		fetchPolicy,
		networkCacheConfig,
		controls: new OpaqueReference({
			environment,
			source: didMakeNetworkRequest ? returnedObservable : undefined,
			getNetworkError: () => networkError,
			dispose: () => {
				if (isDisposed) return;
				releaseQuery();
				cancelNetworkRequest();
				isDisposed = true;
			},
			isDisposed: () => isDisposed || isReleased,
			releaseQuery: releaseQuery,
		}),
	};
}
