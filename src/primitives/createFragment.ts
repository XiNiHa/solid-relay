import { getFragment } from "relay-runtime";
import type { GraphQLTaggedNode } from "relay-runtime";
import type {
	ArrayKeyType,
	ArrayKeyTypeData,
	KeyType,
	KeyTypeData,
} from "relay-runtime/lib/store/ResolverFragments";
import { createResource } from "solid-js";
import type { ResourceReturn } from "solid-js";
import { unwrap } from "solid-js/store";

import { useRelayEnvironment } from "../RelayEnvironment";
import { createFragmentNode } from "./createFragmentNode";

export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: TKey,
): ResourceReturn<KeyTypeData<TKey>>;
export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: TKey | null,
): ResourceReturn<KeyTypeData<TKey> | null>;
export function createFragment<TKey extends ArrayKeyType>(
	fragment: GraphQLTaggedNode,
	key: TKey,
): ResourceReturn<ArrayKeyTypeData<TKey>>;
export function createFragment<TKey extends ArrayKeyType>(
	fragment: GraphQLTaggedNode,
	key: TKey | null,
): ResourceReturn<ArrayKeyTypeData<TKey> | null> {
	const environment = useRelayEnvironment();
	const fragmentNode = getFragment(fragment);
	return createResource(
		createFragmentNode(
			environment,
			fragmentNode,
			unwrap(key),
			"createFragment()",
		)[0],
		// biome-ignore lint/suspicious/noExplicitAny: return type already enforced
		(node) => node.data as any,
	);
}
