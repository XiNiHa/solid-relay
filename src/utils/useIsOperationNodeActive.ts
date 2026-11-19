import {
	__internal,
	getSelector,
	type ReaderFragment,
	type SingularReaderSelector,
	type Subscription,
} from "relay-runtime";
import { KeyType } from "relay-runtime/lib/store/FragmentTypes";
import { type Accessor, createEffect, createMemo, createSignal } from "solid-js";
import invariant from "tiny-invariant";
import { useRelayEnvironment } from "../RelayEnvironment";

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

	createEffect(
		() => ({ obs: observable() }),
		({ obs }) => {
			let subscription: Subscription | undefined;
			setIsActive(obs != null);
			if (obs != null) {
				const onCompleteOrError = () => setIsActive(false);
				subscription = obs.subscribe({
					complete: onCompleteOrError,
					error: onCompleteOrError,
				});
			}

			return () => {
				subscription?.unsubscribe();
			};
		},
	);

	return isActive;
}
