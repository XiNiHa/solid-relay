import { getFragment } from 'relay-runtime'
import type { GraphQLTaggedNode } from 'relay-runtime'
import type {
  KeyType,
  KeyTypeData,
  ArrayKeyType,
  ArrayKeyTypeData,
} from 'relay-runtime/lib/store/ResolverFragments'
import { createComputed } from 'solid-js'
import type { Accessor } from 'solid-js'
import { createStore, reconcile, unwrap } from 'solid-js/store'

import { createFragmentNode } from './createFragmentNode'
import { useRelayEnvironment } from '../RelayEnvironment'

export function createFragment<TKey extends KeyType>(
  fragment: GraphQLTaggedNode,
  key: Accessor<TKey>
): Accessor<KeyTypeData<TKey> | undefined>
export function createFragment<TKey extends KeyType>(
  fragment: GraphQLTaggedNode,
  key: Accessor<TKey | null>
): Accessor<KeyTypeData<TKey> | null | undefined>
export function createFragment<TKey extends ArrayKeyType>(
  fragment: GraphQLTaggedNode,
  key: Accessor<TKey>
): Accessor<ArrayKeyTypeData<TKey> | undefined>
export function createFragment<TKey extends ArrayKeyType>(
  fragment: GraphQLTaggedNode,
  key: Accessor<TKey | null>
): Accessor<ArrayKeyTypeData<TKey> | null | undefined> {
  const environment = useRelayEnvironment()
  const fragmentNode = getFragment(fragment)
  const node = createFragmentNode(
    environment,
    fragmentNode,
    () => unwrap(key()),
    'createFragment()'
  )

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
  return () => node()?.data as any

  // const [dataStore, setDataStore] = createStore<[unknown | null]>([null])

  // createComputed(() => {
  //   const currentNode = node()
  //   setDataStore(0, reconcile(currentNode?.data))
  // })

  // // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
  // return () => dataStore[0] as any
}
