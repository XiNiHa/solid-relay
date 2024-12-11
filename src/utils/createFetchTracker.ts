import type { Subscription } from "relay-runtime";
import { createSignal, onCleanup } from "solid-js";

export function createFetchTracker() {
	let currentSubscription: Subscription | null = null;
	const [isFetching, setIsFetching] = createSignal(false);

	const disposeFetch = () => {
		if (currentSubscription != null) {
			currentSubscription.unsubscribe();
			currentSubscription = null;
		}
		setIsFetching(false);
	};

	const startFetch = (subscription: Subscription) => {
		currentSubscription = subscription;
		setIsFetching(true);
	};

	const completeFetch = () => {
		currentSubscription = null;
		setIsFetching(false);
	};

	onCleanup(disposeFetch);

	return {
		disposeFetch,
		startFetch,
		completeFetch,
		isFetching,
	};
}
