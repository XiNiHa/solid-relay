import type {
	GraphQLResponse,
	GraphQLTaggedNode,
	Observer,
	Subscribable,
	Subscription,
} from "relay-runtime";
import { observeFragment } from "relay-runtime/experimental.js";
import {
	ArrayKeyType,
	ArrayKeyTypeData,
	FragmentState,
	KeyType,
	KeyTypeData,
} from "relay-runtime/lib/store/FragmentTypes";
import { type Accessor, createMemo, createStore, onCleanup, reconcile, snapshot } from "solid-js";
import { useRelayEnvironment } from "../RelayEnvironment";
import { createDataStore, type DataStore } from "../utils/dataStore";
import { cleanSnapshot } from "../utils/snapshot";

type FragmentResult<T> =
	| {
			data: T;
			error: undefined;
			pending: false;
	  }
	| {
			data: undefined;
			error: unknown;
			pending: false;
	  }
	| {
			data: undefined;
			error: undefined;
			pending: boolean;
	  };

/**
 * Reads fragment data from a fragment key and subscribes to updates.
 *
 * Use this primitive when a parent query or fragment passes a generated
 * `...Fragment$key` reference into your component.
 *
 * @param fragment - GraphQL fragment document.
 * @param key - Fragment key accessor passed from a parent operation.
 * @param options.deferStream - Whether to defer the SSR stream until the data is resolved.
 * @returns A `DataStore` containing the fragment data state.
 */
export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey>,
	options?: {
		deferStream?: boolean;
	},
): DataStore<KeyTypeData<TKey>>;
export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
	options?: {
		deferStream?: boolean;
	},
): DataStore<KeyTypeData<TKey> | null | undefined>;
export function createFragment<TKey extends ArrayKeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey>,
	options?: {
		deferStream?: boolean;
	},
): DataStore<ArrayKeyTypeData<TKey>>;
export function createFragment<TKey extends MaybeArray<ArrayKeyType>>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey>,
	options?: {
		deferStream?: boolean;
	},
): DataStore<MaybeArray<ArrayKeyTypeData<RequiredArray<TKey>>>>;
export function createFragment<TKey extends ArrayKeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
	options?: {
		deferStream?: boolean;
	},
): DataStore<ArrayKeyTypeData<TKey> | null | undefined>;
export function createFragment<TKey extends MaybeArray<ArrayKeyType>>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
	options?: {
		deferStream?: boolean;
	},
): DataStore<MaybeArray<ArrayKeyTypeData<RequiredArray<TKey>>> | null | undefined>;
export function createFragment<TKey extends KeyType | ArrayKeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
	options?: {
		deferStream?: boolean;
	},
): DataStore<Data<TKey> | null | undefined> {
	return createFragmentInternal(fragment, key, undefined, options);
}

export type MaybeArray<T> =
	T extends ReadonlyArray<unknown> ? ReadonlyArray<T[number] | null | undefined> : never;
type RequiredArray<T> =
	T extends ReadonlyArray<(infer U) | null | undefined> ? ReadonlyArray<U> : never;

type Data<TKey extends KeyType | ArrayKeyType | MaybeArray<ArrayKeyType>> = TKey extends KeyType
	? KeyTypeData<TKey>
	: TKey extends MaybeArray<ArrayKeyType>
		? ArrayKeyTypeData<RequiredArray<TKey>>
		: TKey extends ArrayKeyType
			? ArrayKeyTypeData<TKey>
			: never;

export function createFragmentInternal<
	TKey extends KeyType | ArrayKeyType | MaybeArray<ArrayKeyType>,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
	options?: Accessor<{
		parentOperation: Subscribable<GraphQLResponse> | null | undefined;
	}>,
	createResourceOptions?: {
		deferStream?: boolean;
	},
): DataStore<Data<TKey> | null | undefined> {
	const environment = useRelayEnvironment();
	let ready = createReady();

	const [result] = createStore<FragmentResult<unknown>>(
		(draft) => {
			const r = createReady();
			ready = r; // The gate always reads the latest run's `ready`; callbacks resolve their own `r`.
			const env = environment();
			const k = snapshot(key());

			if (!k) {
				draft.data = undefined;
				draft.error = undefined;
				draft.pending = false;
				r.resolve(true);
				return;
			}

			let sub: Subscription | undefined;
			let live = true;

			const start = () => {
				if (!live) return;
				sub = observeFragment(env, fragment, k as KeyType).subscribe({
					next(res) {
						switch (res.state) {
							case "ok":
								reconcile(
									{ data: cleanSnapshot(res.value), error: undefined, pending: false },
									"__id",
								)(draft);
								r.resolve(true);
								break;
							case "error":
								draft.data = undefined;
								draft.error = res.error;
								draft.pending = false;
								r.reject(res.error);
								break;
							case "loading":
								draft.data = undefined;
								draft.error = undefined;
								draft.pending = true;
								break;
						}
					},
				}) satisfies Observer<FragmentState<unknown>>;
			};

			const parentOperation = options?.().parentOperation;
			if (parentOperation) {
				draft.pending = true;
				new Promise<void>((resolve, reject) => {
					parentOperation.subscribe({ complete: resolve, error: reject });
				}).then(start, (error) => {
					if (!live) return;
					draft.data = undefined;
					draft.error = error;
					draft.pending = false;
					r.reject(error);
				});
			} else {
				start();
			}

			onCleanup(() => {
				live = false;
				sub?.unsubscribe();
			});
		},
		{ data: undefined, error: undefined, pending: false },
	);

	const gate = createMemo(
		() => {
			if (result.error) throw result.error;
			return result.pending ? ready.promise : true;
		},
		{ deferStream: createResourceOptions?.deferStream },
	);

	return createDataStore(result, gate) as DataStore<Data<TKey> | null | undefined>;
}

function createReady() {
	const ready = Promise.withResolvers<true>();
	ready.promise.catch(() => {}); // Avoid an unhandled rejection if it rejects before the gate reads it.
	return ready;
}
