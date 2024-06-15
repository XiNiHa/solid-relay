import { createDeepSignal } from "@solid-primitives/resource";
import { getFragmentIdentifier, isPromise } from "relay-runtime";
import type { IEnvironment, ReaderFragment } from "relay-runtime";
import {
	createEffect,
	createMemo,
	createResource,
	onCleanup,
	onMount,
} from "solid-js";
import type { ResourceReturn } from "solid-js";

import { getFragmentResourceForEnvironment } from "../utils/FragmentResource";
import type { FragmentResult } from "../utils/FragmentResource";

type FragmentNode<TFragmentData> = {
	data: TFragmentData;
	disableStoreUpdates: () => void;
	enableStoreUpdates: () => void;
};

export function createFragmentNode<TFragmentData>(
	environment: IEnvironment,
	fragmentNode: ReaderFragment,
	fragmentRef: unknown,
	componentDisplayName: string,
): ResourceReturn<FragmentNode<TFragmentData>> {
	const FragmentResource = getFragmentResourceForEnvironment(environment);

	let isMounted = false;
	const fragmentIdentifier = createMemo(() =>
		getFragmentIdentifier(fragmentNode, fragmentRef),
	);

	const getFragmentResult = () =>
		FragmentResource.readWithIdentifier(
			fragmentNode,
			fragmentRef,
			fragmentIdentifier(),
			componentDisplayName,
		);

	const [fragmentResult, { refetch: refreshFragmentResult }] = createResource(
		fragmentIdentifier,
		() => {
			function fetcher(
				fragmentResult: FragmentResult | Promise<void>,
			): FragmentResult | Promise<FragmentResult> {
				if (isPromise(fragmentResult)) {
					return fragmentResult.then(() => fetcher(getFragmentResult()));
				}

				return fragmentResult;
			}
			return fetcher(getFragmentResult());
		},
	);

	let isListeningForUpdates = true;
	function enableStoreUpdates(fragmentResult: FragmentResult) {
		isListeningForUpdates = true;
		const [didMissUpdates] =
			FragmentResource.checkMissedUpdates(fragmentResult);
		if (didMissUpdates) {
			handleDataUpdate();
		}
	}

	function disableStoreUpdates() {
		isListeningForUpdates = false;
	}

	function handleDataUpdate() {
		if (!isMounted || !isListeningForUpdates) return;

		void refreshFragmentResult();
	}

	onMount(() => {
		isMounted = true;
	});

	createEffect(() => {
		const result = fragmentResult();
		if (!result) return;

		const disposable = FragmentResource.subscribe(result, handleDataUpdate);
		onCleanup(() => disposable.dispose());
	});

	return createResource(
		fragmentResult,
		(result) => ({
			data: result.data as TFragmentData,
			disableStoreUpdates,
			enableStoreUpdates() {
				enableStoreUpdates(result);
			},
		}),
		{ storage: createDeepSignal },
	);
}
