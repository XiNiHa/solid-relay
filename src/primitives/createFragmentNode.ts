import { getFragmentIdentifier, getSelector, isPromise } from 'relay-runtime'
import type { IEnvironment, ReaderFragment } from 'relay-runtime'
import { getPromiseForActiveRequest } from 'relay-runtime/lib/query/fetchQueryInternal'
import {
  createEffect,
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
  fragmentNode: Accessor<ReaderFragment | undefined>,
  fragmentRef: Accessor<unknown>,
  componentDisplayName: string
): Accessor<FragmentNode<TFragmentData> | undefined> {
  const QueryResource = getQueryResourceForEnvironment(environment)
  const FragmentResource = getFragmentResourceForEnvironment(environment)

  let isMounted = false
  const fragmentIdentifier = (node: ReaderFragment) =>
    getFragmentIdentifier(node, fragmentRef())

  const getFragmentResult = (node: ReaderFragment) =>
    FragmentResource.readWithIdentifier(
      node,
      fragmentRef(),
      fragmentIdentifier(node),
      componentDisplayName
    )

  const [fragmentNodeWithResult, { refetch: refreshFragmentResultStatus }] =
    createResource(
      () => {
        const ref = fragmentRef()
        const node = fragmentNode()
        if (!ref || !node) return
        return node
      },
      (node) => {
        function fetcher(
          fragmentResult: FragmentResult | Promise<void>
        ): ReaderFragment | Promise<ReaderFragment> {
          if (isPromise(fragmentResult)) {
            return fragmentResult.then(() => fetcher(getFragmentResult(node)))
          }
          return node
        }
        return fetcher(getFragmentResult(node))
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
    const fragmentNode = fragmentNodeWithResult()
    if (!fragmentNode) return

    const disposable = FragmentResource.subscribe(
      getFragmentResult(fragmentNode) as FragmentResult,
      handleDataUpdate
    )
    onCleanup(() => disposable.dispose())
  })

  const [nodeData] = createResource(fragmentNodeWithResult, (node) => {
    const result = getFragmentResult(node) as FragmentResult
    const data = result.data as TFragmentData
    return { node, data }
  })

  const node = () => {
    const { node, data } = nodeData() ?? {}
    if (!node || !data) return
    const result = getFragmentResult(node) as FragmentResult
    return {
      data,
      disableStoreUpdates,
      enableStoreUpdates() {
        enableStoreUpdates(result)
      },
    }
  }

  const fragmentOwner = () => {
    const ref = fragmentRef()
    const node = fragmentNode()
    if (!node) return
    const fragmentSelector = getSelector(node, ref)
    if (!fragmentSelector) return
    const fragmentOwner =
      'selectors' in fragmentSelector
        ? fragmentSelector.selectors[0].owner
        : fragmentSelector.owner
    return fragmentOwner
  }

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
