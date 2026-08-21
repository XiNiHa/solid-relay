import {
	type ConcreteRequest,
	createOperationDescriptor,
	graphql,
	RecordSource,
	Store,
} from "relay-runtime";
import { createMockEnvironment, type MockEnvironment } from "relay-test-utils";
import {
	createResource,
	createSignal,
	ErrorBoundary,
	For,
	Show,
	startTransition,
	Suspense,
	type JSXElement,
} from "solid-js";
import {
	createFragment,
	createLazyLoadQuery,
	type DataStore,
	type MaybeArray,
	RelayEnvironmentProvider,
} from "solid-relay";
import { page } from "vitest/browser";
import type {
	createFragmentTest_user$data,
	createFragmentTest_user$key,
} from "./__generated__/createFragmentTest_user.graphql";
import type { createFragmentTestOwnerQuery } from "./__generated__/createFragmentTestOwnerQuery.graphql";
import {
	createFragmentTestPlural_users$data,
	createFragmentTestPlural_users$key,
} from "./__generated__/createFragmentTestPlural_users.graphql";
import { createFragmentTestPluralQuery } from "./__generated__/createFragmentTestPluralQuery.graphql";
import { renderToBody, wait } from "./utils";

let environment: MockEnvironment;
let store: DataStore<createFragmentTest_user$data | null | undefined> | undefined;

const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>{props.children}</RelayEnvironmentProvider>
);

describe("createFragment", () => {
	const ownerQuery = graphql`
		query createFragmentTestOwnerQuery($id: ID!) {
			node(id: $id) {
				id
				... on User {
					...createFragmentTest_user
				}
			}
		}
	` as ConcreteRequest;
	const fragment = graphql`
		fragment createFragmentTest_user on User {
			id
			name
		}
	`;
	const ownerOperation = createOperationDescriptor(ownerQuery, { id: "1" });

	const Child = (props: {
		user: createFragmentTest_user$key | null | undefined;
		testId?: string;
	}) => {
		store = createFragment(fragment, () => props.user);
		return <h1 data-testid={props.testId ?? "name"}>{store()?.name}</h1>;
	};

	const QueryScreen = (props: { user?: createFragmentTest_user$key | null | undefined }) => {
		const data = createLazyLoadQuery<createFragmentTestOwnerQuery>(ownerQuery, { id: "1" });
		return (
			<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
				<Suspense fallback="Fallback">
					<Child user={props.user ?? data()?.node} />
				</Suspense>
			</ErrorBoundary>
		);
	};

	beforeEach(() => {
		environment = createMockEnvironment({
			store: new Store(new RecordSource(), { gcReleaseBufferSize: 0 }),
		});
		store = undefined;
	});

	it("reads fragment data from a parent query key", async () => {
		renderToBody(() => (
			<View>
				<QueryScreen />
			</View>
		));

		await expect.element(page.getByText("Fallback")).toBeInTheDocument();
		environment.mock.resolve(ownerOperation, {
			data: { node: { __typename: "User", id: "1", name: "Alice" } },
		});
		await wait(2);
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
	});

	it("exposes stable data store getters", async () => {
		const [showKey, setShowKey] = createSignal(false);

		const Comp = () => {
			const data = createLazyLoadQuery<createFragmentTestOwnerQuery>(ownerQuery, { id: "1" });
			store = createFragment<createFragmentTest_user$key>(fragment, () =>
				showKey() ? data()?.node : undefined,
			);
			return <h1 data-testid="getter-name">{store()?.name}</h1>;
		};

		renderToBody(() => (
			<View>
				<Comp />
			</View>
		));

		expect(store).toBeDefined();
		expect(store?.pending).toBe(false);
		expect(store?.error).toBeUndefined();
		expect(store?.()).toBeUndefined();
		expect(store?.latest).toBeUndefined();
		await expect.element(page.getByTestId("getter-name")).toBeEmptyDOMElement();

		const initialStore = store;
		environment.mock.resolve(ownerOperation, {
			data: { node: { __typename: "User", id: "1", name: "Alice" } },
		});

		expect(store).toBe(initialStore);
		expect(store?.pending).toBe(false);
		expect(store?.error).toBeUndefined();
		expect(store?.()).toBeUndefined();
		expect(store?.latest).toBeUndefined();
		await expect.element(page.getByTestId("getter-name")).toBeEmptyDOMElement();

		setShowKey(true);
		await wait(2);

		expect(store).toBe(initialStore);
		expect(store?.pending).toBe(false);
		expect(store?.error).toBeUndefined();
		expect(store?.()?.name).toBe("Alice");
		expect(store?.latest?.name).toBe("Alice");
		await expect.element(page.getByTestId("getter-name")).toHaveTextContent("Alice");
	});

	it("updates when the underlying Relay record changes", async () => {
		environment.commitPayload(ownerOperation, {
			node: { __typename: "User", id: "1", name: "Alice" },
		});

		renderToBody(() => (
			<View>
				<QueryScreen />
			</View>
		));

		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");

		environment.commitPayload(ownerOperation, {
			node: { __typename: "User", id: "1", name: "Bob" },
		});
		await wait(2);

		await expect.element(page.getByTestId("name")).toHaveTextContent("Bob");
	});

	it("renders empty when the fragment key is null", async () => {
		renderToBody(() => (
			<View>
				<Child user={null} />
			</View>
		));

		await expect.element(page.getByTestId("name")).toBeEmptyDOMElement();
		expect(store?.pending).toBe(false);
		expect(store?.latest).toBeUndefined();
	});

	it("clears stale data when the key becomes undefined", async () => {
		environment.commitPayload(ownerOperation, {
			node: { __typename: "User", id: "1", name: "Alice" },
		});

		const [fragmentKey, setFragmentKey] = createSignal<
			createFragmentTest_user$key | null | undefined
		>();
		let getOwnerKey: (() => createFragmentTest_user$key | null | undefined) | undefined;

		const Comp = () => {
			const data = createLazyLoadQuery<createFragmentTestOwnerQuery>(
				ownerQuery,
				{ id: "1" },
				{ fetchPolicy: () => "store-only" },
			);
			getOwnerKey = () => data()?.node;
			store = createFragment(fragment, fragmentKey);
			return <h1 data-testid="name">{store()?.name}</h1>;
		};

		renderToBody(() => (
			<View>
				<Comp />
			</View>
		));

		setFragmentKey(getOwnerKey?.());
		await wait(2);

		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		expect(store?.()?.name).toBe("Alice");

		setFragmentKey(undefined);
		await wait(2);

		await expect.element(page.getByTestId("name")).toBeEmptyDOMElement();
		expect(store?.()).toBeUndefined();
		expect(store?.latest).toBeUndefined();
	});

	it("publishes data already in the store synchronously", async () => {
		environment.commitPayload(ownerOperation, {
			node: { __typename: "User", id: "1", name: "Alice" },
		});

		let syncName: string | undefined;
		let childRuns = 0;
		const Comp = () => {
			const data = createLazyLoadQuery<createFragmentTestOwnerQuery>(
				ownerQuery,
				{ id: "1" },
				{ fetchPolicy: () => "store-only" },
			);
			const user = createFragment<createFragmentTest_user$key>(fragment, () => data()?.node);
			store = user;
			syncName = user()?.name;
			return (
				<Show when={user()} keyed>
					{(user) => {
						childRuns++;
						return <h1 data-testid="name">{user.name}</h1>;
					}}
				</Show>
			);
		};

		renderToBody(() => (
			<View>
				<Suspense fallback="Fallback">
					<Comp />
				</Suspense>
			</View>
		));

		expect(syncName).toBe("Alice");
		expect(store?.pending).toBe(false);
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await wait(10);
		expect(childRuns).toBe(1);
	});

	it("creates gated children once when mounted inside a pending transition", async () => {
		environment.commitPayload(ownerOperation, {
			node: { __typename: "User", id: "1", name: "Alice" },
		});

		const [show, setShow] = createSignal(false);
		let childRuns = 0;
		const Comp = () => {
			const data = createLazyLoadQuery<createFragmentTestOwnerQuery>(
				ownerQuery,
				{ id: "1" },
				{ fetchPolicy: () => "store-only" },
			);
			const user = createFragment<createFragmentTest_user$key>(fragment, () => data()?.node);
			return (
				<Show when={user()} keyed>
					{(user) => {
						childRuns++;
						return <h1 data-testid="name">{user.name}</h1>;
					}}
				</Show>
			);
		};
		// A sibling that keeps the transition pending for a while.
		const Pending = () => {
			const [pending] = createResource(() => new Promise((r) => setTimeout(() => r(1), 30)));
			return <Show when={pending()}>done</Show>;
		};

		renderToBody(() => (
			<View>
				<Suspense fallback="Fallback">
					<Show when={show()}>
						<Comp />
						<Pending />
					</Show>
				</Suspense>
			</View>
		));

		void startTransition(() => setShow(true));
		await expect.element(page.getByTestId("name")).toHaveTextContent("Alice");
		await expect.element(page.getByText("done")).toBeInTheDocument();
		expect(childRuns).toBe(1);
	});

	describe("plural", () => {
		let pluralStore: DataStore<MaybeArray<createFragmentTestPlural_users$data>> | undefined;
		const pluralQuery = graphql`
			query createFragmentTestPluralQuery($ids: [ID!]!) {
				nodes(ids: $ids) {
					...createFragmentTestPlural_users
				}
			}
		` as ConcreteRequest;
		const pluralFragment = graphql`
			fragment createFragmentTestPlural_users on User @relay(plural: true) {
				id
				name
			}
		`;
		const pluralOperation = createOperationDescriptor(pluralQuery, { ids: ["1"] });

		const PluralChild = (props: {
			users: MaybeArray<createFragmentTestPlural_users$key>;
			testId?: string;
		}) => {
			pluralStore = createFragment(pluralFragment, () => props.users);
			return (
				<ul>
					<For each={pluralStore()}>
						{(node, i) => <li data-testid={`${props.testId ?? "name"}-${i()}`}>{node?.name}</li>}
					</For>
				</ul>
			);
		};

		const PluralQueryScreen = (props: {
			users?: createFragmentTestPlural_users$key | null | undefined;
		}) => {
			const data = createLazyLoadQuery<createFragmentTestPluralQuery>(pluralQuery, { ids: ["1"] });
			return (
				<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
					<Suspense fallback="Fallback">
						<Show when={data()}>
							{(data) => <PluralChild users={props.users ?? data().nodes} />}
						</Show>
					</Suspense>
				</ErrorBoundary>
			);
		};

		beforeEach(() => {
			pluralStore = undefined;
		});

		it("reads fragment data from a parent query key", async () => {
			renderToBody(() => (
				<View>
					<PluralQueryScreen />
				</View>
			));

			await expect.element(page.getByText("Fallback")).toBeInTheDocument();
			environment.mock.resolve(pluralOperation, {
				data: { nodes: [{ __typename: "User", id: "1", name: "Alice" }] },
			});
			await wait(2);
			await expect.element(page.getByTestId("name-0")).toHaveTextContent("Alice");
			await expect.element(page.getByText("Fallback")).not.toBeInTheDocument();
		});
	});
});
