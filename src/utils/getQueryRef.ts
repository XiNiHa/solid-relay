import {
	FRAGMENTS_KEY,
	FRAGMENT_OWNER_KEY,
	ID_KEY,
	type OperationDescriptor,
} from "relay-runtime";
import type { KeyType } from "relay-runtime/lib/store/FragmentTypes";

export const getQueryRef = (operation: OperationDescriptor) =>
	({
		[ID_KEY]: operation.fragment.dataID,
		[FRAGMENTS_KEY]: {
			[operation.fragment.node.name]: operation.request.variables,
		},
		[FRAGMENT_OWNER_KEY]: operation.request,
	}) as unknown as KeyType;
