import { type RouteDefinition, query } from "@solidjs/router";
import { graphql } from "relay-runtime";
import { For, Show, Suspense, createSignal, useTransition } from "solid-js";
import {
	createFragment,
	createMutation,
	createPaginationFragment,
	createPreloadedQuery,
	createRefetchableFragment,
	loadQuery,
	useRelayEnvironment,
} from "solid-relay";
import type { routesAddTodoItemMutation } from "./__generated__/routesAddTodoItemMutation.graphql";
import type { routesHomeQuery } from "./__generated__/routesHomeQuery.graphql";
import type { routesSiteStatistics$key } from "./__generated__/routesSiteStatistics.graphql";
import type { routesTodoItem$key } from "./__generated__/routesTodoItem.graphql";
import type { routesTodos$key } from "./__generated__/routesTodos.graphql";

export const route = {
	preload() {
		void loadHomeQuery();
	},
} satisfies RouteDefinition;

const HomeQuery = graphql`
  query routesHomeQuery {
    siteStatistics {
      ...routesSiteStatistics
    }
    ...routesTodos @arguments(first: 2) @defer
  }
`;

const loadHomeQuery = query(
	() => loadQuery<routesHomeQuery>(useRelayEnvironment()(), HomeQuery, {}),
	"HomeQuery",
);

export default function Home() {
	const query = createPreloadedQuery<routesHomeQuery>(HomeQuery, loadHomeQuery);

	return (
		<main>
			<section>
				<h2>Site Statistics</h2>
				<Suspense fallback={<p>Loading...</p>}>
					<SiteStatistics $stats={query()?.siteStatistics} />
				</Suspense>
			</section>
			<section>
				<h2>Todos</h2>
				<Suspense fallback={<p>Loading...</p>}>
					<Todos $query={query()} />
				</Suspense>
			</section>
		</main>
	);
}

const SiteStatistics = (props: {
	$stats: routesSiteStatistics$key | null | undefined;
}) => {
	const [stats, refetch] = createRefetchableFragment(
		graphql`
			fragment routesSiteStatistics on SiteStatistics @refetchable(queryName: "SiteStatisticsRefetchQuery") {
				weeklySales
				weeklyOrders
				currentVisitorsOnline
			}
		`,
		() => props.$stats,
	);
	const [wrapTransition, setWrapTransition] = createSignal(false);
	const [isTransitioning, startTransition] = useTransition();

	return (
		<div>
			<button
				type="button"
				onClick={() => {
					const run = wrapTransition()
						? startTransition
						: (fn: () => void) => fn();
					run(() => refetch({}));
				}}
				disabled={isTransitioning()}
			>
				Refetch
			</button>
			<label>
				<input
					type="checkbox"
					checked={wrapTransition()}
					onChange={(e) => setWrapTransition(e.target.checked)}
				/>
				Wrap refetch() with startTransition()
			</label>
			<ul>
				<li>Weekly Sales: {stats()?.weeklySales}</li>
				<li>Weekly Orders: {stats()?.weeklyOrders}</li>
				<li>Current Visitors Online: {stats()?.currentVisitorsOnline}</li>
			</ul>
		</div>
	);
};

const Todos = (props: { $query: routesTodos$key | null | undefined }) => {
	const query = createPaginationFragment(
		graphql`
      fragment routesTodos on Query
      @argumentDefinitions(first: { type: "Int!" }, after: { type: "String" })
      @refetchable(queryName: "TodosRefetchQuery") {
        todosConnection(first: $first, after: $after)
        @connection(key: "routesTodos__todosConnection") {
          __id
          edges {
            node {
            	...routesTodoItem
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
	const [addTodoItem, addTodoItemInFlight] =
		createMutation<routesAddTodoItemMutation>(graphql`
			mutation routesAddTodoItemMutation(
				$input: AddTodoItemInput!
				$connections: [ID!]!
			) {
				addTodoItem(input: $input) {
					addedTodoItemEdge @appendEdge(connections: $connections) {
						cursor
						node {
							...routesTodoItem
						}
					}
				}
			}
		`);
	const [isTransitioning, startTransition] = useTransition();
	const [wrapTransition, setWrapTransition] = createSignal(false);

	return (
		<div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (addTodoItemInFlight()) return;

					const formData = new FormData(e.currentTarget);
					addTodoItem({
						variables: {
							input: { text: formData.get("text") as string },
							connections: [query()?.todosConnection.__id].filter(
								(id) => id != null,
							),
						},
					});
				}}
			>
				<input type="text" name="text" />
				<button type="submit" disabled={addTodoItemInFlight()}>
					Add Todo
				</button>
			</form>
			<button
				type="button"
				onClick={() => {
					const run = wrapTransition()
						? startTransition
						: (fn: () => void) => fn();
					run(() => query.refetch({}));
				}}
				disabled={isTransitioning()}
			>
				Refetch
			</button>
			<label>
				<input
					type="checkbox"
					checked={wrapTransition()}
					onChange={(e) => setWrapTransition(e.target.checked)}
				/>
				Wrap refetch() with startTransition()
			</label>
			<ul>
				<For each={query()?.todosConnection?.edges}>
					{(edge) => <TodoItem $todo={edge?.node} />}
				</For>
			</ul>
			<Show when={query.hasNext}>
				<button
					type="button"
					disabled={query.isLoadingNext}
					onClick={() => query.loadNext(2)}
				>
					Load More
				</button>
			</Show>
		</div>
	);
};

const TodoItem = (props: { $todo: routesTodoItem$key | null | undefined }) => {
	const todo = createFragment(
		graphql`
			fragment routesTodoItem on TodoItem {
				id
				text
				completed
			}
		`,
		() => props.$todo,
	);

	return (
		<li
			style={{
				"text-decoration": todo()?.completed ? "line-through" : undefined,
			}}
		>
			{todo()?.text}
		</li>
	);
};
