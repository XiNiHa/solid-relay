import {
	__internal,
	type CacheConfig,
	type Disposable,
	type FetchPolicy,
	type GraphQLResponse,
	type GraphQLTaggedNode,
	getRequest,
	Observable,
	type OperationDescriptor,
	type OperationType,
	type ReaderFragment,
	ReplaySubject,
	type VariablesOf,
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
	Setter,
	Signal,
	untrack,
} from "solid-js";
import { reconcile } from "solid-js/store";
import { getQueryCache, type QueryCacheEntry } from "../queryCache";
import { useRelayEnvironment } from "../RelayEnvironment";
import { access, type MaybeAccessor } from "../utils/access";
import { createMemoOperationDescriptor } from "../utils/createMemoOperationDescriptor";
import { createDataStore, type DataStore } from "../utils/dataStore";
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

/**
 * Reads query data and subscribes to store updates for the current component.
 *
 * It fetches according to the provided fetch policy and returns a reactive
 * data store containing the query response.
 *
 * @param gqlQuery - GraphQL query document.
 * @param variables - Query variables or an accessor for reactive variables.
 * @param options.fetchPolicy - Query fetch policy.
 * @param options.networkCacheConfig - Network cache configuration.
 * @param options.deferStream - Whether to defer the SSR stream until the data is resolved.
 * @returns A `DataStore` containing the query data state.
 */
export function createLazyLoadQuery<TQuery extends OperationType>(
	gqlQuery: MaybeAccessor<GraphQLTaggedNode>,
	variables: MaybeAccessor<VariablesOf<TQuery>>,
	options?: {
		fetchPolicy?: MaybeAccessor<FetchPolicy | undefined>;
		networkCacheConfig?: MaybeAccessor<CacheConfig | undefined>;
		deferStream?: boolean;
	},
): DataStore<TQuery["response"]> {
	const environment = useRelayEnvironment();
	const operation = createMemoOperationDescriptor(gqlQuery, variables, options?.networkCacheConfig);
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
		deferStream: options?.deferStream,
	});
}

export function createLazyLoadQueryInternal<TQuery extends OperationType>(params: {
	query: Accessor<OperationDescriptor | undefined>;
	fragment: Accessor<ReaderFragment>;
	fetchObservable: Accessor<Observable<GraphQLResponse> | null | undefined>;
	fetchKey?: Accessor<string | number | null | undefined>;
	fetchPolicy?: Accessor<FetchPolicy | undefined>;
	deferStream?: boolean;
}): DataStore<TQuery["response"]> {
	const environment = useRelayEnvironment();
	const queryCache = createMemo(() => getQueryCache(environment()));

	const isLiveQuery = createMemo(
		() => params.query()?.request.node.params.metadata.live !== undefined,
	);
	const fetchPolicy = createMemo(
		() => params.fetchPolicy?.() ?? (isLiveQuery() ? "store-and-network" : "store-or-network"),
	);
	const cacheKey = createMemo(() => {
		const query = params.query();
		if (!query) return;

		return [fetchPolicy(), query.request.identifier, params.fetchKey?.()]
			.filter((v) => v != null)
			.join("-");
	});
	const cacheEntry = createMemo(() => {
		const operation = params.query();
		const key = cacheKey();
		if (!operation || !key) return;

		const cache = queryCache();
		const existing = cache.get(key);
		if (existing != null) return existing;

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
					source: __internal.fetchQueryDeduped(environment(), operation.request.identifier, () =>
						Observable.create((sink) => replaySubject.subscribe(sink)),
					),
				})
			: undefined;

		type RecursiveResult = {
			value: GraphQLResponse;
			next: Promise<RecursiveResult>;
		} | null;

		const [resource] = createResource<RecursiveResult, Observable<GraphQLResponse>>(
			() => shouldFetch && params.fetchObservable(),
			async (observable) => {
				subscriptionTarget = observable;

				let pr = Promise.withResolvers<RecursiveResult>();
				observable.subscribe({
					next(response) {
						const nextPr = Promise.withResolvers<RecursiveResult>();
						pr.resolve({ value: response, next: nextPr.promise });
						pr = nextPr;
					},
					error(error: unknown) {
						pr.reject(error);
					},
					complete() {
						pr.resolve(null);
					},
				});
				return await pr.promise;
			},
			{
				deferStream: params.deferStream,
				storage(init) {
					let hydrated = false;
					const [value, setValue] = createSignal(init);

					return [
						value,
						(next: Setter<RecursiveResult | undefined>) => {
							const current = untrack(value);
							const nextValue = typeof next === "function" ? next(current) : next;

							if (!hydrated) {
								void (async () => {
									let result = nextValue;
									try {
										while (result) {
											replaySubject.next(result.value);
											result = await result.next;
										}
										replaySubject.complete();
									} catch (error) {
										replaySubject.error(error instanceof Error ? error : new Error(String(error)));
									}
								})();
								hydrated = true;
							}

							setValue(() => nextValue);
						},
					] as Signal<RecursiveResult | undefined>;
				},
			},
		);

		let entry: QueryCacheEntry = null;
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
								cache.delete(key);
							}
						},
					};
				},
			};
		}

		cache.set(key, entry);
		return entry;
	});

	createComputed(() => {
		const entry = cacheEntry();
		if (!entry) return;
		const retention = entry.retain(environment());
		onCleanup(retention.dispose);
	});

	const [result, setResult] = createDataStore<QueryResult<TQuery["response"]>>(
		{
			data: undefined,
			error: undefined,
			pending: true,
		},
		() => cacheEntry()?.resource,
	);

	createComputed(() => {
		batch(() => {
			setResult("data", undefined);
			setResult("error", undefined);
			setResult("pending", true);
		});

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
						setResult("data", reconcile(state.value, { key: "__id", merge: true }));
					} else if (state.state === "error") {
						setResult("data", undefined);
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

	return result;
}
