import { access } from '@solid-primitives/utils'
import type { MaybeAccessor } from '@solid-primitives/utils'
import { GraphQLResponse, Observable, __internal } from 'relay-runtime'
import type {
  OperationType,
  GraphQLTaggedNode,
  VariablesOf,
  FetchPolicy,
  CacheConfig,
  RenderPolicy,
} from 'relay-runtime'
import { createComputed, createMemo, createResource } from 'solid-js'
import type { Accessor } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

import { createLazyLoadQueryNode } from './createLazyLoadQueryNode'
import { createMemoOperationDescriptor } from './createMemoOperationDescriptor'
import { useRelayEnvironment } from '../RelayEnvironment'
import { getQueryResourceForEnvironment } from '../utils/QueryResource'

export function createLazyLoadQuery<TQuery extends OperationType>(
  gqlQuery: MaybeAccessor<GraphQLTaggedNode>,
  variables: MaybeAccessor<VariablesOf<TQuery>>,
  options?: {
    fetchKey?: MaybeAccessor<string | number | undefined>
    fetchPolicy?: MaybeAccessor<FetchPolicy | undefined>
    networkCacheConfig?: MaybeAccessor<CacheConfig | undefined>
    UNSTABLE_renderPolicy?: MaybeAccessor<RenderPolicy | undefined>
  }
): Accessor<TQuery['response']> {
  const environment = useRelayEnvironment()
  const QueryResource = getQueryResourceForEnvironment(environment)

  const query = createMemoOperationDescriptor(
    gqlQuery,
    variables,
    () => access(options?.networkCacheConfig) ?? { force: true }
  )

  let shouldFetchHere = false

  const [loadShouldFetchHere] = createResource(() => {
    shouldFetchHere = true
    return true
  })

  const fragmentNode = createLazyLoadQueryNode({
    componentDisplayName: 'createLazyLoadQuery()',
    environment,
    query,
    fetchObservable: createMemo(() => {
      loadShouldFetchHere()
      return shouldFetchHere
        ? __internal.fetchQuery(environment, access(query))
        : Observable.create<GraphQLResponse>((sink) => {
            QueryResource.registerReplaySink(
              access(query).request.identifier,
              sink
            )
          })
    }),
    fetchKey: () => access(options?.fetchKey) ?? null,
    fetchPolicy: () => access(options?.fetchPolicy) ?? null,
    renderPolicy: () => access(options?.UNSTABLE_renderPolicy) ?? null,
  })
  return () => fragmentNode()?.data

  // const [dataStore, setDataStore] = createStore<[TQuery['response'] | null]>([
  //   null,
  // ])

  // createComputed(() => {
  //   const node = fragmentNode()
  //   if (!node) return

  //   setDataStore(0, reconcile(node.data))
  // })

  // return () => dataStore[0]
}
