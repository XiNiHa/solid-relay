# solid-relay

SolidJS bindings for Relay

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
