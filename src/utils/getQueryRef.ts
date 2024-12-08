import RelayRuntime, { type OperationDescriptor } from "relay-runtime";
import type { KeyType } from "relay-runtime/lib/store/ResolverFragments.js";

export const getQueryRef = (operation: OperationDescriptor) =>
	({
		[RelayRuntime.ID_KEY]: operation.fragment.dataID,
		[RelayRuntime.FRAGMENTS_KEY]: {
			[operation.fragment.node.name]: operation.request.variables,
		},
		[RelayRuntime.FRAGMENT_OWNER_KEY]: operation.request,
	}) as unknown as KeyType;
