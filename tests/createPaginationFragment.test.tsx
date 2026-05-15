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
	createPaginationFragment,
	RelayEnvironmentProvider,
} from "solid-relay";
import { page } from "vitest/browser";
import type { createPaginationFragmentTest_query$key } from "./__generated__/createPaginationFragmentTest_query.graphql";
import type { createPaginationFragmentTestPaginationQuery } from "./__generated__/createPaginationFragmentTestPaginationQuery.graphql";
import type { createPaginationFragmentTestQuery } from "./__generated__/createPaginationFragmentTestQuery.graphql";
import { renderToBody, wait } from "./utils";

let environment: MockEnvironment;

const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>{props.children}</RelayEnvironmentProvider>
);

describe("createPaginationFragment", () => {
	const gqlQuery = graphql`
		query createPaginationFragmentTestQuery(
			$first: Int
			$after: String
			$last: Int
			$before: String
		) {
			...createPaginationFragmentTest_query
				@arguments(first: $first, after: $after, last: $last, before: $before)
		}
	` as ConcreteRequest;
	const fragment = graphql`
		fragment createPaginationFragmentTest_query on Query
		@argumentDefinitions(
			first: { type: "Int" }
			after: { type: "String" }
			last: { type: "Int" }
			before: { type: "String" }
		)
		@refetchable(queryName: "createPaginationFragmentTestPaginationQuery") {
			users(first: $first, after: $after, last: $last, before: $before)
				@connection(key: "createPaginationFragmentTest_query_users") {
				edges {
					cursor
					node {
						id
						name
					}
				}
				pageInfo {
					hasNextPage
					hasPreviousPage
					startCursor
					endCursor
				}
			}
		}
	`;
	const initialVariables = {
		first: 2,
		after: null,
		before: null,
		last: null,
	} satisfies createPaginationFragmentTestQuery["variables"];
	const query = createOperationDescriptor(gqlQuery, initialVariables);

	let paginationStore:
		| ReturnType<
				typeof createPaginationFragment<
					createPaginationFragmentTestPaginationQuery,
					createPaginationFragmentTest_query$key
				>
		  >
		| undefined;

	const Child = (props: {
		fragmentKey: createPaginationFragmentTest_query$key | null | undefined;
	}) => {
		paginationStore = createPaginationFragment(fragment, () => props.fragmentKey);

		return (
			<ul data-testid="names">
				{paginationStore()?.users?.edges?.map((edge) => (
					<li>{edge?.node?.name}</li>
				))}
			</ul>
		);
	};

	const QueryScreen = (props: { variables: createPaginationFragmentTestQuery["variables"] }) => {
		const data = createLazyLoadQuery<createPaginationFragmentTestQuery>(gqlQuery, props.variables);
		return (
			<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
				<Suspense fallback="Fallback">
					<Child fragmentKey={data()} />
				</Suspense>
			</ErrorBoundary>
		);
	};

	beforeEach(() => {
		environment = createMockEnvironment({
			store: new Store(new RecordSource(), { gcReleaseBufferSize: 0 }),
		});
		paginationStore = undefined;
	});

	it("exposes pagination helpers and derives connection state from the initial payload", async () => {
		environment.commitPayload(query, {
			users: {
				edges: [
					{
						cursor: "cursor-1",
						node: {
							__typename: "User",
							id: "1",
							name: "Alice",
						},
					},
					{
						cursor: "cursor-2",
						node: {
							__typename: "User",
							id: "2",
							name: "Bob",
						},
					},
				],
				pageInfo: {
					hasNextPage: true,
					hasPreviousPage: false,
					startCursor: "cursor-1",
					endCursor: "cursor-2",
				},
			},
		});

		renderToBody(() => (
			<View>
				<QueryScreen variables={initialVariables} />
			</View>
		));

		await expect.element(page.getByText("Alice")).toBeInTheDocument();
		await expect.element(page.getByText("Bob")).toBeInTheDocument();
		expect(typeof paginationStore?.loadNext).toBe("function");
		expect(typeof paginationStore?.loadPrevious).toBe("function");
		expect(typeof paginationStore?.refetch).toBe("function");
		expect(paginationStore?.hasNext).toBe(true);
		expect(paginationStore?.hasPrevious).toBe(false);
	});

	it("loads the next page, appends edges, and resets isLoadingNext", async () => {
		environment.commitPayload(query, {
			users: {
				edges: [
					{
						cursor: "cursor-1",
						node: {
							__typename: "User",
							id: "1",
							name: "Alice",
						},
					},
					{
						cursor: "cursor-2",
						node: {
							__typename: "User",
							id: "2",
							name: "Bob",
						},
					},
				],
				pageInfo: {
					hasNextPage: true,
					hasPreviousPage: false,
					startCursor: "cursor-1",
					endCursor: "cursor-2",
				},
			},
		});

		renderToBody(() => (
			<View>
				<QueryScreen variables={initialVariables} />
			</View>
		));
		await expect.element(page.getByText("Alice")).toBeInTheDocument();
		await expect.element(page.getByText("Bob")).toBeInTheDocument();
		await wait(2);

		const onComplete = vi.fn();
		paginationStore?.loadNext(2, { onComplete });
		await wait(1);

		expect(paginationStore?.isLoadingNext).toBe(true);
		expect(environment.mock.getMostRecentOperation().request.variables).toEqual(
			expect.objectContaining({
				first: 2,
				after: "cursor-2",
			}),
		);

		environment.mock.resolveMostRecentOperation(() => ({
			data: {
				users: {
					edges: [
						{
							cursor: "cursor-3",
							node: {
								__typename: "User",
								id: "3",
								name: "Carol",
							},
						},
						{
							cursor: "cursor-4",
							node: {
								__typename: "User",
								id: "4",
								name: "Dave",
							},
						},
					],
					pageInfo: {
						hasNextPage: false,
						hasPreviousPage: false,
						startCursor: "cursor-3",
						endCursor: "cursor-4",
					},
				},
			},
		}));
		await wait(2);

		expect(paginationStore?.isLoadingNext).toBe(false);
		expect(paginationStore?.hasNext).toBe(false);
		expect(paginationStore?.hasPrevious).toBe(false);
		expect(onComplete).toHaveBeenCalledWith(null);
		await expect.element(page.getByText("Alice")).toBeInTheDocument();
		await expect.element(page.getByText("Bob")).toBeInTheDocument();
		await expect.element(page.getByText("Carol")).toBeInTheDocument();
		await expect.element(page.getByText("Dave")).toBeInTheDocument();
	});

	it("loads the previous page and resets isLoadingPrevious", async () => {
		const onComplete = vi.fn();
		const backwardVariables = {
			first: null,
			after: null,
			last: 2,
			before: "cursor-3",
		};
		environment.commitPayload(createOperationDescriptor(gqlQuery, backwardVariables), {
			users: {
				edges: [
					{
						cursor: "cursor-3",
						node: {
							__typename: "User",
							id: "3",
							name: "Carol",
						},
					},
					{
						cursor: "cursor-4",
						node: {
							__typename: "User",
							id: "4",
							name: "Dave",
						},
					},
				],
				pageInfo: {
					hasNextPage: false,
					hasPreviousPage: true,
					startCursor: "cursor-3",
					endCursor: "cursor-4",
				},
			},
		});

		renderToBody(() => (
			<View>
				<QueryScreen variables={backwardVariables} />
			</View>
		));
		await expect.element(page.getByText("Carol")).toBeInTheDocument();
		await expect.element(page.getByText("Dave")).toBeInTheDocument();
		await wait(2);

		paginationStore?.loadPrevious(2, { onComplete });
		await wait(1);

		expect(paginationStore?.isLoadingPrevious).toBe(true);
		expect(environment.mock.getMostRecentOperation().request.variables).toEqual(
			expect.objectContaining({
				before: "cursor-3",
				last: 2,
			}),
		);

		environment.mock.resolveMostRecentOperation(() => ({
			data: {
				users: {
					edges: [
						{
							cursor: "cursor-1",
							node: {
								__typename: "User",
								id: "1",
								name: "Alice",
							},
						},
						{
							cursor: "cursor-2",
							node: {
								__typename: "User",
								id: "2",
								name: "Bob",
							},
						},
					],
					pageInfo: {
						hasNextPage: false,
						hasPreviousPage: false,
						startCursor: "cursor-1",
						endCursor: "cursor-2",
					},
				},
			},
		}));
		await wait(2);

		expect(paginationStore?.isLoadingPrevious).toBe(false);
		expect(paginationStore?.hasNext).toBe(false);
		expect(paginationStore?.hasPrevious).toBe(false);
		expect(onComplete).toHaveBeenCalledWith(null);
		await expect.element(page.getByText("Alice")).toBeInTheDocument();
		await expect.element(page.getByText("Bob")).toBeInTheDocument();
		await expect.element(page.getByText("Carol")).toBeInTheDocument();
		await expect.element(page.getByText("Dave")).toBeInTheDocument();
	});

	it("resets isLoadingNext and forwards the error when pagination fails", async () => {
		const onComplete = vi.fn();
		environment.commitPayload(query, {
			users: {
				edges: [
					{
						cursor: "cursor-1",
						node: {
							__typename: "User",
							id: "1",
							name: "Alice",
						},
					},
				],
				pageInfo: {
					hasNextPage: true,
					hasPreviousPage: false,
					startCursor: "cursor-1",
					endCursor: "cursor-1",
				},
			},
		});

		renderToBody(() => (
			<View>
				<QueryScreen variables={initialVariables} />
			</View>
		));
		await expect.element(page.getByText("Alice")).toBeInTheDocument();
		await wait(2);

		paginationStore?.loadNext(1, { onComplete });
		await wait(1);

		const error = new Error("Pagination failed");
		environment.mock.rejectMostRecentOperation(() => error);
		await wait(2);

		expect(paginationStore?.isLoadingNext).toBe(false);
		expect(onComplete).toHaveBeenCalledWith(error);
	});

	it("clears the load-more state when refetch replaces an in-flight pagination request", async () => {
		environment.commitPayload(query, {
			users: {
				edges: [
					{
						cursor: "cursor-1",
						node: {
							__typename: "User",
							id: "1",
							name: "Alice",
						},
					},
					{
						cursor: "cursor-2",
						node: {
							__typename: "User",
							id: "2",
							name: "Bob",
						},
					},
				],
				pageInfo: {
					hasNextPage: true,
					hasPreviousPage: false,
					startCursor: "cursor-1",
					endCursor: "cursor-2",
				},
			},
		});

		renderToBody(() => (
			<View>
				<QueryScreen variables={initialVariables} />
			</View>
		));
		await expect.element(page.getByText("Alice")).toBeInTheDocument();
		await expect.element(page.getByText("Bob")).toBeInTheDocument();
		await wait(2);

		paginationStore?.loadNext(2);
		await wait(1);
		expect(paginationStore?.isLoadingNext).toBe(true);

		paginationStore?.refetch({
			first: 1,
			after: null,
			last: null,
			before: null,
		});
		await wait(1);

		expect(paginationStore?.isLoadingNext).toBe(false);

		environment.mock.resolveMostRecentOperation(() => ({
			data: {
				users: {
					edges: [
						{
							cursor: "cursor-9",
							node: {
								__typename: "User",
								id: "9",
								name: "Zara",
							},
						},
					],
					pageInfo: {
						hasNextPage: false,
						hasPreviousPage: false,
						startCursor: "cursor-9",
						endCursor: "cursor-9",
					},
				},
			},
		}));
		await wait(2);

		await expect.element(page.getByText("Zara")).toBeInTheDocument();
	});

	it("keeps hasNext and hasPrevious false when the fragment key is absent", async () => {
		renderToBody(() => (
			<View>
				<Child fragmentKey={undefined} />
			</View>
		));
		await wait(1);

		expect(paginationStore?.hasNext).toBe(false);
		expect(paginationStore?.hasPrevious).toBe(false);
	});
});
