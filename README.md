# solid-relay

[![npm](https://img.shields.io/npm/v/solid-relay)](https://npmjs.com/package/solid-relay)
[![npm downloads](https://img.shields.io/npm/dm/solid-relay)](https://npm.chart.dev/solid-relay)
[![codecov](https://codecov.io/gh/XiNiHa/solid-relay/graph/badge.svg?token=1L46SFFGH1)](https://codecov.io/gh/XiNiHa/solid-relay)
[![docs](https://img.shields.io/badge/docs-f26b00)](https://solid-relay.xiniha.dev)

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
