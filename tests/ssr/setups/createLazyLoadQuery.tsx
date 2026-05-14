import { graphql } from "relay-runtime";
import { createSignal, ErrorBoundary, Show, Suspense } from "solid-js";
import { createLazyLoadQuery } from "solid-relay";
import { createLazyLoadQuerySsrFlickerTestQuery } from "./__generated__/createLazyLoadQuerySsrFlickerTestQuery.graphql";
import type { createLazyLoadQuerySsrMainTestQuery } from "./__generated__/createLazyLoadQuerySsrMainTestQuery.graphql";
import { createLazyLoadQuerySsrParallelTestAQuery } from "./__generated__/createLazyLoadQuerySsrParallelTestAQuery.graphql";
import { createLazyLoadQuerySsrParallelTestBQuery } from "./__generated__/createLazyLoadQuerySsrParallelTestBQuery.graphql";

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
		<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
			<Suspense fallback="Fallback">
				<h1 data-testid="name">{data()?.node?.name}</h1>
			</Suspense>
		</ErrorBoundary>
	);
}

export function Parallel() {
	const a = createLazyLoadQuery<createLazyLoadQuerySsrParallelTestAQuery>(
		graphql`
			query createLazyLoadQuerySsrParallelTestAQuery {
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
	const b = createLazyLoadQuery<createLazyLoadQuerySsrParallelTestBQuery>(
		graphql`
			query createLazyLoadQuerySsrParallelTestBQuery {
				node(id: "2") {
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
		<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
			<Suspense
				fallback={
					<>
						<span>Fallback</span> <span>a</span>
					</>
				}
			>
				<Show when={a()?.node?.name}>{(name) => <h1 data-testid="a">{`Hello ${name()}`}</h1>}</Show>
			</Suspense>
			<Suspense
				fallback={
					<>
						<span>Fallback</span> <span>b</span>
					</>
				}
			>
				<Show when={b()?.node?.name}>
					{(name) => <h1 data-testid="b">{`Goodbye ${name()}`}</h1>}
				</Show>
			</Suspense>
		</ErrorBoundary>
	);
}

export function Flicker() {
	const data = createLazyLoadQuery<createLazyLoadQuerySsrFlickerTestQuery>(
		graphql`
			query createLazyLoadQuerySsrFlickerTestQuery {
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
	let error = "no error";
	const env = typeof window === "object" ? "browser" : "server";
	const [queryHydrated, setQueryHydrated] = createSignal(false);
	const [track, rerender] = createSignal(undefined, { equals: false });

	return (
		<ErrorBoundary fallback={(err) => <h1 data-testid="error">{err.message}</h1>}>
			<Suspense fallback="Fallback">
				<h1 data-testid="name">
					{(() => {
						track();
						const name = data()?.node?.name;
						if (env === "browser") {
							if (!name) {
								// client should never try render without data
								error = "client render without data";
							} else {
								// server rendered nodes win over client hydrate-rendered nodes
								// so we need to rerender after hydration
								// this mutation notifies the test runner to rerender the component
								queueMicrotask(() => setQueryHydrated(true));
							}
						}
						return `${error} ${name} ${env}`;
					})()}
				</h1>
				<h2 data-testid="query-hydrated">Query Hydrated: {String(queryHydrated())}</h2>
				<button data-testid="rerender" onClick={() => rerender()}>
					Rerender text
				</button>
			</Suspense>
		</ErrorBoundary>
	);
}
