import {
	createOperationDescriptor,
	type GraphQLTaggedNode,
	graphql,
	ConcreteRequest,
} from "relay-runtime";
import { createMockEnvironment, type MockEnvironment } from "relay-test-utils";
import type { Accessor, JSXElement } from "solid-js";
import { ErrorBoundary, Show, Suspense, createSignal } from "solid-js";
import {
	createPreloadedQuery,
	createQueryLoader,
	loadQuery as preloadQuery,
	type PreloadedQuery,
	RelayEnvironmentProvider,
} from "solid-relay";
import { page } from "vitest/browser";
import type { createQueryLoaderTestQuery } from "./__generated__/createQueryLoaderTestQuery.graphql";
import { renderToBody, wait } from "./utils";

let environment: MockEnvironment;
let overrideEnvironment: MockEnvironment;
let queryRef: Accessor<PreloadedQuery<createQueryLoaderTestQuery> | null | undefined> | undefined;
let loadQueryRef:
	| ((
			variables: createQueryLoaderTestQuery["variables"],
			options?: {
				fetchPolicy?: "store-or-network" | "store-and-network" | "network-only" | "store-only";
				networkCacheConfig?: Record<string, unknown>;
				__environment?: MockEnvironment | null | undefined;
			},
	  ) => void)
	| undefined;
let disposeQueryRef: (() => void) | undefined;

const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>{props.children}</RelayEnvironmentProvider>
);

describe("createQueryLoader", () => {
	const gqlQuery = graphql`
		query createQueryLoaderTestQuery($id: ID!) {
			node(id: $id) {
				id
				... on User {
					name
				}
			}
		}
	` as ConcreteRequest;
	const operation = createOperationDescriptor(gqlQuery, { id: "1" });
	const liveQuery: ConcreteRequest = {
		...gqlQuery,
		params: {
			...gqlQuery.params,
			metadata: {
				...gqlQuery.params.metadata,
				live: true,
			},
		},
	};

	const Child = (props: { queryRef: PreloadedQuery<createQueryLoaderTestQuery> }) => {
		const data = createPreloadedQuery<createQueryLoaderTestQuery>(gqlQuery, () => props.queryRef);
		return <h1 data-testid="name">{data()?.node?.name}</h1>;
	};

	const LoaderComp = (props: {
		gqlQuery?: GraphQLTaggedNode;
		initialQueryReference?: PreloadedQuery<createQueryLoaderTestQuery> | null;
	}) => {
		const [currentQueryRef, loadQuery, disposeQuery] =
			createQueryLoader<createQueryLoaderTestQuery>(
				props.gqlQuery ?? gqlQuery,
				props.initialQueryReference,
			);
		queryRef = currentQueryRef;
		loadQueryRef = loadQuery;
		disposeQueryRef = disposeQuery;

		return (
			<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
				<Suspense fallback="Fallback">
					<Show when={currentQueryRef()}>{(ref) => <Child queryRef={ref()} />}</Show>
				</Suspense>
			</ErrorBoundary>
		);
	};

	beforeEach(() => {
		environment = createMockEnvironment();
		overrideEnvironment = createMockEnvironment();
		queryRef = undefined;
		loadQueryRef = undefined;
		disposeQueryRef = undefined;
	});

	it("starts with a null query reference", () => {
		renderToBody(() => (
			<View>
				<LoaderComp />
			</View>
		));

		expect(queryRef?.()).toBeNull();
	});

	it("exposes the initial query reference immediately", async () => {
		environment.commitPayload(operation, {
			node: { __typename: "User", id: "1", name: "Alice" },
		});
		const initialQueryReference = preloadQuery<createQueryLoaderTestQuery>(environment, gqlQuery, {
			id: "1",
		});

		renderToBody(() => (
			<View>
				<LoaderComp initialQueryReference={initialQueryReference} />
			</View>
		));

		expect(queryRef?.()).toBe(initialQueryReference);
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
	});

	it("loads a query reference with the expected metadata and renders through createPreloadedQuery", async () => {
		renderToBody(() => (
			<View>
				<LoaderComp />
			</View>
		));

		loadQueryRef?.({ id: "1" });

		expect(queryRef?.()).toEqual(
			expect.objectContaining({
				kind: "PreloadedQuery",
				name: "createQueryLoaderTestQuery",
				variables: { id: "1" },
			}),
		);
		await expect.element(page.getByText("Fallback")).toBeInTheDocument();

		environment.mock.resolveMostRecentOperation(() => ({
			data: { node: { __typename: "User", id: "1", name: "Alice" } },
		}));
		await wait(2);

		await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
	});

	it("disposes the previous reference on replacement and resets on disposeQuery", async () => {
		environment.commitPayload(operation, {
			node: { __typename: "User", id: "1", name: "Alice" },
		});

		renderToBody(() => (
			<View>
				<LoaderComp />
			</View>
		));

		loadQueryRef?.({ id: "1" });
		const firstRef = queryRef?.();
		// oxlint-disable-next-line typescript-eslint/no-non-null-assertion: test code, also always exists
		const releaseQuery = vi.spyOn(firstRef!.controls!.value, "releaseQuery");

		loadQueryRef?.({ id: "2" });
		await wait(2);

		expect(releaseQuery).toHaveBeenCalledTimes(1);
		expect(queryRef?.()?.variables).toEqual({ id: "2" });

		disposeQueryRef?.();
		await wait(2);

		expect(queryRef?.()).toBeNull();
	});

	it("cleans up the current reference on unmount and uses dispose for live queries", async () => {
		const [show, setShow] = createSignal(true);

		renderToBody(() => <View>{show() && <LoaderComp gqlQuery={liveQuery} />}</View>);

		loadQueryRef?.({ id: "1" });
		const currentRef = queryRef?.();
		// oxlint-disable-next-line typescript-eslint/no-non-null-assertion: test code, also always exists
		const dispose = vi.spyOn(currentRef!.controls!.value, "dispose");

		setShow(false);
		await wait(2);

		expect(dispose).toHaveBeenCalled();
	});

	it("honors the __environment override", () => {
		renderToBody(() => (
			<View>
				<LoaderComp />
			</View>
		));

		loadQueryRef?.(
			{ id: "1" },
			{
				fetchPolicy: "store-only",
				__environment: overrideEnvironment,
			},
		);

		expect(queryRef?.()?.controls?.value.environment).toBe(overrideEnvironment);
	});
});
