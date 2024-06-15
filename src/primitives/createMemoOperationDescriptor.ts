import { access } from "@solid-primitives/utils";
import type { MaybeAccessor } from "@solid-primitives/utils";
import deepEqual from "deep-equal";
import { createOperationDescriptor, getRequest } from "relay-runtime";
import type {
	CacheConfig,
	GraphQLTaggedNode,
	OperationDescriptor,
	Variables,
} from "relay-runtime";
import { createMemo } from "solid-js";
import type { Accessor } from "solid-js";

export function createMemoOperationDescriptor(
	gqlQuery: MaybeAccessor<GraphQLTaggedNode>,
	variables: MaybeAccessor<Variables>,
	cacheConfig?: MaybeAccessor<CacheConfig>,
): Accessor<OperationDescriptor> {
	const memoizedVariables = createMemo(() => access(variables), {
		equals: deepEqual,
	});
	const memoizedCacheConfig = createMemo(() => access(cacheConfig), {
		equals: deepEqual,
	});
	return createMemo(() =>
		createOperationDescriptor(
			getRequest(access(gqlQuery)),
			memoizedVariables(),
			memoizedCacheConfig(),
		),
	);
}
