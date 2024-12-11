import {
	type ReaderFragment,
	type SingularReaderSelector,
	type Subscription,
	__internal,
	getSelector,
} from "relay-runtime";
import {
	type Accessor,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
} from "solid-js";
import invariant from "tiny-invariant";
import { useRelayEnvironment } from "../RelayEnvironment";
import type { KeyType } from "../types/keyType";

export function useIsOperationNodeActive(
	fragmentNode: ReaderFragment,
	fragmentRef: Accessor<KeyType | null | undefined>,
): Accessor<boolean> {
	const environment = useRelayEnvironment();
	const selector = createMemo(() => getSelector(fragmentNode, fragmentRef()));
	const observable = createMemo(() => {
		const s = selector();
		if (s == null) return null;
		invariant(
			s.kind === "SingularReaderSelector",
			"useIsOperationNodeActive: Plural fragments are not supported.",
		);
		return __internal.getObservableForActiveRequest(
			environment(),
			(s as SingularReaderSelector).owner,
		);
	});
	const [isActive, setIsActive] = createSignal(false);

	createEffect(() => {
		let subscription: Subscription | undefined;
		const obs = observable();
		setIsActive(obs != null);
		if (obs != null) {
			const onCompleteOrError = () => setIsActive(false);
			subscription = obs.subscribe({
				complete: onCompleteOrError,
				error: onCompleteOrError,
			});
		}
		onCleanup(() => {
			subscription?.unsubscribe();
		});
	});

	return isActive;
}
