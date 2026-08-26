---
name: solid-relay
description: >-
  Best practices for writing idiomatic Relay code in SolidJS. ALWAYS use this skill when
  writing or modifying Solid components that use Relay for data fetching. Covers
  fragments, queries, mutations, pagination, and common anti-patterns. Use when
  you see `createFragment`, `createLazyLoadQuery`, `createPreloadedQuery`,
  `createMutation`, `createPaginationFragment`, `graphql` template literals,
  `solid-relay` imports,  or `__generated__/*.graphql` files. Also use when asked
  to explain Relay concepts, debug Relay issues, or review Relay code.
---

# solid-relay

Solid Relay replaces only the React-specific layer of Relay (the `react-relay` equivalent): its primitives return Solid accessors instead of React hooks returning values. Everything below that layer — schema, `relay-compiler`, `relay-runtime` store and network layer, GraphQL directives — is unchanged.

## References

Since the runtime layer is unchanged, the official Relay docs (available in `node_modules/relay-runtime/llm-docs/`) remain authoritative for those parts. Reach for the reference here for the component-level API only.

Read the reference that matches the task before writing code; each file carries complete, runnable examples.

| Task | Reference |
| --- | --- |
| `createFragment`, composition, data masking, `createRefetchableFragment`, fragment variables | `references/fragments.md` |
| Installing, Vite/SolidStart plugin config, `relay.config`, environment + `RelayEnvironmentProvider` | `references/getting-started.md` |
| `createSubscriptionToInvalidationState`, reacting to `invalidateRecord` / `invalidateStore`, stale-data indicators, refetch-on-invalidation | `references/invalidation.md` |
| `createMutation`, optimistic updates, updater functions, connection updates | `references/mutations.md` |
| `createPaginationFragment`, `@connection`, bidirectional / infinite scroll, search, virtualized lists | `references/pagination.md` |
| Fetching with `createLazyLoadQuery`, variables, fetch policies, route preloading with `loadQuery` / `createQueryLoader` / `createPreloadedQuery`, error and loading states | `references/querying.md` |
| `createSubscription`, real-time store updates | `references/subscriptions.md` |

## Core Philosophy

These principles are the foundation of every decision below. When in doubt,
refer back to them.

- **Co-location**: Each component declares its own data requirements via a
  GraphQL fragment, right next to the rendering code. Data needs travel with the
  component, not separately.
- **Data masking**: A component can only access the fields it explicitly
  selected in its own fragment. Parents cannot see child fragment data, and vice
  versa. This prevents implicit coupling between components.
- **Composition**: Fragments compose into parent fragments and ultimately into
  queries, forming a tree that mirrors the component tree. The compiler flattens
  this into a single network request per query.
- **Render-as-you-fetch**: Start fetching data before the component that needs
  it renders. This avoids sequential request waterfalls.
- **Normalized store**: Relay maintains a flat, ID-keyed cache. When a mutation
  returns updated data, every component reading that data re-renders
  automatically. You do not need to manually propagate changes.

## Decision Rules

### Queries belong at roots — never in hooks

Queries belong at **route entrypoints** (the top-level component for a URL).
Hooks are leaves — reused across many components. A query inside a hook fires
late (after the hook's host renders) AND duplicates across every caller. The fix
is always: accept a fragment key as a parameter, use `createFragment`.

Use `createPreloadedQuery` + `createQueryLoader` (or `loadQuery`). Start the fetch in
an event handler, route transition, or during app initialization — before the
component renders. `createLazyLoadQuery` does not start fetching until render,
creating waterfalls. See `references/querying.md` for the full pattern.

### Before fixing where a query lives, ask if it should exist

| Question | If YES |
|----------|--------|
| Parent already fetches this GraphQL type? | Delete query, use `createFragment` |
| Component only fetches and passes data down? | Delete the wrapper component entirely (loader anti-pattern) |
| Query is inside a custom hook? | Delete query, accept a fragment key param |
| Two components fetch the same data? | Delete one query, fetch in a common ancestor |
| Data is only used for logging/analytics? | Move to `@defer` or server-side logging |
| Data is static config (same for every user)? | Inject server-side, no round-trip needed |

### `loadQuery` in `createEffect` is worse than `createLazyLoadQuery`

`createEffect` runs **after paint**, so the fetch starts even later than
`createLazyLoadQuery` (which at least starts during render). Call `loadQuery` in
event handlers, route transitions, or app initialization — never in effects.

### Walking the ancestor tree for `createFragment`

When deciding whether `createFragment` can replace a query, walk **up** the
component tree from your component. Stop at: route boundaries, feature gates,
conditional renders, or user-triggered interactions. Keep walking through:
unconditional renders, layout/wrapper components, context providers.

If any ancestor already queries the GraphQL type you need, `createFragment` is
the answer. Threading fragment keys through several layers of props is fine —
it IS the correct pattern.

### Don't default query variables to empty values

Never default a query variable to `''`, `0`, or `null` when the real value is
unavailable. This fires the query with bad data, returning wrong results or
errors. Instead, use conditional rendering (`if (!id) return null`) or
`@include`/`@skip` directives to omit the field entirely.

### Data flow: Always use fragments

Every component that displays server data should declare a fragment and receive
a fragment reference (the `$key` type) as a prop. The parent spreads the
child's fragment in its own query or fragment and passes the result down. See
the "Maintain fragment co-location" anti-pattern below for an example.

### Mutations: Spread fragments into responses

Spread the consuming component's fragment into the mutation response rather than
selecting fields individually. This keeps them in sync automatically. See the
anti-pattern example below.

### Error handling: Use `@throwOnFieldError` and `@catch`

The recommended approach for handling field errors and nullability is to add
`@throwOnFieldError` to your fragment or query. This causes Relay to throw a
JavaScript exception if a field error is encountered, which can be caught by a
Solid error boundary. It also enables non-null types for `@semanticNonNull`
fields, eliminating unnecessary null checks. Note that this pattern depends on
Solid error boundaries being configured in your application — proceed with
caution if error boundaries are not set up robustly.

For fields where you want to handle errors locally instead of throwing, use
`@catch` to receive errors inline as `{ ok: true, value: T } | { ok: false,
errors: [...] }`.

`@required` is also available for declaring that specific fields must be
non-null, but `@throwOnFieldError` + `@catch` is the preferred pattern for new
code.

### Pagination: Use the three-directive pattern

Always use `@argumentDefinitions` (for cursor/count variables),
`@refetchable` (to auto-generate the pagination query), and `@connection` (to
identify the connection for store management) together. Never write manual
pagination queries. See `references/pagination.md`.

## Critical Anti-Patterns

### Never copy Relay data into Solid state

This is the single most important rule. Do not read data from `createFragment` and
copy it into `createSignal`, and do not update that state manually in mutation
`onCompleted` callbacks.

```tsx
// WRONG: Copying Relay data into Solid state
function UserProfile(props) {
  const data = createFragment(UserProfileFragment, () => props.$user);
  const [name, setName] = createSignal(data().name); // broken

  const [commit] = createMutation(UpdateNameMutation);
  const handleSave = (newName) => {
    commit({
      variables: {name: newName},
      onCompleted: (response) => {
        setName(response.updateName.user.name); // broken
      },
    });
  };
  return <span>{name()}</span>;
}
```

Why this is wrong: Relay's normalized store is the single source of truth. When
a mutation returns updated data with a matching `id`, Relay automatically
updates every component reading that data via `createFragment`. By copying into
`createState`, you create a second source of truth that Relay cannot update. The
component will show stale data whenever the record is updated by another
mutation, subscription, or refetch elsewhere in the app.

```tsx
// CORRECT: Read directly from the fragment
function UserProfile(props) {
  const data = createFragment(UserProfileFragment, () => props.$user);
  const [commit, isInFlight] = createMutation(UpdateNameMutation);

  const handleSave = (newName) => {
    commit({variables: {name: newName}});
    // No onCompleted needed — Relay updates the store automatically,
    // and createFragment updates with the new data.
  };
  return <span>{data()?.name}</span>;
}
```

Similarly, do not store a fragment key (the `$key` prop) in Solid state. Relay
garbage collects data that is no longer retained by a mounted query component —
if the component that originally fetched the data unmounts, a stashed key may
point to data that is no longer in the store.

### Maintain fragment co-location

Do not fetch all data in a parent's query and pass raw data objects as props to
children. This defeats data masking and creates tight coupling — adding a field
to a child component requires editing the parent's query.

```tsx
// WRONG: Parent fetches everything, passes raw data
function Parent(props) {
  const data = createPreloadedQuery(graphql`
    query ParentQuery {
      user {
        name
        email
        avatarUrl
      }
    }
  `, () => props.$queryRef);
  return <UserCard name={data()?.user.name} avatarUrl={data()?.user.avatarUrl} />;
}

// CORRECT: Child declares its own fragment
function Parent(props) {
  const data = createPreloadedQuery(graphql`
    query ParentQuery {
      user {
        ...UserCard_user
      }
    }
  `, () => props.$queryRef);
  return <UserCard user={data()?.user} />;
}
```

### Spread fragments into mutation responses

Do not select fields individually in both a fragment and a mutation response —
they will drift out of sync. Spread the fragment instead:

```graphql
# WRONG
mutation UpdateUserMutation($input: UpdateUserInput!) {
  updateUser(input: $input) {
    user { id, name, email, avatarUrl }
  }
}

# CORRECT
mutation UpdateUserMutation($input: UpdateUserInput!) {
  updateUser(input: $input) {
    user { ...UserCard_user }
  }
}
```

## Correctness

### Use `optimisticUpdater` for store-dependent values

If an optimistic value depends on current store state (e.g., incrementing a
like count), use `optimisticUpdater` instead of `optimisticResponse`. Multiple
overlapping optimistic responses can compound incorrectly — two simultaneous
"like" mutations both read count=5 and set count=6, instead of 5→6→7. When one
rolls back, the store is left in an inconsistent state.

### Invalidate data after wide-effect mutations

When a mutation has side effects too broad to capture in a single response
payload, use `invalidateRecord()` for targeted invalidation or
`invalidateStore()` for global invalidation. Pair with
`createSubscriptionToInvalidationState` on mounted components to trigger refetches
for stale data automatically.

### Handle staleness explicitly

Relay treats cached data as fresh **indefinitely** by default. Two approaches:

- **Time-based**: Set `queryCacheExpirationTime` on the Relay Store to
  automatically mark data stale after a duration.
- **Event-based**: Call `invalidateRecord()` after mutations whose side effects
  extend beyond the mutation response payload.

Without explicit staleness handling, components can display arbitrarily old data
after the user returns to a previously visited screen.

### Use `@updatable` for store manipulation

Prefer typesafe updatable queries/fragments over raw store manipulation with
string-based field access (e.g., `store.get(id).setValue(newName, 'name')`).
Updatable fragments provide getters and setters, reducing the risk of typos
and type mismatches.

### Avoid unnecessary refetches after mutations

Do not call `refetch()` or `fetchQuery()` after mutations when spreading
component fragments in the mutation response would auto-update the store. Each
unnecessary refetch is a wasted network request and delays the UI update.

Reserve manual refetches for cases where the mutation's side effects are too
broad to capture in the response payload — and in those cases, prefer
`invalidateRecord()` (see above).

### Use subscriptions for real-time data

Prefer GraphQL Subscriptions over polling (`setInterval` + `fetchQuery`) or
manual refresh buttons for data that must stay current. Subscriptions push
updates only when data changes and integrate with Relay's normalized store
automatically.

### Renaming operations when extracting to a new file

When moving a component to a new file, rename only the operations **defined in
that file** to match the new filename. Do NOT rename fragment spreads that
reference fragments owned by other modules — those names belong to their
defining component.

Renaming an operation also changes its generated type name (e.g.,
`UserCard_user$key` → `ProfileCard_user$key`), so update all downstream imports
of those generated types.

### Never hand-edit `__generated__/` files

The next compiler run overwrites any manual edits. If you see type errors about
missing generated types, run the compiler first — the types are just out of
date, not missing.

### Verify mutation variable keys after auto-formatting

Auto-formatters and linters can rename variables in ways that silently break
mutation calls. After running lint auto-fix, verify that variable keys in
`commit({ variables: { ... } })` still match the generated `Mutation$variables`
type (check for `data` vs `input` mismatches in particular).
