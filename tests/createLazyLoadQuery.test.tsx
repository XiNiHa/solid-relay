import {
	type ConcreteRequest,
	createOperationDescriptor,
	type FetchPolicy,
	type GraphQLTaggedNode,
	graphql,
	RecordSource,
	Store,
} from "relay-runtime";
import { createMockEnvironment, type MockEnvironment } from "relay-test-utils";
import { createSignal, ErrorBoundary, type JSXElement, Suspense } from "solid-js";
import { createLazyLoadQuery, type DataStore, RelayEnvironmentProvider } from "solid-relay";
import { page } from "vitest/browser";
import type { createLazyLoadQueryTestQuery } from "./__generated__/createLazyLoadQueryTestQuery.graphql";
import { renderToBody, wait } from "./utils";

let environment: MockEnvironment;
const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>{props.children}</RelayEnvironmentProvider>
);

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
	const Comp = (props: { gqlQuery: GraphQLTaggedNode; fetchPolicy: FetchPolicy }) => {
		const data = createLazyLoadQuery<createLazyLoadQueryTestQuery>(
			props.gqlQuery,
			{},
			{ fetchPolicy: () => props.fetchPolicy },
		);
		return (
			<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
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

	it("exposes data store getters", async () => {
		let store: DataStore<createLazyLoadQueryTestQuery["response"]> | undefined;
		const Comp = () => {
			store = createLazyLoadQuery<createLazyLoadQueryTestQuery>(gqlQuery, {});
			return (
				<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
					<Suspense fallback="Fallback">
						<h1 data-testid="getter-name">{store()?.node?.name}</h1>
					</Suspense>
				</ErrorBoundary>
			);
		};

		renderToBody(() => (
			<View>
				<Comp />
			</View>
		));

		expect(store).toBeDefined();
		expect(store?.pending).toBe(true);
		expect(store?.error).toBeUndefined();
		expect(store?.()).toBeUndefined();
		expect(store?.latest).toBeUndefined();

		environment.mock.resolve(gqlQuery, {
			data: { node: { __typename: "User", id: "1", name: "Alice" } },
		});
		await wait(2);

		expect(store?.pending).toBe(false);
		expect(store?.error).toBeUndefined();
		expect(store?.()?.node?.name).toBe("Alice");
		expect(store?.latest?.node?.name).toBe("Alice");
	});

	describe("fetchPolicy: store-or-network", () => {
		const render = () =>
			renderToBody(() => (
				<View>
					<Comp gqlQuery={gqlQuery} fetchPolicy="store-or-network" />
				</View>
			));

		it("fetches and renders the query data", async () => {
			render();
			await expect.element(page.getByText("Fallback")).toBeInTheDocument();
			environment.mock.resolve(gqlQuery, {
				data: { node: { __typename: "User", id: "1", name: "Alice" } },
			});
			await wait(2);
			await expect.element(page.getByText("Alice")).toBeInTheDocument();
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
		});

		it("still renders when the data is partially missing", async () => {
			render();
			await expect.element(page.getByText("Fallback")).toBeInTheDocument();
			environment.mock.resolve(gqlQuery, {
				data: { node: { __typename: "User", id: "1", name: null } },
			});
			await wait(2);
			await expect.element(page.getByTestId("name")).toBeEmptyDOMElement();
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
		});

		it("returns without suspending if the data is present", async () => {
			environment.commitPayload(query, {
				node: { __typename: "User", id: "1", name: "Alice" },
			});

			render();
			await expect.element(page.getByText("Alice")).toBeInTheDocument();
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
		});

		it("throws on network error and gets caught by ErrorBoundary", async () => {
			render();
			await expect.element(page.getByText("Fallback")).toBeInTheDocument();

			environment.mock.reject(gqlQuery, new Error("Network error"));
			await wait(2);
			await expect.element(page.getByTestId("error")).toHaveTextContent("Network error");
			await expect.element(page.getByText("name")).not.toBeInTheDocument();
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
		});

		it("ignores field error and render null", async () => {
			render();
			await expect.element(page.getByText("Fallback")).toBeInTheDocument();

			environment.mock.resolve(gqlQuery, {
				data: { node: null },
				errors: [{ message: "Field error", path: ["node"] }],
			});
			await wait(2);
			await expect.element(page.getByTestId("name")).toBeEmptyDOMElement();
			await expect.element(page.getByTestId("error")).not.toBeInTheDocument();
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
		});
	});

	describe("fetchPolicy: store-only", () => {
		const render = () =>
			renderToBody(() => (
				<View>
					<Comp gqlQuery={gqlQuery} fetchPolicy="store-only" />
				</View>
			));

		it("renders correctly if data is already present", async () => {
			environment.commitPayload(query, {
				node: { id: "1", __typename: "User", name: "Alice" },
			});
			render();
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
			await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		});

		it("doesn't trigger fetch even on no data", async () => {
			render();
			expect(environment.mock.isLoading(query, {})).toBe(false);
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
			await expect.element(page.getByTestId("name")).toBeEmptyDOMElement();
		});

		it("updates correctly even had no data initially", async () => {
			render();
			expect(environment.mock.isLoading(query, {})).toBe(false);
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
			await expect.element(page.getByTestId("name")).toBeEmptyDOMElement();

			environment.commitPayload(query, {
				node: { id: "1", __typename: "User", name: "Alice" },
			});
			await wait(2);
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
			await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		});
	});

	it.each(["store-and-network", "network-only"] as const)(
		"fetches even when data exists if fetchPolicy: %s",
		async (fetchPolicy) => {
			const executeWithSource = vi.spyOn(environment, "executeWithSource");
			environment.commitPayload(query, {
				node: { __typename: "User", id: "1", name: "Alice" },
			});

			renderToBody(() => (
				<View>
					<Comp gqlQuery={gqlQuery} fetchPolicy={fetchPolicy} />
				</View>
			));

			await wait(1);
			expect(executeWithSource).toHaveBeenCalledTimes(1);
			environment.mock.resolve(gqlQuery, {
				data: { node: { __typename: "User", id: "1", name: "Bob" } },
			});
			await wait(2);
			await expect.element(page.getByText("Bob")).toBeInTheDocument();
		},
	);

	describe("@throwOnFieldError", () => {
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
			renderToBody(() => (
				<View>
					<Comp gqlQuery={gqlQuery} fetchPolicy={fetchPolicy} />
				</View>
			));

		it("throws on field error and gets caught by ErrorBoundary", async () => {
			renderScreen();
			await expect.element(page.getByText("Fallback")).toBeInTheDocument();

			environment.mock.resolve(gqlQuery, {
				data: { node: null },
				errors: [{ message: "Field error", path: ["node"] }],
			});
			await wait(2);
			await expect
				.element(page.getByTestId("error"))
				.toHaveTextContent("Unexpected response payload");
			await expect.element(page.getByText("name")).not.toBeInTheDocument();
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
		});

		it("throws on missing data and gets caught by ErrorBoundary", async () => {
			renderScreen("store-only");
			await expect.element(page.getByTestId("error")).toHaveTextContent("Missing expected data");
			await expect.element(page.getByText("name")).not.toBeInTheDocument();
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
		});
	});

	describe("coverage edge cases", () => {
		it("does not fetch when variables accessor returns undefined", async () => {
			const Comp = () => {
				const data = createLazyLoadQuery<createLazyLoadQueryTestQuery>(
					gqlQuery,
					() => undefined as unknown as Record<string, never>,
				);
				return <h1 data-testid="undefined-variables">{data()?.node?.name}</h1>;
			};

			renderToBody(() => (
				<View>
					<Comp />
				</View>
			));

			expect(environment.mock.isLoading(query, {})).toBe(false);
			await expect.element(page.getByTestId("undefined-variables")).toBeEmptyDOMElement();
		});

		it("reuses cache for concurrent consumers and refetches after final disposal", async () => {
			const executeWithSource = vi.spyOn(environment, "executeWithSource");
			const [showA, setShowA] = createSignal(true);
			const [showB, setShowB] = createSignal(true);
			const MultiComp = () => (
				<>
					{showA() && <Comp gqlQuery={gqlQuery} fetchPolicy="network-only" />}
					{showB() && <Comp gqlQuery={gqlQuery} fetchPolicy="network-only" />}
				</>
			);

			renderToBody(() => (
				<View>
					<MultiComp />
				</View>
			));

			expect(executeWithSource).toHaveBeenCalledTimes(1);
			environment.mock.resolve(gqlQuery, {
				data: { node: { __typename: "User", id: "1", name: "Alice" } },
			});
			await wait(2);
			expect(executeWithSource).toHaveBeenCalledTimes(1);
			await expect.element(page.getByTestId("name").first()).toHaveTextContent("Alice");

			setShowA(false);
			await wait(2);
			expect(executeWithSource).toHaveBeenCalledTimes(1);

			setShowB(false);
			await wait(2);

			setShowA(true);
			await wait(2);
			expect(executeWithSource).toHaveBeenCalledTimes(2);

			environment.mock.resolve(gqlQuery, {
				data: { node: { __typename: "User", id: "1", name: "Bob" } },
			});
			await wait(2);
			expect(executeWithSource).toHaveBeenCalledTimes(2);
			await expect.element(page.getByTestId("name")).toHaveTextContent("Bob");
		});

		it("defaults live queries to store-and-network and cleans up on unmount", async () => {
			const liveQuery = {
				...(gqlQuery as ConcreteRequest),
				params: {
					...gqlQuery.params,
					metadata: { ...gqlQuery.params.metadata, live: true },
				},
			} as GraphQLTaggedNode & ConcreteRequest;
			const liveOperation = createOperationDescriptor(liveQuery, {});
			const executeWithSource = vi.spyOn(environment, "executeWithSource");
			environment.commitPayload(liveOperation, {
				node: { __typename: "User", id: "1", name: "Alice" },
			});

			const LiveComp = () => {
				const data = createLazyLoadQuery<createLazyLoadQueryTestQuery>(liveQuery, {});
				return (
					<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
						<Suspense fallback="Fallback">
							<h1 data-testid="live-name">{data()?.node?.name}</h1>
						</Suspense>
					</ErrorBoundary>
				);
			};

			renderToBody(() => (
				<View>
					<LiveComp />
				</View>
			));
			await wait(1);
			expect(executeWithSource).toHaveBeenCalledTimes(1);
		});
	});
});
