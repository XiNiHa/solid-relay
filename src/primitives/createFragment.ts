import type {
	GraphQLResponse,
	GraphQLTaggedNode,
	Subscribable,
} from "relay-runtime";
import { observeFragment } from "relay-runtime/experimental";
import {
	batch,
	createComputed,
	createMemo,
	createResource,
	onCleanup,
} from "solid-js";
import type { Accessor } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { useRelayEnvironment } from "../RelayEnvironment";
import type { KeyType, KeyTypeData } from "../types/keyType";
import { type DataProxy, makeDataProxy } from "../utils/dataProxy";

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
): DataProxy<KeyTypeData<TKey>>;
export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
): DataProxy<KeyTypeData<TKey> | null | undefined>;
export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
): DataProxy<KeyTypeData<TKey> | null | undefined> {
	return createFragmentInternal(fragment, key);
}

export function createFragmentInternal<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
	options?: Accessor<{
		parentOperation: Subscribable<GraphQLResponse> | null | undefined;
	}>,
): DataProxy<KeyTypeData<TKey> | null | undefined> {
	const environment = useRelayEnvironment();

	const source = createMemo(() => {
		const k = unwrap(key());
		return k && observeFragment(environment(), fragment, k);
	});

	const [resource] = createResource(
		() => {
			const s = source();
			if (!s) return;
			return { source: s, parentOperation: options?.().parentOperation };
		},
		async ({ source, parentOperation }) => {
			if (parentOperation) {
				await new Promise<void>((resolve, reject) => {
					parentOperation.subscribe({
						complete: resolve,
						error: reject,
					});
				});
			}

			return new Promise<true>((resolve, reject) => {
				const subscription = source.subscribe({
					next(value) {
						if (value.state === "ok") {
							resolve(true);
							queueMicrotask(() => subscription.unsubscribe());
						} else if (value.state === "error") {
							reject(value.error);
							queueMicrotask(() => subscription.unsubscribe());
						}
					},
				});
			});
		},
	);

	const initialResult: FragmentResult<TKey[" $data"]> = {
		data: undefined,
		error: undefined,
		pending: false,
	};
	const [result, setResult] =
		createStore<FragmentResult<TKey[" $data"]>>(initialResult);

	createComputed(() => {
		setResult(initialResult);
		const currentSource = source();
		if (!currentSource) return;

		setResult("pending", true);

		const subscription = currentSource.subscribe({
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
		});

		onCleanup(() => {
			subscription.unsubscribe();
		});
	});

	return makeDataProxy(result, resource);
}
