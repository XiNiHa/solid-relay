import { onCleanup } from "solid-js";

/**
 * Returns whether the calling owner is still alive: `true` from creation until
 * its cleanup runs. Solid 2.0 runs `onSettled` only after a microtask, so a
 * mount flag would ignore calls made right after render.
 */
export const useIsMounted = (): (() => boolean) => {
	let alive = true;
	onCleanup(() => {
		alive = false;
	});
	return () => alive;
};
