import { type GraphQLSingularResponse, ReplaySubject } from "relay-runtime";
import type { Plugin } from "vitest/config";
import type { BrowserCommand } from "vitest/node";
import type { SetupId } from "./SsrApp";

const testRuns = new Map<
	string,
	{
		setupId: SetupId;
		replaySubjects: ReplaySubject<GraphQLSingularResponse>[];
	}
>();

export function ssrTestPlugin(): Plugin {
	return {
		name: "ssr-test-plugin",
		configureServer(viteServer) {
			viteServer.middlewares.use(async (req, res, next) => {
				try {
					if (!req.url) return next();
					const requestUrl = new URL(req.url, "http://localhost");
					if (!requestUrl.pathname.startsWith("/__ssr")) return next();

					const testRunId = requestUrl.searchParams.get("testRunId");
					if (!testRunId) return next();
					const testRun = testRuns.get(testRunId);
					if (!testRun) {
						res.statusCode = 404;
						res.setHeader("content-type", "application/json; charset=utf-8");
						res.end(JSON.stringify({ message: "Test run not found" }));
						return;
					}
					res.setHeader("cache-control", "no-store");

					if (requestUrl.pathname === "/__ssr/graphql") {
						const fetchCount = Number(requestUrl.searchParams.get("fetchCount") ?? 0);
						let isStreaming: boolean | undefined;
						const subscription = (testRun.replaySubjects[fetchCount] ??=
							new ReplaySubject()).subscribe({
							next(response) {
								if (isStreaming == null) {
									isStreaming = response.extensions?.is_final === false;
								}
								writePart(response);
							},
							error(error: unknown) {
								writePart(error, 500);
								cleanup();
							},
							complete() {
								cleanup();
							},
						});
						const writePart = (payload: unknown, status = 200) => {
							if (!res.headersSent) {
								res.statusCode = status;
								res.setHeader(
									"content-type",
									isStreaming ? 'multipart/mixed; boundary="-"' : "application/json",
								);
								res.flushHeaders();
								if (isStreaming) res.write("\r\n---\r\n");
							}
							res.write(
								isStreaming
									? `content-type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n---\r\n`
									: JSON.stringify(payload),
							);
						};
						const cleanup = () => {
							if (isStreaming) res.write("-----");
							res.end();
							subscription.unsubscribe();
						};
						return;
					}

					const mod = (await viteServer.ssrLoadModule(
						"/tests/ssr/harness/server-entry.tsx",
					)) as typeof import("./server-entry");
					await mod.handleRequest({
						req,
						res,
						testRunId,
						setupId: testRun.setupId,
					});
				} catch (error) {
					next(error);
				}
			});
		},
	};
}

const startSsrTestRun: BrowserCommand<[SetupId]> = async (_, setupId) => {
	const id = `ssr-test-${crypto.randomUUID()}`;
	testRuns.set(id, { setupId, replaySubjects: [] });
	return {
		testRunId: id,
		url: `/__ssr?testRunId=${encodeURIComponent(id)}`,
	};
};

const sendSsrTestRunChunk: BrowserCommand<
	[
		{
			testRunId: string;
			fetchCount?: number;
		} & ({ chunk: GraphQLSingularResponse; error?: never } | { chunk?: never; error: Error }),
	]
> = async (_ctx, input) => {
	const testRun = testRuns.get(input.testRunId);
	if (!testRun) {
		throw new Error(`Unknown test run '${input.testRunId}'`);
	}
	const replaySubject = (testRun.replaySubjects[input.fetchCount ?? 0] ??= new ReplaySubject());
	if (input.chunk) replaySubject.next(input.chunk);
	else replaySubject.error(input.error);
};

const completeSsrTestRunQuery: BrowserCommand<
	[{ testRunId: string; fetchCount?: number }]
> = async (_ctx, input) => {
	const testRun = testRuns.get(input.testRunId);
	if (!testRun) return;
	testRun.replaySubjects[input.fetchCount ?? 0].complete();
};

const stopSsrTestRun: BrowserCommand<[{ testRunId: string }]> = async (_ctx, input) => {
	const testRun = testRuns.get(input.testRunId);
	if (!testRun) return;
	for (const subject of testRun.replaySubjects) subject.complete();
	testRuns.delete(input.testRunId);
};

export const ssrBrowserCommands = {
	startSsrTestRun,
	sendSsrTestRunChunk,
	completeSsrTestRunQuery,
	stopSsrTestRun,
};
