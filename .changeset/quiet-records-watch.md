---
"solid-relay": patch
---

feat: add `createSubscriptionToInvalidationState`

Solid counterpart of React Relay's `useSubscribeToInvalidationState`. Subscribes a callback to the invalidation state of a set of data IDs, re-establishing the subscription when the IDs change and disposing it on cleanup.
