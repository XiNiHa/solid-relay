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

  const [preparedQueryResult] = createResource(() => {
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
    if (!preparedQueryResult()) return

    const disposable = QueryResource.retain(
      getPreparedQueryResult() as QueryResult
    )
    onCleanup(() => disposable.dispose())
  })

  const fragmentNode = createFragmentNode(
    environment,
    () => preparedQueryResult()?.fragmentNode,
    () => preparedQueryResult()?.fragmentRef,
    componentDisplayName
  )

  return () => fragmentNode()
}
