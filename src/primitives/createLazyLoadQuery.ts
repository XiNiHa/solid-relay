import type { MaybeAccessor } from "@solid-primitives/utils";
import RelayRuntime from "relay-runtime";
import {
	type CacheConfig,
	type FetchQueryFetchPolicy,
	type GraphQLResponse,
	type GraphQLTaggedNode,
	Observable,
	type OperationDescriptor,
	type OperationType,
	type VariablesOf,
} from "relay-runtime";
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
import { createMemoOperationDescriptor } from "./createMemoOperationDescriptor";

type QueryResult<T> = {
	data: T | undefined;
	error: unknown;
	pending: boolean;
	inFlight: boolean;
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
	const [source, setSource] = createSignal<{
		observable: Observable<GraphQLResponse>;
		operation: OperationDescriptor;
	}>();
	const [serverData, setServerData] = createSignal<TQuery["response"]>();

	const [resource] = createResource(
		operation,
		async (operation) => {
			const observable = RelayRuntime.__internal.fetchQuery(
				environment,
				operation,
			);
			setSource({ observable, operation });
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
			async onHydrated(operation, { value }) {
				if (!operation || !value) return;

				const replaySubject = new RelayRuntime.ReplaySubject<GraphQLResponse>();
				setSource({
					observable: environment.executeWithSource({
						operation,
						source: Observable.create((sink) => replaySubject.subscribe(sink)),
					}),
					operation: operation,
				});

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
			},
		},
	);

	const initialResult: QueryResult<TQuery["response"]> = {
		data: undefined,
		error: undefined,
		pending: false,
		inFlight: false,
	};
	const [result, setResult] =
		createStore<QueryResult<TQuery["response"]>>(initialResult);

	const updateData = (data: TQuery["response"]) => {
		if (typeof window !== "undefined") setResult("data", reconcile(data));
		else setServerData(() => data);
	};

	createComputed(() => {
		setResult({
			...initialResult,
			pending: true,
			inFlight: true,
		});

		const currentSource = source();
		if (!currentSource) return;

		const { observable, operation } = currentSource;
		const fetchSubscription = observable.subscribe({
			next() {
				batch(() => {
					setResult("error", undefined);
					setResult("pending", false);
					updateData(environment.lookup(operation.fragment).data);
				});
			},
			error(error: unknown) {
				batch(() => {
					updateData(undefined);
					setResult("error", error);
					setResult("pending", false);
				});
			},
			complete() {
				setResult("inFlight", false);
			},
		});
		const retainSubscription = environment.retain(operation);
		onCleanup(() => {
			fetchSubscription.unsubscribe();
			retainSubscription.dispose();
		});
	});

	return makeDataProxy(
		result,
		resource,
		typeof window === "undefined" ? serverData : undefined,
	);
}
