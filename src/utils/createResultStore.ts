import { createStore, getOwner, reconcile, type StoreSetter } from "solid-js";

/**
 * A function-form `createStore` whose derive pushes results from an external
 * source through `commit`. Projection drafts cannot be reconciled and store
 * setters throw inside owned scopes, so `commit` writes the draft while the
 * derive runs or another reactive scope is active, and otherwise reconciles by
 * `__id` through the setter to keep proxy identity on observed paths.
 */
export function createResultStore<T extends object>(
	derive: (draft: T, commit: (next: T) => void) => void,
	seed: T,
): T {
	let setter: StoreSetter<T> | undefined;
	// Narrow the overload: TypeScript cannot resolve NoFn<T> for a generic T.
	const createDerivedStore = createStore as <U extends object>(
		fn: (draft: U) => void,
		seed: U,
	) => [U, StoreSetter<U>];
	const [store, set] = createDerivedStore<T>((draft) => {
		let running = true;
		const commit = (next: T) => {
			if (running || !setter || getOwner()) Object.assign(draft, next);
			else setter(reconcile(next, "__id"));
		};
		derive(draft, commit);
		running = false;
	}, seed);
	setter = set;
	return store;
}
