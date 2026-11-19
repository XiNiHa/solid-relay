import { render } from "@solidjs/web";
import type { Element } from "solid-js";

export async function wait(times: number) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

export function renderToBody(fn: () => Element) {
	const cleanup = render(fn, document.body);
	onTestFinished(() => cleanup());
}
