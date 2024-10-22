import type { GraphQLTaggedNode } from "relay-runtime";
import RelayRuntime from "relay-runtime/experimental";
import type {
	KeyType,
	KeyTypeData,
} from "relay-runtime/lib/store/ResolverFragments";
import {
	batch,
	createComputed,
	createMemo,
	createResource,
	onCleanup,
} from "solid-js";
import type { Accessor } from "solid-js";

import { createStore, unwrap } from "solid-js/store";
import { useRelayEnvironment } from "../RelayEnvironment";
import { type DataProxy, makeDataProxy } from "../utils/dataProxy";

type FragmentResult<T> = {
	data: T | undefined;
	error: unknown;
	pending: boolean;
};

export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey>,
): DataProxy<KeyTypeData<TKey>>;
export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null>,
): DataProxy<KeyTypeData<TKey> | null>;
export function createFragment<TKey extends KeyType>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null>,
): DataProxy<KeyTypeData<TKey> | null> {
	const environment = useRelayEnvironment();

	const source = createMemo(() => {
		const k = unwrap(key());
		return (
			k && {
				observable: RelayRuntime.observeFragment(environment, fragment, k),
				promise: RelayRuntime.waitForFragmentData(environment, fragment, k),
			}
		);
	});

	const [resource] = createResource(source, (source) =>
		source.promise.then(() => {}),
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

		const subscription = currentSource.observable.subscribe({
			next(res) {
				batch(() => {
					switch (res.state) {
						case "ok":
							setResult("error", undefined);
							setResult("pending", false);
							setResult("data", res.value);
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
			subscription?.unsubscribe();
		});
	});

	return makeDataProxy(result, resource);
}
