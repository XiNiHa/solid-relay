# solid-relay

## 1.0.0-beta.6

### Patch Changes

- cafa7e1: chore: make useRelayEnvironment as a normal function

## 1.0.0-beta.5

### Patch Changes

- 3cd5a7e: fix: hydrate correctly on loader suspend

## 1.0.0-beta.4

### Patch Changes

- 95dbcba: fix: support preloaded queries wrapped in promise
- 119daf0: chore: use bundleless mode for production build
- b3c8837: fix: respect fetchPolicy in preloaded queries

## 1.0.0-beta.3

### Patch Changes

- 17975ef: chore: replace deep-equal with dequal
- 8292d3d: chore: bump dependencies

## 1.0.0-beta.2

### Patch Changes

- 65eedeb: fix: throw error on DataProxy access if any
- c5d0a1a: fix: respect fetchPolicy of `createLazyLoadQuery`

## 1.0.0-beta.1

### Patch Changes

- 7b648bf: docs: remove scary warnings in README

## 1.0.0-beta.0

### Major Changes

- chore: start v1.0 beta phase

## 0.3.0

### Minor Changes

- 8af0968: feat: make PreloadedQuery serializable
- 6fcb2bf: feat: add `createSubscription()`
- cedfb55: feat: add `createPaginationFragment()`
- cbec836: fix: make useRelayEnvironment return an accessor
- f277eab: feat: add `createPreloadedQuery()`

### Patch Changes

- 40a6756: feat: introduce query caching and deduping
- e17ba84: fix: properly catch query errors while hydrating

## 0.2.2

### Patch Changes

- 3ee9a42: Revert "chore: support moduleResolution: nodenext"

## 0.2.1

### Patch Changes

- 340d136: chore: support moduleResolution: nodenext

## 0.2.0

### Minor Changes

- 7fc7723: feat: add `createRefetchableFragment()`

### Patch Changes

- 823242f: fix: resolve various reliability issues of createLazyLoadQuery
- b6417fa: chore: bump `@types/relay-runtime`
- b1d886a: feat: reconcile data stores

## 0.1.0

### Minor Changes

- 10de6eb: Rework implementation using observeFragment, including SSR and defer support

## 0.0.1

### Patch Changes

- 746fafb: add createLazyLoadQuery and createFragment
