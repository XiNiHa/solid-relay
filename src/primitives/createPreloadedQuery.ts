import {
	type GraphQLTaggedNode,
	type OperationType,
	__internal,
	getRequest,
} from "relay-runtime";
import { createEffect, createResource, onCleanup } from "solid-js";
import invariant from "tiny-invariant";
import { useRelayEnvironment } from "../RelayEnvironment";
import type { PreloadedQuery } from "../loadQuery";
import { type MaybeAccessor, access } from "../utils/access";
import { createMemoOperationDescriptor } from "../utils/createMemoOperationDescriptor";
import type { DataStore } from "../utils/dataStore";
import { createLazyLoadQueryInternal } from "./createLazyLoadQuery";

type MaybePromise<T> = T | Promise<T>;

export function createPreloadedQuery<TQuery extends OperationType>(
	query: GraphQLTaggedNode,
	preloadedQuery: MaybeAccessor<MaybePromise<PreloadedQuery<TQuery>>>,
): DataStore<TQuery["response"]> {
	const environment = useRelayEnvironment();
	const [maybePreloaded] = createResource(
		() => access(preloadedQuery),
		(v) => v,
	);
	const operation = createMemoOperationDescriptor(
		query,
		() => maybePreloaded.latest?.variables,
		() => maybePreloaded.latest?.networkCacheConfig ?? undefined,
	);

	createEffect(() => {
		const preloaded = maybePreloaded.latest;
		if (preloaded) {
			onCleanup(() => {
				preloaded.controls?.value.dispose();
			});
		}
	});

	return createLazyLoadQueryInternal({
		query: operation,
		fragment: () => getRequest(query).fragment,
		fetchKey: () => maybePreloaded.latest?.fetchKey,
		fetchPolicy: () => maybePreloaded.latest?.fetchPolicy,
		fetchObservable: () => {
			const preloaded = maybePreloaded.latest;
			const op = operation();
			if (!preloaded || !op) return;

			invariant(
				preloaded.controls == null || !preloaded.controls?.value.isDisposed(),
				"usePreloadedQuery(): Expected preloadedQuery to not be disposed yet. " +
					"This is because disposing the query marks it for future garbage " +
					"collection, and as such query results may no longer be present in the Relay store.",
			);

			const fallback = __internal.fetchQuery(environment(), op);
			if (preloaded.controls?.value.source == null) return fallback;

			invariant(
				preloaded.controls == null ||
					environment() === preloaded.controls.value.environment,
				"usePreloadedQuery(): usePreloadedQuery was passed a preloaded query " +
					"that was created with a different environment than the one that is currently in context.",
			);
			return preloaded.controls.value.source.ifEmpty(fallback);
		},
	});
}
