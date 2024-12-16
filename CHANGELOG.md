# solid-relay

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
