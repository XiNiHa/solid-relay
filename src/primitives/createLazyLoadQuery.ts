import { type MaybeAccessor, access } from "@solid-primitives/utils";
import {
	type CacheConfig,
	type FetchQueryFetchPolicy,
	type GraphQLResponse,
	type GraphQLTaggedNode,
	Observable,
	type OperationType,
	ReplaySubject,
	type VariablesOf,
	__internal,
	getPendingOperationsForFragment,
	getRequest,
} from "relay-runtime";
import RelayRuntimeExperimental from "relay-runtime/experimental";
import {
	batch,
	createComputed,
	createResource,
	createSignal,
	onCleanup,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useRelayEnvironment } from "../RelayEnvironment";
import { type DataProxy, makeDataProxy } from "../utils/dataProxy";
import { getQueryRef } from "../utils/getQueryRef";
import { createMemoOperationDescriptor } from "./createMemoOperationDescriptor";

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
		fetchPolicy?: MaybeAccessor<FetchQueryFetchPolicy | undefined>;
		networkCacheConfig?: MaybeAccessor<CacheConfig | undefined>;
	},
): DataProxy<TQuery["response"]> {
	const environment = useRelayEnvironment();

	const operation = createMemoOperationDescriptor(
		gqlQuery,
		variables,
		options?.networkCacheConfig,
	);
	const [serverData, setServerData] = createSignal<TQuery["response"]>();
	const replaySubject = new ReplaySubject();

	const [resource] = createResource(
		operation,
		async (operation) => {
			const observable = __internal.fetchQuery(environment, operation);
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
					for await (const response of value.values()) {
						try {
							replaySubject.next(response);
						} catch (error) {
							replaySubject.error(
								error instanceof Error ? error : new Error(String(error)),
							);
							break;
						}
					}
					replaySubject.complete();
				})();
			},
		},
	);

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

		const op = operation();
		if (!op) return;

		if (
			!getPendingOperationsForFragment(
				environment,
				getRequest(access(gqlQuery)).fragment,
				op.request,
			)
		) {
			environment
				.executeWithSource({
					operation: op,
					source: __internal.fetchQueryDeduped(
						environment,
						op.request.identifier,
						() => Observable.create((sink) => replaySubject.subscribe(sink)),
					),
				})
				.subscribe({});
		}

		const fragmentSubscription = RelayRuntimeExperimental.observeFragment(
			environment,
			getRequest(access(gqlQuery)).fragment,
			getQueryRef(op),
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
		const retainSubscription = environment.retain(op);
		onCleanup(() => {
			fragmentSubscription.unsubscribe();
			retainSubscription.dispose();
		});
	});

	return makeDataProxy(
		result,
		resource,
		typeof window === "undefined" ? serverData : undefined,
	);
}
