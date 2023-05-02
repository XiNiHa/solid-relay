import type { Subscription } from 'relay-runtime'
import { onCleanup } from 'solid-js'

export function createFetchManager() {
  let subscription: Subscription | null = null
  let isFetching = false

  const manager = {
    get isFetching() {
      return isFetching
    },

    dispose: () => {
      if (subscription != null) {
        subscription.unsubscribe()
        subscription = null
      }
      isFetching = false
    },

    start: (newSubscription: Subscription) => {
      subscription = newSubscription
      isFetching = true
    },

    complete: () => {
      subscription = null
      isFetching = false
    },
  }

  onCleanup(() => manager.dispose())

  return manager
}
