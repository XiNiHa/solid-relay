import type {
	GraphQLResponse,
	GraphQLTaggedNode,
	Subscribable,
	Subscription,
} from "relay-runtime";
import { observeFragment } from "relay-runtime/experimental.js";
import { batch, createResource, createSignal, untrack } from "solid-js";
import type { Accessor } from "solid-js";
import { type SetStoreFunction, reconcile, unwrap } from "solid-js/store";
import { isServer } from "solid-js/web";
import { useRelayEnvironment } from "../RelayEnvironment";
import type { KeyType, KeyTypeData } from "../types/keyType";
import { type DataStore, createDataStore } from "../utils/dataStore";

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

export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey>,
): DataStore<KeyTypeData<TKey>>;
export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
): DataStore<KeyTypeData<TKey> | null | undefined>;
export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
): DataStore<KeyTypeData<TKey> | null | undefined> {
	return createFragmentInternal(fragment, key);
}

export function createFragmentInternal<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
	options?: Accessor<{
		parentOperation: Subscribable<GraphQLResponse> | null | undefined;
	}>,
): DataStore<KeyTypeData<TKey> | null | undefined> {
	const environment = useRelayEnvironment();

	const initialResult: FragmentResult<TKey[" $data"]> = {
		data: undefined,
		error: undefined,
		pending: false,
	};

	type FragmentObserver = Parameters<
		ReturnType<typeof observeFragment>["subscribe"]
	>[0];
	const resultUpdateObserver = {
		next(res) {
			batch(() => {
				switch (res.state) {
					case "ok":
						setResult("error", undefined);
						setResult("pending", false);
						setResult(
							"data",
							reconcile(res.value as Record<string, unknown>, {
								key: "__id",
								merge: true,
							}),
						);
						break;
					case "error":
						setResult("data", undefined);
						setResult("error", res.error);
						setResult("pending", false);
						break;
				}
			});
		},
	} satisfies FragmentObserver;
	const [subscription, setSubscription] = createSignal<Subscription>();

	const setResultQueue: unknown[][] = [];
	let setResult: SetStoreFunction<FragmentResult<TKey[" $data"]>> = (
		...args: unknown[]
	) => {
		setResultQueue.push(args);
	};

	const [resource] = createResource(
		() => {
			batch(() => {
				untrack(subscription)?.unsubscribe();
				setSubscription(undefined);
				setResult(initialResult);
			});

			void environment();
			const k = unwrap(key());
			if (!k) return;
			return { key: k, parentOperation: options?.().parentOperation };
		},
		async ({ key, parentOperation }) => {
			setResult("pending", true);

			if (parentOperation) {
				await new Promise<void>((resolve, reject) => {
					parentOperation.subscribe({
						complete: resolve,
						error: reject,
					});
				});
			}

			const source = observeFragment(environment(), fragment, key);

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
			onHydrated(source) {
				if (!source) return;
				setSubscription(
					observeFragment(environment(), fragment, source.key).subscribe(
						resultUpdateObserver,
					),
				);
			},
		},
	);

	const store = createDataStore<FragmentResult<TKey[" $data"]>>(
		initialResult,
		resource,
	);
	for (const args of setResultQueue) {
		store[1].apply(undefined, args as never);
	}
	setResult = store[1];

	return store[0];
}
