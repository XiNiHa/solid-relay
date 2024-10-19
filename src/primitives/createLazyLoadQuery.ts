import type { MaybeAccessor } from "@solid-primitives/utils";
import { ReplaySubject, __internal } from "relay-runtime";
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

	const [resource] = createResource(
		operation,
		(operation) => {
			const observable = __internal.fetchQuery(environment, operation);
			setSource({ observable, operation });
			return new Promise<GraphQLResponse>((resolve, reject) => {
				const subscription = observable.subscribe({
					next(response) {
						resolve(response);
						subscription.unsubscribe();
					},
					error(error: unknown) {
						reject(error);
						subscription.unsubscribe();
					},
				});
			});
		},
		{
			onHydrated(source, { value }) {
				if (!source || !value) return;

				const replaySubject = new ReplaySubject<GraphQLResponse>();
				setSource({
					observable: Observable.create((sink) =>
						replaySubject.subscribe(sink),
					),
					operation: source,
				});

				replaySubject.next(value);
				if (!("hasNext" in value) || !value.hasNext) {
					replaySubject.complete();
				}
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
					setResult(
						"data",
						reconcile(environment.lookup(operation.fragment).data),
					);
				});
			},
			error(error: unknown) {
				batch(() => {
					setResult("data", undefined);
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

	return makeDataProxy(result, resource);
}
