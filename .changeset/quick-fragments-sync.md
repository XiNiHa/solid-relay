---
"solid-relay": patch
---

fix: publish fragment results synchronously

`createFragment` deferred every `observeFragment` result to a microtask, including the first snapshot emitted synchronously on subscribe for data already in the store. Nested fragment components therefore needed one microtask turn per level, and when mounted inside a pending Solid transition (e.g. a router navigation) each level's gating memo was computed on both the normal and the transition branch, re-creating the subtree `2^depth - 1` times. Results are now published synchronously, and the underlying resource resolves immediately for data already in the store instead of becoming pending.
