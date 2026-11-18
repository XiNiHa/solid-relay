import { createSignal, onSettled } from "solid-js";

export const useIsMounted = (): (() => boolean) => {
	const [isMounted, setIsMounted] = createSignal(false);
	onSettled(() => {
		setIsMounted(true);
		return () => setIsMounted(false);
	});
	return isMounted;
};
