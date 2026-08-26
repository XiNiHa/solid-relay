import type { DataID, Disposable } from "relay-runtime";
import { createEffect, createMemo, onCleanup, untrack } from "solid-js";
import { useRelayEnvironment } from "../RelayEnvironment";
import { access, type MaybeAccessor } from "../utils/access";

const sameDataIDs = (a: readonly DataID[], b: readonly DataID[]) =>
	a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Subscribes a callback to the invalidation state of the given data IDs.
 *
 * Any time the invalidation state of the given data IDs changes (either one of the records
 * or the whole store gets invalidated), the provided callback is called.
 * When the data IDs (or the environment) change, the subscription is re-established and
 * the previous one is disposed. The subscription is automatically disposed on cleanup.
 *
 * The callback may be given directly or through an accessor. Since a zero-argument callback and an
 * accessor are indistinguishable at runtime, the value is resolved when an invalidation happens:
 * `callback` is invoked, and if it returns a function, that function is invoked as the actual
 * callback. The accessor is read untracked, so changing it never re-establishes the subscription.
 *
 * @param dataIDs - Data IDs to observe, or an accessor returning them.
 * @param callback - Called whenever the invalidation state of the data IDs changes, or an accessor
 * returning such a callback.
 * @returns A disposable that can be used to stop the subscription early.
 */
export function createSubscriptionToInvalidationState(
	dataIDs: MaybeAccessor<readonly DataID[]>,
	callback: MaybeAccessor<() => void>,
): Disposable {
	const environment = useRelayEnvironment();
	let disposable: Disposable | null = null;

	const stableDataIDs = createMemo(() => [...access(dataIDs)].sort(), undefined, {
		equals: sameDataIDs,
	});

	createEffect(() => {
		const store = environment().getStore();
		const invalidationState = store.lookupInvalidationState(stableDataIDs());
		const current = store.subscribeToInvalidationState(invalidationState, () => {
			const resolved = untrack(callback as () => unknown);
			if (typeof resolved === "function") resolved();
		});
		disposable = current;

		onCleanup(() => {
			current.dispose();
			if (disposable === current) disposable = null;
		});
	});

	return {
		dispose: () => {
			disposable?.dispose();
			disposable = null;
		},
	};
}
