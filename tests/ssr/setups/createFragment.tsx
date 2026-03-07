import { graphql } from "relay-runtime";
import { ErrorBoundary, Suspense } from "solid-js";
import { createFragment, createLazyLoadQuery } from "solid-relay";
import type { createFragmentSsrMain_user$key } from "./__generated__/createFragmentSsrMain_user.graphql";
import type { createFragmentSsrMainTestQuery } from "./__generated__/createFragmentSsrMainTestQuery.graphql";

const fragment = graphql`
	fragment createFragmentSsrMain_user on User {
		id
		name
	}
`;

function Child(props: { fragmentKey: createFragmentSsrMain_user$key | null | undefined }) {
	const data = createFragment(fragment, () => props.fragmentKey);
	return <h1 data-testid="name">{data()?.name}</h1>;
}

export function Main() {
	const data = createLazyLoadQuery<createFragmentSsrMainTestQuery>(
		graphql`
			query createFragmentSsrMainTestQuery {
				node(id: "1") {
					id
					... on User {
						...createFragmentSsrMain_user
					}
				}
			}
		`,
		{},
	);

	return (
		<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
			<Suspense fallback="Fallback">
				<Child fragmentKey={data()?.node} />
			</Suspense>
		</ErrorBoundary>
	);
}
