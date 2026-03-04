import type { JSXElement } from "solid-js";
import { render } from "solid-js/web";

export async function wait(times: number) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

export function renderToBody(fn: () => JSXElement) {
	const cleanup = render(fn, document.body);
	onTestFinished(() => cleanup());
}
