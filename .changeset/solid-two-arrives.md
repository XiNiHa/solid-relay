---
"solid-relay": major
---

feat!: migrate to Solid 2.0

Peer dependencies are now `solid-js` and `@solidjs/web` ^2.0.0 and `seroval` ^1.8.0. Behavior changes:

- Reading pending data with `data()` outside a `Loading` boundary throws `NotReadyError`; use `data.latest` to read without suspending.
- A variable change keeps the previous data on screen until the new query settles; `data.pending` and `data.latest` describe the last committed result, so use `isPending(() => data())` for a refresh indicator.
- A `createQueryLoader` reference commits once its query settles; nest the `Loading` boundary inside the `Show` that checks it.
- `Errored` recovers automatically when the data that caused an error becomes valid again.
- An invalid preloaded query reference (disposed, or from another environment) reaches the nearest `Errored` boundary instead of throwing during render.
- `refetch` keeps `isLoadingNext` and `isLoadingPrevious` true until it settles, although it cancels the in-flight request immediately.
- `loadQuery`, `refetch`, and `loadNext` called during render throw in development instead of being ignored.
- During SSR, error messages reach the client as `Internal Server Error` unless marked with `markSafeError`.
