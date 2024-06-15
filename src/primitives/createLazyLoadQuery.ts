import { access } from "@solid-primitives/utils";
import type { MaybeAccessor } from "@solid-primitives/utils";
import { __internal } from "relay-runtime";
import type {
	CacheConfig,
	FetchPolicy,
	GraphQLTaggedNode,
	OperationType,
	RenderPolicy,
	VariablesOf,
} from "relay-runtime";
import { createMemo } from "solid-js";
import type { ResourceReturn } from "solid-js";

import { useRelayEnvironment } from "../RelayEnvironment";
import { createLazyLoadQueryNode } from "./createLazyLoadQueryNode";
import { createMemoOperationDescriptor } from "./createMemoOperationDescriptor";

export function createLazyLoadQuery<TQuery extends OperationType>(
	gqlQuery: MaybeAccessor<GraphQLTaggedNode>,
	variables: MaybeAccessor<VariablesOf<TQuery>>,
	options?: {
		fetchKey?: MaybeAccessor<string | number | undefined>;
		fetchPolicy?: MaybeAccessor<FetchPolicy | undefined>;
		networkCacheConfig?: MaybeAccessor<CacheConfig | undefined>;
		UNSTABLE_renderPolicy?: MaybeAccessor<RenderPolicy | undefined>;
	},
): ResourceReturn<TQuery["response"]> {
	const environment = useRelayEnvironment();

	const query = createMemoOperationDescriptor(
		gqlQuery,
		variables,
		() => access(options?.networkCacheConfig) ?? { force: true },
	);
	const data = createLazyLoadQueryNode({
		componentDisplayName: "createLazyLoadQuery()",
		environment,
		query,
		fetchObservable: createMemo(() =>
			__internal.fetchQuery(environment, access(query)),
		),
		fetchKey: () => access(options?.fetchKey) ?? null,
		fetchPolicy: () => access(options?.fetchPolicy) ?? null,
		renderPolicy: () => access(options?.UNSTABLE_renderPolicy) ?? null,
	});

	return data;
}
