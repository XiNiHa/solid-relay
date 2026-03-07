import type { Disposable, MutationConfig } from "relay-runtime";
import { graphql } from "relay-runtime";
import { createMockEnvironment, type MockEnvironment } from "relay-test-utils";
import type { Accessor, JSXElement } from "solid-js";
import { createMutation, RelayEnvironmentProvider } from "solid-relay";
import { page } from "vitest/browser";
import type { createMutationTestMutation } from "./__generated__/createMutationTestMutation.graphql";
import { renderToBody, wait } from "./utils";

let environment: MockEnvironment;
let commit:
	| ((config: Omit<MutationConfig<createMutationTestMutation>, "mutation">) => Disposable)
	| undefined;
let isMutationInFlight: Accessor<boolean> | undefined;

const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>{props.children}</RelayEnvironmentProvider>
);

describe("createMutation", () => {
	const mutation = graphql`
		mutation createMutationTestMutation($input: RenameUserInput!) @raw_response_type {
			renameUser(input: $input) {
				user {
					id
					name
				}
			}
		}
	`;

	const Comp = () => {
		[commit, isMutationInFlight] = createMutation<createMutationTestMutation>(mutation);
		return <h1 data-testid="pending">{isMutationInFlight?.() ? "pending" : "idle"}</h1>;
	};

	const render = () =>
		renderToBody(() => (
			<View>
				<Comp />
			</View>
		));

	beforeEach(() => {
		environment = createMockEnvironment();
		commit = undefined;
		isMutationInFlight = undefined;
	});

	it("starts idle before any commit", async () => {
		render();
		await expect.element(page.getByTestId("pending")).toHaveTextContent("idle");
	});

	it("becomes pending and forwards the mutation config", async () => {
		render();
		const executeMutation = vi.spyOn(environment, "executeMutation");

		const updater = vi.fn();
		const optimisticResponse = {
			renameUser: {
				user: {
					id: "1",
					name: "Alice",
				},
			},
		};
		commit?.({
			variables: { input: { id: "1", name: "Alice" } },
			optimisticResponse,
			updater,
		});

		await expect.element(page.getByTestId("pending")).toHaveTextContent("pending");
		expect(executeMutation).toHaveBeenCalledTimes(1);

		const [executeConfig] = executeMutation.mock.calls[0] ?? [];
		expect(executeConfig?.optimisticResponse).toEqual(optimisticResponse);
		expect(executeConfig?.updater).toBe(updater);

		const operation = environment.mock.getMostRecentOperation();
		expect(operation.request.node.params.name).toBe("createMutationTestMutation");
		expect(operation.request.variables).toEqual({
			input: { id: "1", name: "Alice" },
		});
	});

	it("returns to idle and calls onCompleted on success", async () => {
		render();

		const onCompleted = vi.fn();
		commit?.({
			variables: { input: { id: "1", name: "Alice" } },
			onCompleted,
		});

		await expect.element(page.getByTestId("pending")).toHaveTextContent("pending");

		environment.mock.resolveMostRecentOperation(() => ({
			data: {
				renameUser: {
					user: {
						__typename: "User",
						id: "1",
						name: "Alice",
					},
				},
			},
		}));
		await wait(2);

		await expect.element(page.getByTestId("pending")).toHaveTextContent("idle");
		expect(onCompleted).toHaveBeenCalledTimes(1);
		expect(onCompleted.mock.calls[0]?.[0]).toMatchObject({
			renameUser: {
				user: {
					id: "1",
					name: "Alice",
				},
			},
		});
	});

	it("returns to idle and calls onError on failure", async () => {
		render();

		const onError = vi.fn();
		commit?.({
			variables: { input: { id: "1", name: "Alice" } },
			onError,
		});

		await expect.element(page.getByTestId("pending")).toHaveTextContent("pending");

		const error = new Error("Mutation error");
		environment.mock.rejectMostRecentOperation(() => error);
		await wait(2);

		await expect.element(page.getByTestId("pending")).toHaveTextContent("idle");
		expect(onError).toHaveBeenCalledWith(error);
	});

	it("returns to idle and calls onUnsubscribe when disposed", async () => {
		render();

		const onUnsubscribe = vi.fn();
		const disposable = commit?.({
			variables: { input: { id: "1", name: "Alice" } },
			onUnsubscribe,
		});

		await expect.element(page.getByTestId("pending")).toHaveTextContent("pending");

		disposable?.dispose();
		await wait(2);

		await expect.element(page.getByTestId("pending")).toHaveTextContent("idle");
		expect(onUnsubscribe).toHaveBeenCalledTimes(1);
	});

	it("keeps the in-flight state until the last concurrent mutation settles", async () => {
		render();

		commit?.({
			variables: { input: { id: "1", name: "Alice" } },
		});
		commit?.({
			variables: { input: { id: "1", name: "Bob" } },
		});

		await expect.element(page.getByTestId("pending")).toHaveTextContent("pending");

		const [firstOperation, secondOperation] = environment.mock.getAllOperations();
		expect(firstOperation.request.node.params.name).toBe("createMutationTestMutation");
		expect(secondOperation.request.node.params.name).toBe("createMutationTestMutation");

		environment.mock.resolve(firstOperation, {
			data: {
				renameUser: {
					user: {
						__typename: "User",
						id: "1",
						name: "Alice",
					},
				},
			},
		});
		await wait(2);

		await expect.element(page.getByTestId("pending")).toHaveTextContent("pending");

		environment.mock.resolve(secondOperation, {
			data: {
				renameUser: {
					user: {
						__typename: "User",
						id: "1",
						name: "Bob",
					},
				},
			},
		});
		await wait(2);

		await expect.element(page.getByTestId("pending")).toHaveTextContent("idle");
	});
});
