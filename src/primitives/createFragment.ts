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
import type { Accessor, Setter, Signal } from "solid-js";
import { batch, createEffect, createResource, createSignal, onCleanup, untrack } from "solid-js";
import { reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
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

	const subscribeResult = (
		source: Subscribable<FragmentState<unknown>>,
		onResult?: (res: FragmentState<unknown>) => void,
	) => {
		return source.subscribe({
			next(res) {
				batch(() => {
					switch (res.state) {
						case "ok":
							setResult("error", undefined);
							setResult("pending", false);
							setResult("data", reconcile(cleanSnapshot(res.value), { key: "__id", merge: true }));
							break;
						case "error":
							setResult("data", undefined);
							setResult("error", res.error);
							setResult("pending", false);
							break;
						case "loading":
							setResult("data", undefined);
							setResult("error", undefined);
							setResult("pending", true);
							break;
					}
				});
				onResult?.(res);
			},
		} satisfies Observer<FragmentState<unknown>>);
	};
	const [subscription, setSubscription] = createSignal<Subscription>();
	createEffect(() => {
		const sub = subscription();
		if (sub) {
			onCleanup(() => {
				sub.unsubscribe();
			});
		}
	});

	const setResultQueue: unknown[][] = [];
	let setResult: SetStoreFunction<FragmentResult<unknown>> = (...args: unknown[]) => {
		setResultQueue.push(args);
	};

	let fetchedInSameEnv = false;
	const [resource] = createResource(
		() => {
			return batch(() => {
				setSubscription(undefined);
				setResult("pending", false);

				void environment();
				const k = unwrap(key());
				if (!k) {
					setResult("data", undefined);
					setResult("error", undefined);
					return;
				}
				return { key: k, parentOperation: options?.().parentOperation };
			});
		},
		({ key, parentOperation }) => {
			setResult("pending", true);
			fetchedInSameEnv = true;

			const observe = (): true | Promise<true> => {
				let settled: { ok: true } | { ok: false; error: unknown } | undefined;
				let resolve: ((value: true) => void) | undefined;
				let reject: ((error: unknown) => void) | undefined;
				setSubscription(
					subscribeResult(observeFragment(environment(), fragment, key as KeyType), (res) => {
						if (res.state === "ok") {
							settled ??= { ok: true };
							resolve?.(true);
						} else if (res.state === "error") {
							settled ??= { ok: false, error: res.error };
							reject?.(res.error);
						}
					}),
				);
				// Resolve synchronously when the data is already in the store, so the
				// resource never enters a pending state (and never suspends) for it.
				if (settled?.ok) return true;
				if (settled) return Promise.reject(settled.error);
				return new Promise<true>((res, rej) => {
					resolve = res;
					reject = rej;
				});
			};

			if (!parentOperation) return observe();
			return new Promise<void>((resolve, reject) => {
				parentOperation.subscribe({
					complete: resolve,
					error: reject,
				});
			}).then(observe);
		},
		{
			deferStream: createResourceOptions?.deferStream,
			storage(init) {
				const [value, setValue] = createSignal(init);

				return [
					value,
					(next: Setter<true | undefined>) => {
						const current = untrack(value);
						const nextValue = typeof next === "function" ? next(current) : next;
						const k = unwrap(untrack(key));

						if (!fetchedInSameEnv && !current && nextValue && k) {
							setSubscription(
								subscribeResult(observeFragment(environment(), fragment, k as KeyType)),
							);
						}

						setValue(() => nextValue);
					},
				] as Signal<true | undefined>;
			},
		},
	);

	const store = createDataStore<FragmentResult<unknown>>(
		{
			data: undefined,
			error: undefined,
			pending: false,
		},
		() => resource,
	);
	for (const args of setResultQueue) {
		store[1].apply(undefined, args as never);
	}
	setResult = store[1];

	return store[0] as DataStore<Data<TKey> | null | undefined>;
}
