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
	type Subscription,
	type VariablesOf,
} from "relay-runtime";
import { observeFragment } from "relay-runtime/experimental.js";
import { type Accessor, createMemo, isHydrating, onCleanup } from "solid-js";
import { getQueryCache, type QueryCacheEntry, type ResponseChain } from "../queryCache";
import { useRelayEnvironment } from "../RelayEnvironment";
import { access, type MaybeAccessor } from "../utils/access";
import { createMemoOperationDescriptor } from "../utils/createMemoOperationDescriptor";
import { createResultStore } from "../utils/createResultStore";
import { createDataStore, type DataStore } from "../utils/dataStore";
import { getQueryRef } from "../utils/getQueryRef";
import { cleanSnapshot } from "../utils/snapshot";

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
			pending: boolean;
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

		if (!shouldFetch) return;

		const replaySubject = new ReplaySubject<GraphQLResponse>();
		let subscription: Subscription | undefined;
		let fetchedInSameEnv = false;
		let replayed = false;

		const response = createMemo(
			() => {
				// During hydration the serialized server value is adopted; skip the fetch side effect.
				if (isHydrating()) return null;
				const observable = params.fetchObservable();
				if (!observable) return null;
				fetchedInSameEnv = true;

				let pr = Promise.withResolvers<ResponseChain>();
				const head = pr.promise;
				subscription = observable.subscribe({
					next(value) {
						const next = Promise.withResolvers<ResponseChain>();
						pr.resolve({ value, next: next.promise });
						pr = next;
					},
					error(error: unknown) {
						pr.reject(error);
					},
					complete() {
						pr.resolve(null);
					},
				});
				return head;
			},
			{ deferStream: params.deferStream },
		);

		// Feed the server-serialized responses into the client Relay store.
		const replay = (value: ResponseChain) => {
			if (fetchedInSameEnv || replayed || !value) return;
			replayed = true;
			const env = environment();
			subscription = env
				.executeWithSource({
					operation,
					source: __internal.fetchQueryDeduped(env, operation.request.identifier, () =>
						Observable.create((sink) => replaySubject.subscribe(sink)),
					),
				})
				.subscribe({});
			void (async () => {
				let result: ResponseChain = value;
				try {
					while (result) {
						// The first response is pushed synchronously, so the hydrating render can read it.
						replaySubject.next(result.value);
						result = await result.next;
					}
					replaySubject.complete();
				} catch (error) {
					replaySubject.error(error instanceof Error ? error : new Error(String(error)));
				}
			})();
		};

		let retainCount = 0;
		let retention: Disposable | undefined;
		const entry: QueryCacheEntry = {
			response,
			replay,
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
		cache.set(key, entry);

		return entry;
	});

	const result = createResultStore<QueryResult<TQuery["response"]>>(
		(draft, commit) => {
			const operation = params.query();
			const env = environment();
			const entry = cacheEntry();
			if (!operation || !env) {
				draft.data = undefined;
				draft.error = undefined;
				draft.pending = false;
				return;
			}
			if (entry) {
				const retention = entry.retain(env);
				onCleanup(() => retention.dispose());
			}

			draft.pending = true;
			const sub = observeFragment(env, params.fragment(), getQueryRef(operation)).subscribe({
				next(state) {
					switch (state.state) {
						case "ok":
							commit({ data: cleanSnapshot(state.value), error: undefined, pending: false });
							break;
						case "error":
							commit({ data: undefined, error: state.error, pending: false });
							break;
						case "loading":
							commit({ data: undefined, error: undefined, pending: true });
							break;
					}
				},
			});
			onCleanup(() => sub.unsubscribe());
		},
		{ data: undefined, error: undefined, pending: false },
	);

	const gate = createMemo(() => {
		const entry = cacheEntry();
		// Suspends until the first response; adopts the server value when hydrating.
		const value = entry?.response();
		entry?.replay(value ?? null);
		return true;
	});

	return createDataStore(result, gate);
}
