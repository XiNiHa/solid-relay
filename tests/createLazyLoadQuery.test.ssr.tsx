import {
	type ConcreteRequest,
	type GraphQLTaggedNode,
	graphql,
	RecordSource,
	Store,
} from "relay-runtime";
import { createMockEnvironment, type MockEnvironment } from "relay-test-utils";
import { ErrorBoundary, type JSXElement, Suspense } from "solid-js";
import { createLazyLoadQuery, RelayEnvironmentProvider } from "solid-relay";
import type { createLazyLoadQuerySSRTestQuery } from "./__generated__/createLazyLoadQuerySSRTestQuery.graphql";
import { renderStream } from "./utils";

let environment: MockEnvironment;
const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>
		{props.children}
	</RelayEnvironmentProvider>
);

describe("createLazyLoadQuery SSR", () => {
	const gqlQuery = graphql`
		query createLazyLoadQuerySSRTestQuery {
			node(id: "1") {
				id
				... on User {
					name
				}
			}
		}
	` as GraphQLTaggedNode & ConcreteRequest;
	const Comp = (props: { gqlQuery: GraphQLTaggedNode }) => {
		const data = createLazyLoadQuery<createLazyLoadQuerySSRTestQuery>(
			props.gqlQuery,
			{},
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

	it("renders", async () => {
		const { shellCompleted, readable } = renderStream(() => (
			<View>
				<Comp gqlQuery={gqlQuery} />
			</View>
		));
		await shellCompleted;
		environment.mock.resolve(gqlQuery, {
			data: { node: { __typename: "User", id: "1", name: "Alice" } },
		});
		expect(await Array.fromAsync(readable)).toMatchSnapshot();
	});
});
