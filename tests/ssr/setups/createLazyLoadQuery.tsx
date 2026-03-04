import { graphql } from "relay-runtime";
import { ErrorBoundary, Suspense } from "solid-js";
import { createLazyLoadQuery } from "solid-relay";
import type { createLazyLoadQuerySsrMainTestQuery } from "./__generated__/createLazyLoadQuerySsrMainTestQuery.graphql";

export function Main() {
	const data = createLazyLoadQuery<createLazyLoadQuerySsrMainTestQuery>(
		graphql`
			query createLazyLoadQuerySsrMainTestQuery {
				node(id: "1") {
					id
					... on User {
						name
					}
				}
			}
		`,
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
}
