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
import type { Accessor } from 'solid-js'

import { FragmentNode, createFragmentNode } from './createFragmentNode'
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
}): Accessor<FragmentNode<TQuery['response']> | undefined> {
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

  const [isQueryResultAvailable] = createResource(cacheIdentifier, () => {
    function fetcher(
      queryResult: QueryResult | Promise<void>
    ): true | Promise<true> {
      if (isPromise(queryResult)) {
        return queryResult.then(() => fetcher(getPreparedQueryResult()))
      }
      return true
    }
    return fetcher(getPreparedQueryResult())
  })

  createEffect(() => {
    if (!isQueryResultAvailable()) return

    const disposable = QueryResource.retain(
      getPreparedQueryResult() as QueryResult
    )
    onCleanup(() => disposable.dispose())
  })

  const fragmentNode = createMemo(() => {
    if (!isQueryResultAvailable()) return
    const { fragmentNode, fragmentRef } =
      getPreparedQueryResult() as QueryResult
    return createFragmentNode(
      environment,
      fragmentNode,
      () => fragmentRef,
      componentDisplayName
    )
  })

  return () => fragmentNode()?.()
}
