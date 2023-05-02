import { getFragment } from 'relay-runtime'
import type { GraphQLTaggedNode } from 'relay-runtime'
import type {
  KeyType,
  KeyTypeData,
  ArrayKeyType,
  ArrayKeyTypeData,
} from 'relay-runtime/lib/store/ResolverFragments'
import { createResource } from 'solid-js'
import type { ResourceReturn } from 'solid-js'
import { unwrap } from 'solid-js/store'

import { createFragmentNode } from './createFragmentNode'
import { useRelayEnvironment } from '../RelayEnvironment'

export function createFragment<TKey extends KeyType>(
  fragment: GraphQLTaggedNode,
  key: TKey
): ResourceReturn<KeyTypeData<TKey>>
export function createFragment<TKey extends KeyType>(
  fragment: GraphQLTaggedNode,
  key: TKey | null
): ResourceReturn<KeyTypeData<TKey> | null>
export function createFragment<TKey extends ArrayKeyType>(
  fragment: GraphQLTaggedNode,
  key: TKey
): ResourceReturn<ArrayKeyTypeData<TKey>>
export function createFragment<TKey extends ArrayKeyType>(
  fragment: GraphQLTaggedNode,
  key: TKey | null
): ResourceReturn<ArrayKeyTypeData<TKey> | null> {
  const environment = useRelayEnvironment()
  const fragmentNode = getFragment(fragment)
  return createResource(
    createFragmentNode(
      environment,
      fragmentNode,
      unwrap(key),
      'createFragment()'
    )[0],
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
    (node) => node.data as any
  )
}
