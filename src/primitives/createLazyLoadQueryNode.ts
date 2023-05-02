import { createDeepSignal } from '@solid-primitives/resource'
import { MaybeAccessor, access } from '@solid-primitives/utils'
import { isPromise } from 'relay-runtime'
import type {
  FetchPolicy,
  GraphQLResponse,
  IEnvironment,
  Observable,
  OperationDescriptor,
  OperationType,
  RenderPolicy,
} from 'relay-runtime'
import { createEffect, createMemo, createResource, onCleanup } from 'solid-js'
import type { Accessor, ResourceReturn } from 'solid-js'

import { createFragmentNode } from './createFragmentNode'
import {
  getQueryCacheIdentifier,
  getQueryResourceForEnvironment,
} from '../utils/QueryResource'
import type { QueryResult } from '../utils/QueryResource'
import { createFetchManager } from '../utils/createFetchManager'

export function createLazyLoadQueryNode<TQuery extends OperationType>({
  query,
  environment,
  componentDisplayName,
  fetchObservable,
  fetchKey,
  fetchPolicy,
  renderPolicy,
}: {
  query: MaybeAccessor<OperationDescriptor>
  environment: IEnvironment
  componentDisplayName: string
  fetchObservable: Accessor<Observable<GraphQLResponse>>
  fetchKey: MaybeAccessor<string | number | null>
  fetchPolicy: MaybeAccessor<FetchPolicy | null>
  renderPolicy: MaybeAccessor<RenderPolicy | null>
}): ResourceReturn<TQuery['response']> {
  const QueryResource = getQueryResourceForEnvironment(environment)

  const fetchManager = createFetchManager()
  const cacheIdentifier = createMemo(() =>
    getQueryCacheIdentifier(
      environment,
      access(query),
      access(fetchPolicy),
      access(renderPolicy),
      access(fetchKey) ?? undefined
    )
  )

  const getPreparedQueryResult = () =>
    QueryResource.prepareWithIdentifier(
      cacheIdentifier(),
      access(query),
      fetchObservable(),
      access(fetchPolicy),
      access(renderPolicy),
      {
        start: fetchManager.start,
        complete: fetchManager.complete,
        error: fetchManager.complete,
      }
    )

  const [queryResult] = createResource(cacheIdentifier, () => {
    function fetcher(
      queryResult: QueryResult | Promise<void>
    ): QueryResult | Promise<QueryResult> {
      if (isPromise(queryResult)) {
        return queryResult.then(() => fetcher(getPreparedQueryResult()))
      }
      return queryResult
    }
    return fetcher(getPreparedQueryResult())
  })

  createEffect(() => {
    const preparedResult = queryResult()
    if (!preparedResult) return

    const disposable = QueryResource.retain(preparedResult)
    onCleanup(() => disposable.dispose())
  })

  const fragmentNode = createMemo(() => {
    const result = queryResult()
    if (!result) return
    const { fragmentNode, fragmentRef } = result
    const [node] = createFragmentNode(
      environment,
      fragmentNode,
      fragmentRef,
      componentDisplayName
    )
    return node
  })
  const data = createResource(
    () => fragmentNode()?.(),
    (node) => node.data,
    { storage: createDeepSignal }
  )

  return data
}
