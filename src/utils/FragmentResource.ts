import {
  ID_KEY,
  RelayFeatureFlags,
  createOperationDescriptor,
  getFragmentIdentifier,
  getSelector,
  getVariablesFromFragment,
  isPromise,
  __internal,
  handlePotentialSnapshotErrors,
  recycleNodesInto,
  getPendingOperationsForFragment,
} from 'relay-runtime'
import type {
  ConcreteRequest,
  DataID,
  Disposable,
  IEnvironment,
  ReaderFragment,
  RequestDescriptor,
  Snapshot,
} from 'relay-runtime'
import { getPromiseForActiveRequest } from 'relay-runtime/lib/query/fetchQueryInternal'
import type { MissingLiveResolverField } from 'relay-runtime/lib/store/RelayStoreTypes'
import invariant from 'tiny-invariant'

import * as LRUCache from './LRUCache'
import {
  QueryResource,
  QueryResult,
  getQueryResourceForEnvironment,
} from './QueryResource'
import SuspenseResource from './SuspenseResource'

type FragmentResourceCache = LRUCache.Cache<
  | {
      kind: 'pending'
      pendingOperations: readonly RequestDescriptor[]
      promise: Promise<void>
      result: FragmentResult
    }
  | { kind: 'done'; result: FragmentResult }
>

const WEAKMAP_SUPPORTED = typeof WeakMap === 'function'
interface IMap<K, V> {
  get(key: K): V | void
  set(key: K, value: V): IMap<K, V>
}

type SingularOrPluralSnapshot = Snapshot | readonly Snapshot[]

export type FragmentResult = {
  cacheKey: string
  data: unknown
  isMissingData: boolean
  snapshot: SingularOrPluralSnapshot | null
  storeEpoch: number
}

const CACHE_CAPACITY = 1000000

const CONSTANT_READONLY_EMPTY_ARRAY = Object.freeze([])

function isMissingData(snapshot: SingularOrPluralSnapshot): boolean {
  if ('length' in snapshot) {
    return snapshot.some((s) => s.isMissingData)
  }
  return snapshot.isMissingData
}

function hasMissingClientEdges(snapshot: SingularOrPluralSnapshot): boolean {
  if ('length' in snapshot) {
    return snapshot.some((s) => (s.missingClientEdges?.length ?? 0) > 0)
  }
  return (snapshot.missingClientEdges?.length ?? 0) > 0
}

function missingLiveResolverFields(
  snapshot: SingularOrPluralSnapshot
): readonly MissingLiveResolverField[] | undefined {
  if ('length' in snapshot) {
    return snapshot
      .map((s) => s.missingLiveResolverFields)
      .filter(Boolean)
      .flat()
  }
  return snapshot.missingLiveResolverFields
}

function getFragmentResult(
  cacheKey: string,
  snapshot: SingularOrPluralSnapshot,
  storeEpoch: number
): FragmentResult {
  if ('length' in snapshot) {
    return {
      cacheKey,
      snapshot,
      data: snapshot.map((s) => s.data),
      isMissingData: isMissingData(snapshot),
      storeEpoch,
    }
  }
  return {
    cacheKey,
    snapshot,
    data: snapshot.data,
    isMissingData: isMissingData(snapshot),
    storeEpoch,
  }
}

class ClientEdgeQueryResultsCache {
  #cache: Map<string, [Array<QueryResult>, SuspenseResource]> = new Map()
  #retainCounts: Map<string, number> = new Map()
  #environment: IEnvironment

  constructor(environment: IEnvironment) {
    this.#environment = environment
  }

  get(fragmentIdentifier: string): void | Array<QueryResult> {
    return this.#cache.get(fragmentIdentifier)?.[0] ?? undefined
  }

  recordQueryResults(
    fragmentIdentifier: string,
    value: QueryResult[] // may be mutated after being passed here
  ): void {
    const existing = this.#cache.get(fragmentIdentifier)
    if (!existing) {
      const suspenseResource = new SuspenseResource(() =>
        this.#retain(fragmentIdentifier)
      )
      this.#cache.set(fragmentIdentifier, [value, suspenseResource])
      suspenseResource.temporaryRetain(this.#environment)
    } else {
      const [existingResults, suspenseResource] = existing
      value.forEach((queryResult) => {
        existingResults.push(queryResult)
      })
      suspenseResource.temporaryRetain(this.#environment)
    }
  }

  #retain(id: string): { dispose: () => void } {
    const retainCount = (this.#retainCounts.get(id) ?? 0) + 1
    this.#retainCounts.set(id, retainCount)
    return {
      dispose: () => {
        const newRetainCount = (this.#retainCounts.get(id) ?? 0) - 1
        if (newRetainCount > 0) {
          this.#retainCounts.set(id, newRetainCount)
        } else {
          this.#retainCounts.delete(id)
          this.#cache.delete(id)
        }
      },
    }
  }
}

class FragmentResource {
  #environment: IEnvironment
  #cache: FragmentResourceCache = LRUCache.create(CACHE_CAPACITY)
  #clientEdgeQueryResultsCache: void | ClientEdgeQueryResultsCache

  constructor(environment: IEnvironment) {
    this.#environment = environment
    if (RelayFeatureFlags.ENABLE_CLIENT_EDGES) {
      this.#clientEdgeQueryResultsCache = new ClientEdgeQueryResultsCache(
        environment
      )
    }
  }

  read(
    fragmentNode: ReaderFragment,
    fragmentRef: unknown,
    componentDisplayName: string,
    fragmentKey?: string
  ): FragmentResult | Promise<void> {
    return this.readWithIdentifier(
      fragmentNode,
      fragmentRef,
      getFragmentIdentifier(fragmentNode, fragmentRef),
      componentDisplayName,
      fragmentKey
    )
  }

  readWithIdentifier(
    fragmentNode: ReaderFragment,
    fragmentRef: unknown,
    fragmentIdentifier: string,
    componentDisplayName: string,
    fragmentKey?: string
  ): FragmentResult | Promise<void> {
    const environment = this.#environment

    if (fragmentRef == null) {
      return {
        cacheKey: fragmentIdentifier,
        data: null,
        isMissingData: false,
        snapshot: null,
        storeEpoch: 0,
      }
    }

    const storeEpoch = environment.getStore().getEpoch()

    if (fragmentNode?.metadata?.plural) {
      invariant(
        Array.isArray(fragmentRef),
        `solid-relay: Expected fragment pointer${
          fragmentKey != null ? ` for key \`${fragmentKey}\`` : ''
        } for fragment \`${fragmentNode.name}\` to be ` +
          `an array, instead got \`${typeof fragmentRef}\`. Remove \`@relay(plural: true)\` ` +
          `from fragment \`${fragmentNode.name}\` to allow the prop to be an object.`
      )
      if (fragmentRef.length === 0) {
        return {
          cacheKey: fragmentIdentifier,
          data: CONSTANT_READONLY_EMPTY_ARRAY,
          isMissingData: false,
          snapshot: CONSTANT_READONLY_EMPTY_ARRAY,
          storeEpoch,
        }
      }
    }

    const cachedValue = this.#cache.get(fragmentIdentifier)
    if (cachedValue != null) {
      if (cachedValue.kind === 'pending' && isPromise(cachedValue.promise)) {
        return cachedValue.promise
      } else if (
        cachedValue.kind === 'done' &&
        cachedValue.result.snapshot &&
        !missingLiveResolverFields(cachedValue.result.snapshot)?.length
      ) {
        this.#throwOrLogErrorsInSnapshot(cachedValue.result.snapshot)

        return cachedValue.result
      }
    }

    const fragmentSelector = getSelector(fragmentNode, fragmentRef)
    invariant(
      fragmentSelector != null,
      `solid-relay: Expected to receive an object where \`...${fragmentNode.name}\` was spread, ` +
        `but the fragment reference was not found\`. This is most ` +
        `likely the result of:\n` +
        `- Forgetting to spread \`${fragmentNode.name}\` in \`${componentDisplayName}\`'s parent's fragment.\n` +
        `- Conditionally fetching \`${
          fragmentNode.name
        }\` but unconditionally passing ${
          fragmentKey == null
            ? 'a fragment reference'
            : `the \`${fragmentKey}\``
        } prop ` +
        `to \`${componentDisplayName}\`. If the parent fragment only fetches the fragment conditionally ` +
        `- with e.g. \`@include\`, \`@skip\`, or inside a \`... on SomeType { }\` ` +
        `spread  - then the fragment reference will not exist. ` +
        `In this case, pass \`null\` if the conditions for evaluating the ` +
        `fragment are not met (e.g. if the \`@include(if)\` value is false.)`
    )

    const snapshot =
      'selectors' in fragmentSelector
        ? fragmentSelector.selectors.map((s) => environment.lookup(s))
        : environment.lookup(fragmentSelector)

    const fragmentResult = getFragmentResult(
      fragmentIdentifier,
      snapshot,
      storeEpoch
    )
    if (!fragmentResult.isMissingData) {
      this.#throwOrLogErrorsInSnapshot(snapshot)

      return fragmentResult
    }

    let clientEdgeRequests: RequestDescriptor[] | null = null
    if (
      RelayFeatureFlags.ENABLE_CLIENT_EDGES &&
      fragmentNode.metadata?.hasClientEdges === true &&
      hasMissingClientEdges(snapshot)
    ) {
      clientEdgeRequests = []
      const queryResource = getQueryResourceForEnvironment(this.#environment)
      const queryResults: QueryResult[] = []
      for (const snap of 'length' in snapshot ? snapshot : [snapshot]) {
        for (const {
          request,
          clientEdgeDestinationID,
        } of snap.missingClientEdges ?? []) {
          const { queryResult, requestDescriptor } =
            this.#performClientEdgeQuery(
              queryResource,
              fragmentNode,
              fragmentRef,
              request,
              clientEdgeDestinationID
            )
          if (isPromise(queryResult)) return queryResult
          queryResults.push(queryResult)
          clientEdgeRequests?.push(requestDescriptor)
        }
      }
      invariant(
        this.#clientEdgeQueryResultsCache != null,
        'Client edge query result cache should exist when ENABLE_CLIENT_EDGES is on.'
      )
      this.#clientEdgeQueryResultsCache.recordQueryResults(
        fragmentIdentifier,
        queryResults
      )
    }
    let clientEdgePromises: Promise<void>[] = []
    if (RelayFeatureFlags.ENABLE_CLIENT_EDGES && clientEdgeRequests) {
      clientEdgePromises = clientEdgeRequests
        .map((request) =>
          getPromiseForActiveRequest(this.#environment, request)
        )
        .filter(Boolean)
    }

    const fragmentOwner =
      'selectors' in fragmentSelector
        ? fragmentSelector.selectors[0].owner
        : fragmentSelector.owner
    const parentQueryPromiseResult =
      this.#getAndSavePromiseForFragmentRequestInFlight(
        fragmentIdentifier,
        fragmentNode,
        fragmentOwner,
        fragmentResult
      ) as { promise: Promise<void> } | undefined // TODO: remove typecast
    const parentQueryPromiseResultPromise = parentQueryPromiseResult?.promise
    const missingResolverFieldPromises =
      missingLiveResolverFields(snapshot)?.map(({ liveStateID }) => {
        const store = environment.getStore()

        // LiveResolverStore is not typed yet in @types/relay-runtime
        return (
          store as unknown as {
            getLiveResolverPromise(id: DataID): Promise<void>
          }
        ).getLiveResolverPromise(liveStateID)
      }) ?? []

    if (
      clientEdgePromises.length ||
      missingResolverFieldPromises.length ||
      isPromise(parentQueryPromiseResultPromise)
    ) {
      let promises: Promise<void>[] = []
      if (clientEdgePromises.length > 0) {
        promises = promises.concat(clientEdgePromises)
      }
      if (missingResolverFieldPromises.length > 0) {
        promises = promises.concat(missingResolverFieldPromises)
      }

      if (promises.length > 0) {
        if (parentQueryPromiseResultPromise) {
          promises.push(parentQueryPromiseResultPromise)
        }
        return Promise.all(promises).then((v) => void v)
      }

      if (parentQueryPromiseResultPromise) {
        return parentQueryPromiseResultPromise
      }
    }

    this.#throwOrLogErrorsInSnapshot(snapshot)

    return getFragmentResult(fragmentIdentifier, snapshot, storeEpoch)
  }

  #performClientEdgeQuery(
    queryResource: QueryResource,
    fragmentNode: ReaderFragment,
    fragmentRef: unknown,
    request: ConcreteRequest,
    clientEdgeDestinationID: DataID
  ): {
    requestDescriptor: RequestDescriptor
    queryResult: QueryResult | Promise<void>
  } {
    const originalVariables = getVariablesFromFragment(
      fragmentNode,
      fragmentRef
    )
    const variables = {
      ...originalVariables,
      [ID_KEY]: clientEdgeDestinationID,
    }
    const operation = createOperationDescriptor(request, variables, {})
    const fetchObservable = __internal.fetchQuery(this.#environment, operation)
    const queryResult = queryResource.prepare(operation, fetchObservable)
    return { requestDescriptor: operation.request, queryResult }
  }

  #throwOrLogErrorsInSnapshot(snapshot: SingularOrPluralSnapshot) {
    if ('length' in snapshot) {
      snapshot.forEach((s) => {
        handlePotentialSnapshotErrors(
          this.#environment,
          s.missingRequiredFields,
          s.relayResolverErrors
        )
      })
    } else {
      handlePotentialSnapshotErrors(
        this.#environment,
        snapshot.missingRequiredFields,
        snapshot.relayResolverErrors
      )
    }
  }

  readSpec(
    fragmentNodes: { [k: string]: ReaderFragment },
    fragmentRefs: { [k: string]: unknown },
    componentDisplayName: string
  ): { [k: string]: FragmentResult } | Promise<void> {
    const result: { [k: string]: FragmentResult } = {}
    for (const key in fragmentNodes) {
      const v = this.read(
        fragmentNodes[key],
        fragmentRefs[key],
        componentDisplayName,
        key
      )
      if (isPromise(v)) return v
      result[key] = v
    }
    return result
  }

  subscribe(fragmentResult: FragmentResult, callback: () => void): Disposable {
    const environment = this.#environment
    const { cacheKey } = fragmentResult
    const renderedSnapshot = fragmentResult.snapshot
    if (!renderedSnapshot) {
      return {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        dispose() {},
      }
    }

    const [didMissUpdates, currentSnapshot] =
      this.checkMissedUpdates(fragmentResult)

    if (didMissUpdates) callback()

    const disposables: Disposable[] = []
    if ('length' in renderedSnapshot) {
      invariant(
        currentSnapshot && 'length' in currentSnapshot,
        'solid-relay: Expected snapshots to be plural. ' +
          "If you're seeing this, this is likely a bug in solid-relay."
      )
      currentSnapshot.forEach((snapshot, idx) => {
        disposables.push(
          environment.subscribe(snapshot, (latestSnapshot) => {
            const storeEpoch = environment.getStore().getEpoch()
            this.#updatePluralSnapshot(
              cacheKey,
              currentSnapshot,
              latestSnapshot,
              idx,
              storeEpoch
            )
            callback()
          })
        )
      })
    } else {
      invariant(
        currentSnapshot != null && !('length' in currentSnapshot),
        'solid-relay: Expected snapshot to be singular. ' +
          "If you're seeing this, this is likely a bug in solid-relay."
      )
      disposables.push(
        environment.subscribe(currentSnapshot, (latestSnapshot) => {
          const storeEpoch = environment.getStore().getEpoch()
          this.#cache.set(cacheKey, {
            kind: 'done',
            result: getFragmentResult(cacheKey, latestSnapshot, storeEpoch),
          })
          callback()
        })
      )
    }

    if (RelayFeatureFlags.ENABLE_CLIENT_EDGES) {
      const clientEdgeQueryResults =
        this.#clientEdgeQueryResultsCache?.get(cacheKey) ?? undefined
      if (clientEdgeQueryResults?.length) {
        const queryResource = getQueryResourceForEnvironment(environment)
        clientEdgeQueryResults.forEach((queryResult) => {
          disposables.push(queryResource.retain(queryResult))
        })
      }
    }

    return {
      dispose: () => {
        disposables.forEach((s) => s.dispose())
        this.#cache.delete(cacheKey)
      },
    }
  }

  subscribeSpec(
    fragmentResults: { [k: string]: FragmentResult },
    callback: () => void
  ): Disposable {
    const disposables = Object.keys(fragmentResults).map((key) =>
      this.subscribe(fragmentResults[key], callback)
    )
    return {
      dispose: () => {
        disposables.forEach((disposable) => {
          disposable.dispose()
        })
      },
    }
  }

  checkMissedUpdates(
    fragmentResult: FragmentResult
  ): [boolean /* were updates missed? */, SingularOrPluralSnapshot | null] {
    const environment = this.#environment
    const renderedSnapshot = fragmentResult.snapshot
    if (!renderedSnapshot) {
      return [false, null]
    }

    let storeEpoch = null
    // Bail out if the store hasn't been written since last read
    storeEpoch = environment.getStore().getEpoch()
    if (fragmentResult.storeEpoch === storeEpoch) {
      return [false, fragmentResult.snapshot]
    }

    const { cacheKey } = fragmentResult

    if ('length' in renderedSnapshot) {
      let didMissUpdates = false
      const currentSnapshots: Snapshot[] = []
      renderedSnapshot.forEach((snapshot, idx) => {
        let currentSnapshot: Snapshot = environment.lookup(snapshot.selector)
        const renderData = snapshot.data
        const currentData = currentSnapshot.data
        const updatedData = recycleNodesInto(renderData, currentData)
        if (updatedData !== renderData) {
          currentSnapshot = { ...currentSnapshot, data: updatedData }
          didMissUpdates = true
        }
        currentSnapshots[idx] = currentSnapshot
      })
      // Only update the cache when the data is changed to avoid
      // returning different `data` instances
      if (didMissUpdates) {
        this.#cache.set(cacheKey, {
          kind: 'done',
          result: getFragmentResult(cacheKey, currentSnapshots, storeEpoch),
        })
      }
      return [didMissUpdates, currentSnapshots]
    }
    const currentSnapshot = environment.lookup(renderedSnapshot.selector)
    const renderData = renderedSnapshot.data
    const currentData = currentSnapshot.data
    const updatedData = recycleNodesInto(renderData, currentData)
    const updatedCurrentSnapshot: Snapshot = {
      data: updatedData,
      isMissingData: currentSnapshot.isMissingData,
      missingClientEdges: currentSnapshot.missingClientEdges,
      missingLiveResolverFields: currentSnapshot.missingLiveResolverFields,
      seenRecords: currentSnapshot.seenRecords,
      selector: currentSnapshot.selector,
      missingRequiredFields: currentSnapshot.missingRequiredFields,
      relayResolverErrors: currentSnapshot.relayResolverErrors,
    }
    if (updatedData !== renderData) {
      this.#cache.set(cacheKey, {
        kind: 'done',
        result: getFragmentResult(cacheKey, updatedCurrentSnapshot, storeEpoch),
      })
    }
    return [updatedData !== renderData, updatedCurrentSnapshot]
  }

  checkMissedUpdatesSpec(fragmentResults: {
    [k: string]: FragmentResult
  }): boolean {
    return Object.keys(fragmentResults).some(
      (key) => this.checkMissedUpdates(fragmentResults[key])[0]
    )
  }

  #getAndSavePromiseForFragmentRequestInFlight(
    cacheKey: string,
    fragmentNode: ReaderFragment,
    fragmentOwner: RequestDescriptor,
    fragmentResult: FragmentResult
  ): {
    promise: Promise<void>
    pendingOperations: readonly RequestDescriptor[]
  } | null {
    const pendingOperationsResult = getPendingOperationsForFragment(
      this.#environment,
      fragmentNode,
      fragmentOwner
    )
    if (pendingOperationsResult == null) {
      return null
    }

    // When the Promise for the request resolves, we need to make sure to
    // update the cache with the latest data available in the store before
    // resolving the Promise
    const networkPromise = pendingOperationsResult.promise
    const pendingOperations = pendingOperationsResult.pendingOperations
    const promise = networkPromise
      .then(() => {
        this.#cache.delete(cacheKey)
      })
      .catch<void>((error: Error) => {
        this.#cache.delete(cacheKey)
      })
    // @ts-expect-error(2339) Expando to annotate Promises.
    promise.displayName = (
      networkPromise as unknown as { displayName: string }
    ).displayName
    this.#cache.set(cacheKey, {
      kind: 'pending',
      pendingOperations,
      promise,
      result: fragmentResult,
    })
    return { promise, pendingOperations }
  }

  #updatePluralSnapshot(
    cacheKey: string,
    baseSnapshots: readonly Snapshot[],
    latestSnapshot: Snapshot,
    idx: number,
    storeEpoch: number
  ): void {
    const currentFragmentResult = this.#cache.get(cacheKey)
    if (isPromise(currentFragmentResult)) {
      reportInvalidCachedData(latestSnapshot.selector.node.name)
      return
    }

    const currentSnapshot = currentFragmentResult?.result?.snapshot
    if (currentSnapshot && !('length' in currentSnapshot)) {
      reportInvalidCachedData(latestSnapshot.selector.node.name)
      return
    }

    const nextSnapshots = currentSnapshot
      ? [...currentSnapshot]
      : [...baseSnapshots]
    nextSnapshots[idx] = latestSnapshot
    this.#cache.set(cacheKey, {
      kind: 'done',
      result: getFragmentResult(cacheKey, nextSnapshots, storeEpoch),
    })
  }
}

function reportInvalidCachedData(nodeName: string): void {
  invariant(
    false,
    `Relay: Expected to find cached data for plural fragment \`${nodeName}\` when ` +
      'receiving a subscription. ' +
      "If you're seeing this, this is likely a bug in Relay."
  )
}

export function createFragmentResource(
  environment: IEnvironment
): FragmentResource {
  return new FragmentResource(environment)
}

const dataResources: IMap<IEnvironment, FragmentResource> = WEAKMAP_SUPPORTED
  ? new WeakMap()
  : new Map()

export function getFragmentResourceForEnvironment(
  environment: IEnvironment
): FragmentResource {
  const cached = dataResources.get(environment)
  if (cached) return cached
  const newDataResource = createFragmentResource(environment)
  dataResources.set(environment, newDataResource)
  return newDataResource
}
