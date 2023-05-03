import { getFragmentIdentifier, getSelector, isPromise } from 'relay-runtime'
import type { IEnvironment, ReaderFragment } from 'relay-runtime'
import { getPromiseForActiveRequest } from 'relay-runtime/lib/query/fetchQueryInternal'
import {
  createEffect,
  createMemo,
  createRenderEffect,
  createResource,
  onCleanup,
  onMount,
} from 'solid-js'
import type { Accessor } from 'solid-js'

import { getFragmentResourceForEnvironment } from '../utils/FragmentResource'
import type { FragmentResult } from '../utils/FragmentResource'
import { getQueryResourceForEnvironment } from '../utils/QueryResource'

export type FragmentNode<TFragmentData> = {
  data: TFragmentData
  disableStoreUpdates: () => void
  enableStoreUpdates: () => void
}

export function createFragmentNode<TFragmentData>(
  environment: IEnvironment,
  fragmentNode: ReaderFragment,
  fragmentRef: Accessor<unknown>,
  componentDisplayName: string
): Accessor<FragmentNode<TFragmentData> | undefined> {
  const QueryResource = getQueryResourceForEnvironment(environment)
  const FragmentResource = getFragmentResourceForEnvironment(environment)

  let isMounted = false
  const fragmentIdentifier = () =>
    getFragmentIdentifier(fragmentNode, fragmentRef())

  const getFragmentResult = () =>
    FragmentResource.readWithIdentifier(
      fragmentNode,
      fragmentRef(),
      fragmentIdentifier(),
      componentDisplayName
    )

  const [hasFragmentResult, { refetch: refreshFragmentResultStatus }] =
    createResource(
      () => {
        const ref = fragmentRef()
        console.log('ref', ref)
        return ref && fragmentIdentifier()
      },
      (identifier) => {
        console.log('fetching', identifier)
        function fetcher(
          fragmentResult: FragmentResult | Promise<void>
        ): true | Promise<true> {
          if (isPromise(fragmentResult)) {
            console.log('got promise', identifier)
            return fragmentResult.then(() => fetcher(getFragmentResult()))
          }
          console.log('got fragment result', identifier)
          return true
        }
        return fetcher(getFragmentResult())
      }
    )

  let isListeningForUpdates = true
  function enableStoreUpdates(fragmentResult: FragmentResult) {
    isListeningForUpdates = true
    const [didMissUpdates] = FragmentResource.checkMissedUpdates(fragmentResult)
    if (didMissUpdates) {
      handleDataUpdate()
    }
  }

  function disableStoreUpdates() {
    isListeningForUpdates = false
  }

  function handleDataUpdate() {
    if (!isMounted || !isListeningForUpdates) return

    void refreshFragmentResultStatus()
  }

  onMount(() => {
    isMounted = true
  })

  createRenderEffect(() => {
    if (!hasFragmentResult()) return

    const disposable = FragmentResource.subscribe(
      getFragmentResult() as FragmentResult,
      handleDataUpdate
    )
    onCleanup(() => disposable.dispose())
  })

  const [nodeData] = createResource(hasFragmentResult, () => {
    const result = getFragmentResult() as FragmentResult
    const data = result.data as TFragmentData
    console.log('nodeData', data)
    return data
  })

  const node = createMemo(() => {
    const data = nodeData()
    if (!data) return
    const result = getFragmentResult() as FragmentResult
    return {
      data,
      disableStoreUpdates,
      enableStoreUpdates() {
        enableStoreUpdates(result)
      },
    }
  })

  const fragmentOwner = createMemo(() => {
    const fragmentSelector = getSelector(fragmentNode, fragmentRef())
    if (!fragmentSelector) return
    const fragmentOwner =
      'selectors' in fragmentSelector
        ? fragmentSelector.selectors[0].owner
        : fragmentSelector.owner
    return fragmentOwner
  })

  const [payloads] = createResource(
    () => [fragmentOwner(), node()] as const,
    ([fragmentOwner, node]) => {
      if (!fragmentOwner?.identifier || !node) return
      const payloadQueue = QueryResource.flushPayloadQueue(
        fragmentOwner.identifier
      )
      return payloadQueue
    }
  )

  createEffect(() => {
    const payloadList = payloads()
    const owner = fragmentOwner()
    if (!owner) return

    for (const payload of payloadList ?? []) {
      QueryResource.publishReplayPayload(owner.identifier, payload)
    }

    const complete = () => QueryResource.completeReplay(owner.identifier)

    const promise = getPromiseForActiveRequest(environment, owner)
    if (promise) {
      void promise.then(complete)
    } else if (document.readyState !== 'complete') {
      // Handle streaming SSR
      document.addEventListener('DOMContentLoaded', complete)
      window.addEventListener('load', complete)
    } else {
      complete()
    }
  })

  return node
}
