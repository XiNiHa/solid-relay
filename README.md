# solid-relay

SolidJS bindings for Relay (Experimental)

**Nothing is finalized yet and therefore everything (including APIs, error handling, and cache policy) is subject to change. Expect major breaking changes to happen.**

```jsx
const App = () => {
  const query = createLazyLoadQuery(
    graphql`
      query AppQuery {
        viewer { login }
      }
    `,
    {}
  )
  return (
    <Show when={query()}>
      {(query) => <p>{query().viewer.login}</p>}
    </Show>
  )
}
