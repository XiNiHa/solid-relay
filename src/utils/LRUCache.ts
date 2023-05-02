// A slightly modified version of LRUCache from https://github.com/facebook/relay/blob/46fa2faf0ecccd42bf6bebddb214be9446d3dcab/packages/react-relay/relay-hooks/LRUCache.js

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in https://github.com/facebook/relay/blob/46fa2faf0ecccd42bf6bebddb214be9446d3dcab/LICENSE.
 */

import invariant from 'tiny-invariant'

export interface Cache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  has(key: string): boolean
  delete(key: string): void
  size(): number
  capacity(): number
  clear(): void
}

class LRUCache<T> implements Cache<T> {
  #capacity: number
  #map: Map<string, T> = new Map()

  constructor(capacity: number) {
    this.#capacity = capacity
    invariant(
      this.#capacity > 0,
      'LRUCache: Unable to create instance of cache with zero or negative capacity.'
    )
  }

  set(key: string, value: T): void {
    this.#map.delete(key)
    this.#map.set(key, value)
    if (this.#map.size > this.#capacity) {
      const firstKey = this.#map.keys().next()
      if (!firstKey.done) {
        this.#map.delete(firstKey.value)
      }
    }
  }

  get(key: string): T | undefined {
    const value = this.#map.get(key)
    if (value != null) {
      this.#map.delete(key)
      this.#map.set(key, value)
    }
    return value
  }

  has(key: string): boolean {
    return this.#map.has(key)
  }

  delete(key: string): void {
    this.#map.delete(key)
  }

  size(): number {
    return this.#map.size
  }

  capacity(): number {
    return this.#capacity - this.#map.size
  }

  clear(): void {
    this.#map.clear()
  }
}

export function create<T>(capacity: number): LRUCache<T> {
  return new LRUCache<T>(capacity)
}
