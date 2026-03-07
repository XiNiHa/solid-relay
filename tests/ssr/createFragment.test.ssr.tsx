import { commands } from "vitest/browser";
import { mountTestRunFrame } from "./harness/utils";

describe("createFragment SSR", () => {
	it("renders the shell first and then hydrates the fragment content", async () => {
		const { testRunId, url } = await commands.startSsrTestRun("createFragment/Main");
		const frame = mountTestRunFrame(url);
		onTestFailed(() => commands.stopSsrTestRun({ testRunId }));

		await expect.element(frame.getByText("Fallback")).toBeInTheDocument();
		await expect.element(frame.getByTestId("name")).not.toBeInTheDocument();

		await commands.sendSsrTestRunChunk({
			testRunId,
			chunk: {
				data: {
					node: {
						__typename: "User",
						id: "1",
						name: "Alice",
					},
				},
			},
		});
		await commands.stopSsrTestRun({ testRunId });

		await expect.element(frame.getByText("Fallback")).not.toBeInTheDocument();
		await expect.element(frame.getByTestId("name")).toHaveTextContent("Alice");
		await expect.element(frame.getByTestId("error")).not.toBeInTheDocument();
	});
});
