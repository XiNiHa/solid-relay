import { dequal } from "dequal/lite";
import {
	type CacheConfig,
	createOperationDescriptor,
	type GraphQLTaggedNode,
	getRequest,
	type OperationDescriptor,
	type Variables,
} from "relay-runtime";
import type { Accessor } from "solid-js";
import { createMemo } from "solid-js";
import { access, type MaybeAccessor } from "./access";

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
