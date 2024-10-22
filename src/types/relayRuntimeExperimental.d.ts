declare module "relay-runtime/experimental" {
	import type {
		GraphQLTaggedNode,
		IEnvironment,
		Observable,
	} from "relay-runtime";
	import type { KeyType } from "relay-runtime/lib/store/ResolverFragments";

	export type FragmentState<T> =
		| { state: "ok"; value: T }
		| { state: "error"; error: unknown }
		| { state: "loading" };

	export function observeFragment<TKey extends KeyType>(
		environment: IEnvironment,
		fragment: GraphQLTaggedNode,
		key: TKey,
	): Observable<FragmentState<TKey[" $data"]>>;

	export function waitForFragmentData<TKey extends KeyType>(
		environment: IEnvironment,
		fragment: GraphQLTaggedNode,
		key: TKey,
	): Promise<TKey[" $data"]>;
}
