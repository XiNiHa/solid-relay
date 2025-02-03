import { render } from "@solidjs/testing-library";
import {
	type ConcreteRequest,
	type FetchPolicy,
	type GraphQLTaggedNode,
	RecordSource,
	Store,
	createOperationDescriptor,
	graphql,
} from "relay-runtime";
import { type MockEnvironment, createMockEnvironment } from "relay-test-utils";
import { ErrorBoundary, type JSXElement, Suspense } from "solid-js";
import { RelayEnvironmentProvider, createLazyLoadQuery } from "solid-relay";
import type { createLazyLoadQueryTestQuery } from "./__generated__/createLazyLoadQueryTestQuery.graphql";

let environment: MockEnvironment;
const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>
		{props.children}
	</RelayEnvironmentProvider>
);

async function wait(times: number) {
	if (times <= 0) return;
	await Promise.resolve();
	return await wait(times - 1);
}

describe("createLazyLoadQuery", () => {
	const gqlQuery = graphql`
		query createLazyLoadQueryTestQuery {
			node(id: "1") {
				id
				... on User {
					name
				}
			}
		}
	` as GraphQLTaggedNode & ConcreteRequest;
	const query = createOperationDescriptor(gqlQuery, {});
	const Comp = (props: {
		gqlQuery: GraphQLTaggedNode;
		fetchPolicy: FetchPolicy;
	}) => {
		const data = createLazyLoadQuery<createLazyLoadQueryTestQuery>(
			props.gqlQuery,
			{},
			{ fetchPolicy: () => props.fetchPolicy },
		);
		return (
			<ErrorBoundary
				fallback={(err) => <h1 data-testid="error">{err.message}</h1>}
			>
				<Suspense fallback="Fallback">
					<h1 data-testid="name">{data()?.node?.name}</h1>
				</Suspense>
			</ErrorBoundary>
		);
	};

	beforeEach(() => {
		environment = createMockEnvironment({
			store: new Store(new RecordSource(), { gcReleaseBufferSize: 0 }),
		});
	});

	describe("fetchPolicy: store-or-network", () => {
		const renderScreen = () =>
			render(() => (
				<View>
					<Comp gqlQuery={gqlQuery} fetchPolicy="store-or-network" />
				</View>
			));

		it("fetches and renders the query data", async () => {
			const screen = renderScreen();
			expect(screen.getByText("Fallback")).toBeInTheDocument();
			environment.mock.resolve(gqlQuery, {
				data: { node: { __typename: "User", id: "1", name: "Alice" } },
			});
			await wait(2);
			expect(screen.getByText("Alice")).toBeInTheDocument();
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
		});

		it("still renders when the data is partially missing", async () => {
			const screen = renderScreen();
			expect(screen.getByText("Fallback")).toBeInTheDocument();
			environment.mock.resolve(gqlQuery, {
				data: { node: { __typename: "User", id: "1", name: null } },
			});
			await wait(2);
			expect(screen.getByTestId("name")).toBeEmptyDOMElement();
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
		});

		it("returns without suspending if the data is present", async () => {
			environment.commitPayload(query, {
				node: { __typename: "User", id: "1", name: "Alice" },
			});

			const screen = renderScreen();
			expect(screen.getByText("Alice")).toBeInTheDocument();
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
		});

		it("throws on network error and gets caught by ErrorBoundary", async () => {
			const screen = renderScreen();
			expect(screen.getByText("Fallback")).toBeInTheDocument();

			environment.mock.reject(gqlQuery, new Error("Network error"));
			await wait(2);
			expect(screen.getByTestId("error")).toHaveTextContent("Network error");
			expect(screen.queryByText("name")).not.toBeInTheDocument();
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
		});

		it("ignores field error and render null", async () => {
			const screen = renderScreen();
			expect(screen.getByText("Fallback")).toBeInTheDocument();

			environment.mock.resolve(gqlQuery, {
				data: { node: null },
				errors: [{ message: "Field error", path: ["node"] }],
			});
			await wait(2);
			expect(screen.getByTestId("name")).toBeEmptyDOMElement();
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
		});
	});

	describe("fetchPolicy: store-only", async () => {
		const renderScreen = () =>
			render(() => (
				<View>
					<Comp gqlQuery={gqlQuery} fetchPolicy="store-only" />
				</View>
			));

		it("renders correctly if data is already present", async () => {
			environment.commitPayload(query, {
				node: { id: "1", __typename: "User", name: "Alice" },
			});
			const screen = renderScreen();
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
			expect(screen.getByTestId("name")).toHaveTextContent("Alice");
		});

		it("doesn't trigger fetch even on no data", async () => {
			const screen = renderScreen();
			expect(environment.mock.isLoading(query, {})).toBe(false);
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
			expect(screen.getByTestId("name")).toBeEmptyDOMElement();
		});

		it("updates correctly even had no data initially", async () => {
			const screen = renderScreen();
			expect(environment.mock.isLoading(query, {})).toBe(false);
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
			expect(screen.getByTestId("name")).toBeEmptyDOMElement();

			environment.commitPayload(query, {
				node: { id: "1", __typename: "User", name: "Alice" },
			});
			await wait(2);
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
			expect(screen.getByTestId("name")).toHaveTextContent("Alice");
		});
	});

	describe("@throwOnFieldError", async () => {
		const gqlQuery = graphql`
			query createLazyLoadQueryTestToeQuery @throwOnFieldError {
				node(id: "1") {
					id
					... on User {
						name
					}
				}
			}
		` as GraphQLTaggedNode & ConcreteRequest;
		const renderScreen = (fetchPolicy: FetchPolicy = "store-or-network") =>
			render(() => (
				<View>
					<Comp gqlQuery={gqlQuery} fetchPolicy={fetchPolicy} />
				</View>
			));

		it("throws on field error and gets caught by ErrorBoundary", async () => {
			const screen = renderScreen();
			expect(screen.getByText("Fallback")).toBeInTheDocument();

			environment.mock.resolve(gqlQuery, {
				data: { node: null },
				errors: [{ message: "Field error", path: ["node"] }],
			});
			await wait(2);
			expect(screen.getByTestId("error").textContent).toMatch(
				"Unexpected response payload",
			);
			expect(screen.queryByText("name")).not.toBeInTheDocument();
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
		});

		it("throws on missing data and gets caught by ErrorBoundary", async () => {
			const screen = renderScreen("store-only");
			expect(screen.getByTestId("error").textContent).toMatch(
				"Missing expected data",
			);
			expect(screen.queryByText("name")).not.toBeInTheDocument();
			expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
		});
	});
});
