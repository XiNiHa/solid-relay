import type { JSXElement } from "solid-js";
import { render, renderToStream } from "solid-js/web";

export async function wait(times: number) {
	if (times <= 0) return;
	await Promise.resolve();
	return await wait(times - 1);
}

export function renderToBody(fn: () => JSXElement) {
	const cleanup = render(fn, document.body);
	onTestFinished(() => cleanup());
}

export function renderStream(fn: () => JSXElement) {
	const { promise: shellCompleted, resolve: resolveCompleteShell } =
		Promise.withResolvers<void>();
	const { promise: allCompleted, resolve: resolveCompleteAll } =
		Promise.withResolvers<void>();
	const stream = renderToStream(fn, {
		onCompleteShell: () => resolveCompleteShell(),
		onCompleteAll: () => resolveCompleteAll(),
	});
	const decoder = new TextDecoder();
	const { readable, writable } = new TransformStream<Uint8Array, string>({
		transform(chunk, controller) {
			controller.enqueue(decoder.decode(chunk));
		},
	});
	stream.pipeTo(writable);

	return {
		shellCompleted,
		allCompleted,
		readable,
	};
}
