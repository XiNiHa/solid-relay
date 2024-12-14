import {
	type CacheConfig,
	type ConcreteRequest,
	type Disposable,
	type DisposeFn,
	type FetchPolicy,
	type GraphQLResponse,
	type GraphQLTaggedNode,
	type IEnvironment,
	Observable,
	type OperationDescriptor,
	type OperationType,
	type PreloadableConcreteRequest,
	PreloadableQueryRegistry,
	ReplaySubject,
	type RequestParameters,
	type VariablesOf,
	__internal,
	createOperationDescriptor,
	getRequest,
	getRequestIdentifier,
} from "relay-runtime";
import type { RequestIdentifier } from "relay-runtime/lib/util/getRequestIdentifier";
import { OpaqueReference } from "seroval";
import invariant from "tiny-invariant";

export type PreloadFetchPolicy =
	| "store-or-network"
	| "store-and-network"
	| "network-only";

export type LoadQueryOptions = Readonly<{
	fetchPolicy?: FetchPolicy | null | undefined;
	networkCacheConfig?: CacheConfig | null | undefined;
	onQueryAstLoadTimeout?: (() => void) | null | undefined;
}>;

export interface PreloadedQuery<TQuery extends OperationType>
	extends Readonly<{
		kind: "PreloadedQuery";
		id?: string | null | undefined;
		name: string;
		variables: VariablesOf<TQuery>;
		fetchKey: string | number;
		fetchPolicy: FetchPolicy;
		networkCacheConfig?: CacheConfig | null | undefined;
		controls?:
			| OpaqueReference<{
					environment: IEnvironment;
					source: Observable<GraphQLResponse> | undefined;
					getNetworkError: () => Error | null;
					dispose: DisposeFn;
					isDisposed: () => boolean;
					releaseQuery: () => void;
			  }>
			| undefined;
	}> {}

let fetchKey = 100001;

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

	let unsubscribeFromNetworkRequest: (() => void) | undefined;
	let networkError: Error | null = null;
	let didMakeNetworkRequest = false;
	const makeNetworkRequest = (
		params: RequestParameters,
	): Observable<GraphQLResponse> => {
		didMakeNetworkRequest = true;

		const subject = new ReplaySubject<GraphQLResponse>();

		const identifier: RequestIdentifier =
			"raw-network-request-" + getRequestIdentifier(params, variables);
		const observable = __internal.fetchQueryDeduped(
			environment,
			identifier,
			() => {
				const network = environment.getNetwork();
				return network.execute(params, variables, networkCacheConfig);
			},
		);

		unsubscribeFromNetworkRequest = observable.subscribe({
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
		}).unsubscribe;
		return Observable.create((sink) => {
			const subjectSubscription = subject.subscribe(sink);
			return () => {
				subjectSubscription.unsubscribe();
				unsubscribeFromNetworkRequest?.();
			};
		});
	};

	let unsubscribeFromExecution: (() => void) | undefined;
	const executeDeduped = (
		operation: OperationDescriptor,
		fetchFn: () => Observable<GraphQLResponse>,
	) => {
		didMakeNetworkRequest = true;
		unsubscribeFromExecution = __internal
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
			}).unsubscribe;
	};

	const checkAvailabilityAndExecute = (concreteRequest: ConcreteRequest) => {
		const operation = createOperationDescriptor(
			concreteRequest,
			variables,
			networkCacheConfig,
		);
		retainReference = environment.retain(operation);
		if (fetchPolicy === "store-only") {
			return;
		}

		const shouldFetch =
			fetchPolicy !== "store-or-network" ||
			environment.check(operation).status !== "available";

		if (shouldFetch) {
			executeDeduped(operation, () => {
				const networkObservable = makeNetworkRequest(concreteRequest.params);
				const executeObservable = executeWithNetworkSource(
					operation,
					networkObservable,
				);
				return executeObservable;
			});
		}
	};

	let params: RequestParameters | undefined;
	let cancelOnLoadCallback: () => void;
	let queryId: string | null | undefined;
	if (
		"kind" in preloadableRequest &&
		preloadableRequest.kind === "PreloadableConcreteRequest"
	) {
		const preloadableConcreteRequest =
			preloadableRequest as PreloadableConcreteRequest<TQuery>;
		params = preloadableConcreteRequest.params;

		queryId = params.id;
		invariant(
			queryId != null,
			`Relay: \`loadQuery\` requires that preloadable query \`${params.name}\` has a persisted query id`,
		);

		const preloadableQueryRegistry =
			// @ts-expect-error - Broken DT types, fix on https://github.com/DefinitelyTyped/DefinitelyTyped/pull/71341
			PreloadableQueryRegistry as PreloadableQueryRegistry;
		const module = preloadableQueryRegistry.get(queryId);

		if (module != null) {
			checkAvailabilityAndExecute(module);
		} else {
			const networkObservable =
				fetchPolicy === "store-only" ? null : makeNetworkRequest(params);
			cancelOnLoadCallback = preloadableQueryRegistry.onLoad(
				queryId,
				(preloadedModule) => {
					cancelOnLoadCallback();
					const operation = createOperationDescriptor(
						preloadedModule,
						variables,
						networkCacheConfig,
					);
					retainReference = environment.retain(operation);
					if (networkObservable != null) {
						executeDeduped(operation, () =>
							executeWithNetworkSource(operation, networkObservable),
						);
					}
				},
			).dispose;
		}
	} else {
		const graphQlTaggedNode = preloadableRequest as GraphQLTaggedNode;
		const request = getRequest(graphQlTaggedNode);
		params = request.params;
		queryId =
			"cacheID" in params && params.cacheID != null
				? params.cacheID
				: params.id;
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
			unsubscribeFromExecution?.();
		} else {
			unsubscribeFromNetworkRequest?.();
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
