import { graphql } from 'relay-runtime'
import { For, Show, Suspense } from 'solid-js'
import { createFragment, createLazyLoadQuery } from 'solid-relay'
import type { CompQuery } from './__generated__/CompQuery.graphql'
import type { Comp_Sub_query$key } from './__generated__/Comp_Sub_query.graphql'

export default () => {
  const data = createLazyLoadQuery<CompQuery>(
    graphql`
      query CompQuery {
        siteStatistics {
          currentVisitorsOnline
        }
        ...Comp_Sub_query @defer
      }
    `,
    {}
  )

  return (
    <div>
      <Show when={data()} fallback={'meh'}>
        {(data) => (
          <div>
            <p>{data().siteStatistics.currentVisitorsOnline}</p>
            <Suspense fallback="Additional data...">
              <Sub $query={data()} />
            </Suspense>
          </div>
        )}
      </Show>
    </div>
  )
}

interface SubProps {
  $query: Comp_Sub_query$key
}

const Sub = (props: SubProps) => {
  const viewer = createFragment(
    graphql`
      fragment Comp_Sub_query on Query {
        ticketsConnection(first: 10) {
          edges {
            node {
              id
              subject
              status
            }
          }
        }
      }
    `,
    () => props.$query
  )

  return (
    <div>
      <Show when={viewer()} fallback={'eh'}>
        {(viewer) => (
          <For each={viewer().ticketsConnection.edges}>
            {(edge) => <p>{edge.node.subject}</p>}
          </For>
        )}
      </Show>
    </div>
  )
}
