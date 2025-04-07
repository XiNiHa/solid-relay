import type { JSXElement } from "solid-js";
import { render } from "solid-js/web";

export async function wait(times: number) {
	if (times <= 0) return;
	await Promise.resolve();
	return await wait(times - 1);
}

export function renderToBody(fn: () => JSXElement) {
	const cleanup = render(fn, document.body);
	onTestFinished(() => cleanup());
}
