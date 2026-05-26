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
import { batch, createResource, createSignal, untrack } from "solid-js";
import { reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { isServer } from "solid-js/web";
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
			pending: true;
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

	const resultUpdateObserver = {
		next(res) {
			queueMicrotask(() => {
				batch(() => {
					setResult("data", undefined);
					setResult("error", undefined);

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
					}
				});
			});
		},
	} satisfies Observer<FragmentState<unknown>>;
	const [subscription, setSubscription] = createSignal<Subscription>();

	const setResultQueue: unknown[][] = [];
	let setResult: SetStoreFunction<FragmentResult<unknown>> = (...args: unknown[]) => {
		setResultQueue.push(args);
	};

	let fetchedInSameEnv = false;
	const [resource] = createResource(
		() => {
			return batch(() => {
				untrack(subscription)?.unsubscribe();
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
		async ({ key, parentOperation }) => {
			setResult("pending", true);
			fetchedInSameEnv = true;

			if (parentOperation) {
				await new Promise<void>((resolve, reject) => {
					parentOperation.subscribe({
						complete: resolve,
						error: reject,
					});
				});
			}

			const source = observeFragment(environment(), fragment, key as KeyType);

			return new Promise<true>((resolve, reject) => {
				setSubscription(
					source.subscribe({
						next(res) {
							resultUpdateObserver.next(res);
							if (res.state === "ok") resolve(true);
							else if (res.state === "error") reject(res.error);
						},
					}),
				);
			}).finally(() => {
				if (isServer) {
					subscription()?.unsubscribe();
					setSubscription(undefined);
				}
			});
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
								observeFragment(environment(), fragment, k as KeyType).subscribe(
									resultUpdateObserver,
								),
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
