import {
	type ConcreteRequest,
	createOperationDescriptor,
	graphql,
	RecordSource,
	Store,
} from "relay-runtime";
import { createMockEnvironment, type MockEnvironment } from "relay-test-utils";
import { createSignal, ErrorBoundary, type JSXElement, Suspense } from "solid-js";
import {
	createPreloadedQuery,
	loadQuery,
	type PreloadedQuery,
	RelayEnvironmentProvider,
} from "solid-relay";
import { page } from "vitest/browser";
import type { createPreloadedQueryTestQuery } from "./__generated__/createPreloadedQueryTestQuery.graphql";
import { renderToBody, wait } from "./utils";

let environment: MockEnvironment;

const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>{props.children}</RelayEnvironmentProvider>
);

describe("createPreloadedQuery", () => {
	const query = graphql`
		query createPreloadedQueryTestQuery($id: ID!) {
			node(id: $id) {
				id
				... on User {
					name
				}
			}
		}
	` as ConcreteRequest;
	const operation = (id: string) => createOperationDescriptor(query, { id });

	const renderScreen = (
		preloaded:
			| PreloadedQuery<createPreloadedQueryTestQuery>
			| Promise<PreloadedQuery<createPreloadedQueryTestQuery>>
			| (() =>
					| PreloadedQuery<createPreloadedQueryTestQuery>
					| Promise<PreloadedQuery<createPreloadedQueryTestQuery>>),
	) =>
		renderToBody(() => (
			<View>
				<Screen preloaded={preloaded} />
			</View>
		));

	const Screen = (props: {
		preloaded:
			| PreloadedQuery<createPreloadedQueryTestQuery>
			| Promise<PreloadedQuery<createPreloadedQueryTestQuery>>
			| (() =>
					| PreloadedQuery<createPreloadedQueryTestQuery>
					| Promise<PreloadedQuery<createPreloadedQueryTestQuery>>);
	}) => {
		const data = createPreloadedQuery<createPreloadedQueryTestQuery>(query, props.preloaded);
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

	it("renders a direct preloaded ref without refetching when the store already has data", async () => {
		environment.commitPayload(operation("1"), {
			node: {
				__typename: "User",
				id: "1",
				name: "Alice",
			},
		});
		const executeWithSource = vi.spyOn(environment, "executeWithSource");
		const preloaded = loadQuery<createPreloadedQueryTestQuery>(environment, query, { id: "1" });

		renderScreen(preloaded);

		expect(executeWithSource).not.toHaveBeenCalled();
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
	});

	it("accepts an accessor returning the current preloaded ref", async () => {
		environment.commitPayload(operation("1"), {
			node: {
				__typename: "User",
				id: "1",
				name: "Alice",
			},
		});
		const preloaded = loadQuery<createPreloadedQueryTestQuery>(environment, query, { id: "1" });

		renderScreen(() => preloaded);

		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
	});

	it("accepts a promise resolving to a preloaded ref", async () => {
		environment.commitPayload(operation("1"), {
			node: {
				__typename: "User",
				id: "1",
				name: "Alice",
			},
		});
		const preloaded = loadQuery<createPreloadedQueryTestQuery>(environment, query, { id: "1" });

		renderScreen(Promise.resolve(preloaded));

		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
	});

	it("disposes the previous ref when the accessor switches", async () => {
		environment.commitPayload(operation("1"), {
			node: {
				__typename: "User",
				id: "1",
				name: "Alice",
			},
		});
		environment.commitPayload(operation("2"), {
			node: {
				__typename: "User",
				id: "2",
				name: "Bob",
			},
		});

		const firstRef = loadQuery<createPreloadedQueryTestQuery>(environment, query, { id: "1" });
		const secondRef = loadQuery<createPreloadedQueryTestQuery>(environment, query, { id: "2" });
		// oxlint-disable-next-line typescript-eslint/no-non-null-assertion: test code, also always exists
		const dispose = vi.spyOn(firstRef.controls!.value, "dispose");
		let setCurrent:
			| ((
					value: PreloadedQuery<createPreloadedQueryTestQuery>,
			  ) => PreloadedQuery<createPreloadedQueryTestQuery>)
			| undefined;

		const SwitchingComp = () => {
			const [current, actualSetCurrent] = createSignal(firstRef);
			setCurrent = actualSetCurrent;
			const data = createPreloadedQuery<createPreloadedQueryTestQuery>(query, current);
			return (
				<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
					<Suspense fallback="Fallback">
						<h1 data-testid="name">{data()?.node?.name}</h1>
					</Suspense>
				</ErrorBoundary>
			);
		};

		renderToBody(() => (
			<View>
				<SwitchingComp />
			</View>
		));

		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");

		setCurrent?.(secondRef);
		await wait(2);

		expect(dispose).toHaveBeenCalledTimes(1);
		await expect.element(page.getByTestId("name")).toHaveTextContent("Bob");
	});

	it("throws when given a disposed preloaded ref", async () => {
		const preloaded = loadQuery<createPreloadedQueryTestQuery>(
			environment,
			query,
			{ id: "1" },
			{ fetchPolicy: "network-only" },
		);
		preloaded.controls?.value.dispose();

		expect(() => renderScreen(preloaded)).toThrow(/Expected preloadedQuery to not be disposed yet/);
	});

	it("throws when the preloaded ref was created with a different environment", async () => {
		const otherEnvironment = createMockEnvironment({
			store: new Store(new RecordSource(), { gcReleaseBufferSize: 0 }),
		});
		const preloaded = loadQuery<createPreloadedQueryTestQuery>(
			otherEnvironment,
			query,
			{ id: "1" },
			{
				fetchPolicy: "network-only",
			},
		);

		expect(() => renderScreen(preloaded)).toThrow(/created with a different environment/);
	});

	it("falls back to a normal fetch when the preloaded ref has no reusable source", async () => {
		const preloaded = loadQuery<createPreloadedQueryTestQuery>(environment, query, { id: "1" });
		renderScreen(preloaded);

		expect(environment.mock.getMostRecentOperation().request.variables).toEqual({ id: "1" });
		environment.mock.resolveMostRecentOperation(() => ({
			data: {
				node: {
					__typename: "User",
					id: "1",
					name: "Alice",
				},
			},
		}));
		await wait(2);

		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
	});
});
