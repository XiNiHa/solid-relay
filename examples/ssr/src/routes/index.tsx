import { graphql } from "relay-runtime";
import { For, Show, Suspense } from "solid-js";
import { createFragment, createLazyLoadQuery } from "solid-relay";
import type { routesHomeQuery } from "./__generated__/routesHomeQuery.graphql";
import type { routesTodos$key } from "./__generated__/routesTodos.graphql";

export default function Home() {
	const query = createLazyLoadQuery<routesHomeQuery>(
		graphql`
      query routesHomeQuery {
        siteStatistics {
          weeklySales
          weeklyOrders
          currentVisitorsOnline
        }
        ...routesTodos @arguments(first: 10) @defer
      }
    `,
		{},
	);

	return (
		<main>
			<section>
				<h2>Site Statistics</h2>
				<Suspense fallback={<p>Loading...</p>}>
					<p>{JSON.stringify(query()?.siteStatistics)}</p>
				</Suspense>
			</section>
			<section>
				<h2>Todos</h2>
				<Suspense fallback={<p>Loading...</p>}>
					<Show when={query()}>{(query) => <Todos $query={query()} />}</Show>
				</Suspense>
			</section>
		</main>
	);
}

const Todos = (props: { $query: routesTodos$key }) => {
	const query = createFragment(
		graphql`
      fragment routesTodos on Query
      @argumentDefinitions(first: { type: "Int!" }, after: { type: "String" }) {
        todosConnection(first: $first, after: $after)
          @connection(key: "Todos__todosConnection") {
          edges {
            node {
              id
              text
              completed
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
		() => props.$query,
	);

	return (
		<ul>
			<For each={query()?.todosConnection?.edges}>
				{(edge) => <li>{edge?.node?.text}</li>}
			</For>
		</ul>
	);
};
