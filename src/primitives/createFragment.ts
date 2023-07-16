import { getFragment } from 'relay-runtime'
import type { GraphQLTaggedNode } from 'relay-runtime'
import type {
  KeyType,
  KeyTypeData,
  ArrayKeyType,
  ArrayKeyTypeData,
} from 'relay-runtime/lib/store/ResolverFragments'
import type { Accessor } from 'solid-js'

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
    () => fragmentNode,
    () => key(),
    'createFragment()'
  )

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
  return () => node()?.data as any
}
