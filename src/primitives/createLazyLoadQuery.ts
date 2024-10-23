import { access, type MaybeAccessor } from "@solid-primitives/utils";
import RelayRuntime, {
	getRequest,
	type CacheConfig,
	type FetchQueryFetchPolicy,
	type GraphQLResponse,
	type GraphQLTaggedNode,
	type OperationType,
	type VariablesOf,
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
import { makeDataProxy, type DataProxy } from "../utils/dataProxy";
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

	const [resource] = createResource(
		operation,
		async (operation) => {
			const observable = RelayRuntime.__internal.fetchQuery(
				environment,
				operation,
			);
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

				environment.executeWithSource({
					operation,
					source: RelayRuntime.Observable.create((sink) => {
						(async () => {
							for await (const response of value.values()) {
								try {
									sink.next(response);
								} catch (error) {
									sink.error(
										error instanceof Error ? error : new Error(String(error)),
									);
									break;
								}
							}
							sink.complete();
						})();
					}),
				});
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
		if (typeof window !== "undefined") setResult("data", reconcile(data));
		else setServerData(() => data);
	};

	createComputed(() => {
		setResult(initialResult);

		const source = operation();
		if (!source) return;

		const fragmentSubscription = RelayRuntimeExperimental.observeFragment(
			environment,
			getRequest(access(gqlQuery)).fragment,
			getQueryRef(source),
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
		const retainSubscription = environment.retain(source);
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
