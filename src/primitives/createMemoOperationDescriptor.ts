import { access } from "@solid-primitives/utils";
import type { MaybeAccessor } from "@solid-primitives/utils";
import deepEqual from "deep-equal";
import RelayRuntime from "relay-runtime";
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
	cacheConfig?: MaybeAccessor<CacheConfig | undefined>,
): Accessor<OperationDescriptor> {
	const memoizedVariables = createMemo(() => access(variables), undefined, {
		equals: deepEqual,
	});
	const memoizedCacheConfig = createMemo(() => access(cacheConfig), undefined, {
		equals: deepEqual,
	});
	return createMemo(() =>
		RelayRuntime.createOperationDescriptor(
			RelayRuntime.getRequest(access(gqlQuery)),
			memoizedVariables(),
			memoizedCacheConfig(),
		),
	);
}
