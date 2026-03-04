import type { IncomingMessage, ServerResponse } from "node:http";
import { generateHydrationScript, renderToStream } from "solid-js/web";
import { type SetupId, SsrApp } from "./SsrApp";

type HandleRequestArgs = {
	req: IncomingMessage;
	res: ServerResponse;
	setupId: SetupId;
	testRunId: string;
};

export async function handleRequest({
	req,
	res,
	setupId,
	testRunId,
}: HandleRequestArgs) {
	const origin = `http://${req.headers.host ?? "127.0.0.1"}`;
	const stream = renderToStream(
		() => <SsrApp origin={origin} testRunId={testRunId} setupId={setupId} />,
		{
			onCompleteAll({ write }) {
				write("</div></body></html>");
			},
		},
	);

	res.statusCode = 200;
	res.setHeader("content-type", "text/html; charset=utf-8");
	res.setHeader("transfer-encoding", "chunked");
	res.write('<!doctype html><html><head><meta charset="utf-8" />');
	res.write(generateHydrationScript());
	res.write(
		`<script>window.__SSR_TEST_RUN_ID__=${JSON.stringify(testRunId)};window.__SSR_SETUP_ID__=${JSON.stringify(setupId)};</script>`,
	);
	res.write(
		'<script type="module" src="/tests/ssr/harness/client-entry.tsx"></script>',
	);
	res.write('</head><body><div id="app">');
	res.flushHeaders();

	stream.pipe(res);
}
