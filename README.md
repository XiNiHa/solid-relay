# solid-relay

SolidJS bindings for Relay (Experimental)

**Nothing is finalized yet and therefore everything (including APIs and cache policy) is subject to change. Expect major breaking changes to happen.**

```jsx
const App = () => {
  const [data] = createLazyLoadQuery(
    graphql`
      query AppQuery {
        viewer { login }
      }
    `,
    {}
  )
  return (
    <Show when={data()}>
      {(data) => <p>{data().viewer.login}</p>}
    </Show>
  )
}
