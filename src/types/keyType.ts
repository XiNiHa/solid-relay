import type { FragmentType } from "relay-runtime";

export type KeyType<TData = unknown> = Readonly<{
	" $data"?: TData | undefined;
	" $fragmentSpreads": FragmentType;
}>;

export type KeyTypeData<
	TKey extends KeyType<TData>,
	TData = unknown,
> = Required<TKey>[" $data"];
