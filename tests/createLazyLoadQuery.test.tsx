import { render } from "@solidjs/testing-library";
import {
	type GraphQLTaggedNode,
	type OperationDescriptor,
	RecordSource,
	Store,
	graphql,
} from "relay-runtime";
import { type MockEnvironment, createMockEnvironment } from "relay-test-utils";
import { type JSXElement, Suspense } from "solid-js";
import { RelayEnvironmentProvider, createLazyLoadQuery } from "solid-relay";
import type { createLazyLoadQueryTestQuery } from "./__generated__/createLazyLoadQueryTestQuery.graphql";

let environment: MockEnvironment;
const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>
		{props.children}
	</RelayEnvironmentProvider>
);

let gqlQuery: OperationDescriptor;
const setQuery = (query: GraphQLTaggedNode) => {
	// @ts-expect-error - actually valid in runtime
	gqlQuery = query;
};

describe("createLazyLoadQuery", () => {
	beforeEach(() => {
		environment = createMockEnvironment({
			store: new Store(new RecordSource(), { gcReleaseBufferSize: 0 }),
		});
	});

	it("fetches and renders the query data", async () => {
		const query = graphql`
			query createLazyLoadQueryTestQuery {
				node(id: "1") {
					id
					... on User {
						name
					}
				}
			}
		`;
		setQuery(query);

		const Comp = () => {
			const data = createLazyLoadQuery<createLazyLoadQueryTestQuery>(query, {});
			return <Suspense fallback="Fallback">{data()?.node?.name}</Suspense>;
		};

		const screen = render(() => (
			<View>
				<Comp />
			</View>
		));

		expect(screen.getByText("Fallback")).toBeInTheDocument();
		environment.mock.resolve(gqlQuery, {
			data: { node: { __typename: "User", id: "1", name: "Alice" } },
		});
		expect(await screen.findByText("Alice")).toBeInTheDocument();
		expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
	});
});
