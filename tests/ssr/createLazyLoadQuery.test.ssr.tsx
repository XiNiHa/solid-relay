import { commands } from "vitest/browser";
import { mountTestRunFrame } from "./harness/utils";

describe("streaming SSR", () => {
	it("renders shell first, then resolves streamed data", async () => {
		const { testRunId, url } = await commands.startSsrTestRun("createLazyLoadQuery/Main");
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

	it("renders shell first, then renders error fallback", async () => {
		const { testRunId, url } = await commands.startSsrTestRun("createLazyLoadQuery/Main");
		const frame = mountTestRunFrame(url);
		onTestFailed(() => commands.stopSsrTestRun({ testRunId }));

		await expect.element(frame.getByText("Fallback")).toBeInTheDocument();
		await expect.element(frame.getByTestId("error")).not.toBeInTheDocument();

		await commands.sendSsrTestRunChunk({
			testRunId,
			error: new Error("Unexpected Error"),
		});
		await commands.stopSsrTestRun({ testRunId });

		await expect.element(frame.getByText("Fallback")).not.toBeInTheDocument();
		await expect.element(frame.getByTestId("name")).not.toBeInTheDocument();
		await expect.element(frame.getByTestId("error")).toHaveTextContent("HTTP Error");
	});

	describe("parallel", () => {
		it("renders both queries independently", async () => {
			const { testRunId, url } = await commands.startSsrTestRun("createLazyLoadQuery/Parallel");
			const frame = mountTestRunFrame(url);
			onTestFailed(() => commands.stopSsrTestRun({ testRunId }));

			await expect.element(frame.getByText("Fallback a")).toBeInTheDocument();
			await expect.element(frame.getByText("Fallback b")).toBeInTheDocument();
			await expect.element(frame.getByTestId("a")).not.toBeInTheDocument();
			await expect.element(frame.getByTestId("b")).not.toBeInTheDocument();

			await commands.sendSsrTestRunChunk({
				testRunId,
				fetchCount: 0,
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
			await commands.completeSsrTestRunQuery({ testRunId, fetchCount: 0 });

			await expect.element(frame.getByText("Fallback a")).not.toBeInTheDocument();
			await expect.element(frame.getByText("Fallback b")).toBeInTheDocument();
			await expect.element(frame.getByTestId("a")).toHaveTextContent("Hello Alice");
			await expect.element(frame.getByTestId("error")).not.toBeInTheDocument();

			await commands.sendSsrTestRunChunk({
				testRunId,
				fetchCount: 1,
				chunk: {
					data: {
						node: {
							__typename: "User",
							id: "2",
							name: "Bob",
						},
					},
				},
			});
			await commands.completeSsrTestRunQuery({ testRunId, fetchCount: 1 });
			await commands.stopSsrTestRun({ testRunId });

			await expect.element(frame.getByText("Fallback a")).not.toBeInTheDocument();
			await expect.element(frame.getByText("Fallback b")).not.toBeInTheDocument();
			await expect.element(frame.getByTestId("a")).toHaveTextContent("Hello Alice");
			await expect.element(frame.getByTestId("b")).toHaveTextContent("Goodbye Bob");
			await expect.element(frame.getByTestId("error")).not.toBeInTheDocument();
		});
	});

	describe.skip("flicker", () => {
		it("no flicker happens", async () => {
			const { testRunId, url } = await commands.startSsrTestRun("createLazyLoadQuery/Flicker");
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
			await expect.element(frame.getByTestId("name")).toHaveTextContent("no error Alice server");
			await expect.element(frame.getByTestId("error")).not.toBeInTheDocument();

			await expect
				.element(frame.getByTestId("query-hydrated"))
				.toHaveTextContent("Query Hydrated: true");
			await frame.getByTestId("rerender").click();
			await expect.element(frame.getByTestId("name")).toHaveTextContent("no error Alice browser");
			await expect.element(frame.getByTestId("error")).not.toBeInTheDocument();
		});
	});
});
