import { createSignal, onCleanup, onMount } from "solid-js";

export const useIsMounted = () => {
	const [isMounted, setIsMounted] = createSignal(false);
	onMount(() => {
		setIsMounted(true);
		onCleanup(() => setIsMounted(false));
	});
	return isMounted;
};
