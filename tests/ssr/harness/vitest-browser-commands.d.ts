import type { GraphQLSingularResponse } from "relay-runtime";
import type { SetupFileId, SetupId } from "./SsrApp";
import "vitest/browser";

declare module "vitest/browser" {
	interface BrowserCommands {
		startSsrTestRun: <TSetupFile extends SetupFileId, TSetupId extends SetupId<TSetupFile>>(
			setupId: TSetupId,
		) => Promise<{ testRunId: string; url: string }>;
		sendSsrTestRunChunk: (
			input: {
				testRunId: string;
				fetchCount?: number;
			} & ({ chunk: GraphQLSingularResponse; error?: never } | { chunk?: never; error: Error }),
		) => Promise<void>;
		completeSsrTestRunQuery: (input: { testRunId: string; fetchCount?: number }) => Promise<void>;
		stopSsrTestRun: (input: { testRunId: string }) => Promise<void>;
	}
}
