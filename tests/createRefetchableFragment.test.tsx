import {
	type ConcreteRequest,
	createOperationDescriptor,
	graphql,
	RecordSource,
	Store,
} from "relay-runtime";
import { createMockEnvironment, type MockEnvironment } from "relay-test-utils";
import { ErrorBoundary, type JSXElement, Suspense } from "solid-js";
import {
	createLazyLoadQuery,
	createRefetchableFragment,
	type DataStore,
	RelayEnvironmentProvider,
} from "solid-relay";
import { page } from "vitest/browser";
import type { createRefetchableFragmentTest_user$key } from "./__generated__/createRefetchableFragmentTest_user.graphql";
import type { createRefetchableFragmentTestOwnerQuery } from "./__generated__/createRefetchableFragmentTestOwnerQuery.graphql";
import type { createRefetchableFragmentTestRefetchQuery } from "./__generated__/createRefetchableFragmentTestRefetchQuery.graphql";
import { renderToBody, wait } from "./utils";

let environment: MockEnvironment;

const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>{props.children}</RelayEnvironmentProvider>
);

describe("createRefetchableFragment", () => {
	const ownerQuery = graphql`
		query createRefetchableFragmentTestOwnerQuery($id: ID!) {
			node(id: $id) {
				id
				... on User {
					...createRefetchableFragmentTest_user
				}
			}
		}
	` as ConcreteRequest;
	const ownerOperation = (id: string) => createOperationDescriptor(ownerQuery, { id });
	const fragment = graphql`
		fragment createRefetchableFragmentTest_user on User
		@refetchable(queryName: "createRefetchableFragmentTestRefetchQuery") {
			id
			name
		}
	`;

	let userStore:
		| DataStore<{ readonly id: string; readonly name: string } | null | undefined>
		| undefined;
	let refetch:
		| ReturnType<
				typeof createRefetchableFragment<
					createRefetchableFragmentTestRefetchQuery,
					createRefetchableFragmentTest_user$key
				>
		  >[1]
		| undefined;

	const Child = (props: {
		fragmentKey: createRefetchableFragmentTest_user$key | null | undefined;
	}) => {
		const [data, actualRefetch] = createRefetchableFragment<
			createRefetchableFragmentTestRefetchQuery,
			createRefetchableFragmentTest_user$key
		>(fragment, () => props.fragmentKey);
		userStore = data;
		refetch = actualRefetch;
		return <h1 data-testid="name">{data()?.name}</h1>;
	};

	const QueryScreen = (props: { id: string }) => {
		const data = createLazyLoadQuery<createRefetchableFragmentTestOwnerQuery>(ownerQuery, {
			id: props.id,
		});
		return (
			<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
				<Suspense fallback="Fallback">
					<Child fragmentKey={data()?.node} />
				</Suspense>
			</ErrorBoundary>
		);
	};

	beforeEach(() => {
		environment = createMockEnvironment({
			store: new Store(new RecordSource(), { gcReleaseBufferSize: 0 }),
		});
		userStore = undefined;
		refetch = undefined;
	});

	it("exposes fragment data store getters from the owner query result", async () => {
		environment.commitPayload(ownerOperation("1"), {
			node: { __typename: "User", id: "1", name: "Alice" },
		});

		renderToBody(() => (
			<View>
				<QueryScreen id="1" />
			</View>
		));

		await wait(2);
		expect(userStore).toBeDefined();
		expect(userStore?.pending).toBe(false);
		expect(userStore?.error).toBeUndefined();
		expect(userStore?.()?.name).toBe("Alice");
		expect(userStore?.latest?.name).toBe("Alice");
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
	});

	it("refetches with the inherited id when called without an override", async () => {
		environment.commitPayload(ownerOperation("1"), {
			node: { __typename: "User", id: "1", name: "Alice" },
		});

		renderToBody(() => (
			<View>
				<QueryScreen id="1" />
			</View>
		));
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await wait(2);

		refetch?.({});
		await wait(1);

		expect(environment.mock.getMostRecentOperation().request.node.params.name).toBe(
			"createRefetchableFragmentTestRefetchQuery",
		);
		expect(environment.mock.getMostRecentOperation().request.variables).toEqual({ id: "1" });

		environment.mock.resolveMostRecentOperation(() => ({
			data: { node: { __typename: "User", id: "1", name: "Bob" } },
		}));
		await wait(2);

		await expect.element(page.getByTestId("name")).toHaveTextContent("Bob");
	});

	it("refetches with overridden variables when provided", async () => {
		environment.commitPayload(ownerOperation("1"), {
			node: { __typename: "User", id: "1", name: "Alice" },
		});

		renderToBody(() => (
			<View>
				<QueryScreen id="1" />
			</View>
		));
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await wait(2);

		refetch?.({ id: "2" });
		await wait(1);

		expect(environment.mock.getMostRecentOperation().request.variables).toEqual({ id: "2" });

		environment.mock.resolveMostRecentOperation(() => ({
			data: { node: { __typename: "User", id: "2", name: "Bob" } },
		}));
		await wait(2);

		await expect.element(page.getByTestId("name")).toHaveTextContent("Bob");
	});

	it("calls onComplete with null on success", async () => {
		const onComplete = vi.fn();
		environment.commitPayload(ownerOperation("1"), {
			node: { __typename: "User", id: "1", name: "Alice" },
		});

		renderToBody(() => (
			<View>
				<QueryScreen id="1" />
			</View>
		));
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await wait(2);

		refetch?.({}, { onComplete });
		await wait(1);
		environment.mock.resolveMostRecentOperation(() => ({
			data: { node: { __typename: "User", id: "1", name: "Bob" } },
		}));
		await wait(2);

		expect(onComplete).toHaveBeenCalledWith(null);
	});

	it("calls onComplete with an error and renders the error fallback on network failure", async () => {
		const onComplete = vi.fn();
		environment.commitPayload(ownerOperation("1"), {
			node: { __typename: "User", id: "1", name: "Alice" },
		});

		renderToBody(() => (
			<View>
				<QueryScreen id="1" />
			</View>
		));
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await wait(2);

		refetch?.({}, { onComplete });
		await wait(1);

		const error = new Error("Network error");
		environment.mock.rejectMostRecentOperation(() => error);
		await wait(2);

		expect(onComplete).toHaveBeenCalledWith(error);
		await expect.element(page.getByTestId("error")).toHaveTextContent("Network error");
		await expect.element(page.getByTestId("name")).not.toBeInTheDocument();
	});

	it("warns when refetch is called with a null fragment key", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		renderToBody(() => (
			<View>
				<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
					<Suspense fallback="Fallback">
						<Child fragmentKey={null} />
					</Suspense>
				</ErrorBoundary>
			</View>
		));
		await wait(1);

		const disposable = refetch?.({ id: "1" });
		await wait(1);

		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("Unexpected call to `refetch` while using a null fragment ref"),
		);

		disposable?.dispose();
		warn.mockRestore();
	});
});
