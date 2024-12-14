import { type MaybeAccessor, access } from "@solid-primitives/utils";
import {
	type GraphQLTaggedNode,
	type OperationType,
	__internal,
	getRequest,
} from "relay-runtime";
import invariant from "tiny-invariant";
import { useRelayEnvironment } from "../RelayEnvironment";
import type { PreloadedQuery } from "../loadQuery";
import type { DataProxy } from "../utils/dataProxy";
import { createLazyLoadQueryInternal } from "./createLazyLoadQuery";
import { createMemoOperationDescriptor } from "./createMemoOperationDescriptor";

export function createPreloadedQuery<TQuery extends OperationType>(
	query: GraphQLTaggedNode,
	preloadedQuery: MaybeAccessor<PreloadedQuery<TQuery>>,
): DataProxy<TQuery["response"]> {
	const environment = useRelayEnvironment();
	const operation = createMemoOperationDescriptor(
		query,
		() => access(preloadedQuery).variables,
		() => access(preloadedQuery).networkCacheConfig ?? undefined,
	);

	return createLazyLoadQueryInternal({
		query: operation,
		fragment: () => getRequest(query).fragment,
		fetchKey: () => access(preloadedQuery).fetchKey,
		fetchObservable: () => {
			const preloaded = access(preloadedQuery);

			invariant(
				preloaded.controls == null || !preloaded.controls?.value.isDisposed(),
				"usePreloadedQuery(): Expected preloadedQuery to not be disposed yet. " +
					"This is because disposing the query marks it for future garbage " +
					"collection, and as such query results may no longer be present in the Relay store.",
			);

			const fallback = __internal.fetchQuery(environment(), operation());
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
