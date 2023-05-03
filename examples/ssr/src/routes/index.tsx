import { graphql } from 'relay-runtime'
import { For, Suspense } from 'solid-js'
import { createFragment, createLazyLoadQuery } from 'solid-relay'
import type { routesQuery } from './__generated__/routesQuery.graphql'
import type { routes_Sub_query$key } from './__generated__/routes_Sub_query.graphql'

export default function Home() {
  const data = createLazyLoadQuery<routesQuery>(
    graphql`
      query routesQuery {
        siteStatistics {
          currentVisitorsOnline
        }
        ...routes_Sub_query @defer
      }
    `,
    {}
  )

  return (
    <div>
      <p>{data()?.siteStatistics.currentVisitorsOnline}</p>
      <Suspense fallback="Additional data...">
        <Sub $query={data()} />
      </Suspense>
    </div>
  )
}

interface SubProps {
  $query: routes_Sub_query$key
}

const Sub = (props: SubProps) => {
  const viewer = createFragment(
    graphql`
      fragment routes_Sub_query on Query {
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
      <For each={viewer()?.ticketsConnection.edges}>
        {(edge) => <p>{edge?.node?.subject}</p>}
      </For>
    </div>
  )
}
