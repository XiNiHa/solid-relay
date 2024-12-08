import { graphql } from "relay-runtime";
import { For, Show, Suspense, createSignal, useTransition } from "solid-js";
import {
	createFragment,
	createLazyLoadQuery,
	createMutation,
	createRefetchableFragment,
} from "solid-relay";
import type { routesAddTodoItemMutation } from "./__generated__/routesAddTodoItemMutation.graphql";
import type { routesHomeQuery } from "./__generated__/routesHomeQuery.graphql";
import type { routesTodoItem$key } from "./__generated__/routesTodoItem.graphql";
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
					<Todos $query={query()} />
				</Suspense>
			</section>
		</main>
	);
}

const Todos = (props: { $query: routesTodos$key | null | undefined }) => {
	const [query, refetch] = createRefetchableFragment(
		graphql`
      fragment routesTodos on Query
      @argumentDefinitions(first: { type: "Int!" }, after: { type: "String" })
      @refetchable(queryName: "TodosRefetchQuery") {
        todosConnection(first: $first, after: $after) {
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
				<For each={query()?.todosConnection?.edges}>
					{(edge) => <TodoItem $todo={edge?.node} />}
				</For>
			</ul>
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
