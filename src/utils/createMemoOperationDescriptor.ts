import { dequal } from "dequal/lite";
import {
	type CacheConfig,
	type GraphQLTaggedNode,
	type OperationDescriptor,
	type Variables,
	createOperationDescriptor,
	getRequest,
} from "relay-runtime";
import { createMemo } from "solid-js";
import type { Accessor } from "solid-js";
import { type MaybeAccessor, access } from "./access";

export function createMemoOperationDescriptor(
	gqlQuery: MaybeAccessor<GraphQLTaggedNode>,
	variables: MaybeAccessor<Variables | undefined>,
	cacheConfig?: MaybeAccessor<CacheConfig | undefined>,
): Accessor<OperationDescriptor | undefined> {
	const memoizedVariables = createMemo(() => access(variables), undefined, {
		equals: dequal,
	});
	const memoizedCacheConfig = createMemo(() => access(cacheConfig), undefined, {
		equals: dequal,
	});

	return createMemo(() => {
		const variables = memoizedVariables();
		if (!variables) return;

		return createOperationDescriptor(
			getRequest(access(gqlQuery)),
			variables,
			memoizedCacheConfig(),
		);
	});
}
