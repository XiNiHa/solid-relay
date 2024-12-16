# Solid Relay Example

This is a SolidStart project that uses Solid Relay, demonstrating various features:

- Basic GraphQL/Relay features like queries, fragments, mutations, paginations, etc.
- Suspense and Transitions integration
- SSR support, including streaming of `@defer`red queries
- Preloading support with Solid Router
- Server side fetching with `"use server"` on the network layer

## Running the example

Due to a Relay compiler requirement, [Watchman](https://facebook.github.io/watchman/) should be installed to run the compiler in watch mode.

```sh
pnpm i
pnpm dev
```

The command will launch the SolidStart dev server, the Relay compiler, and the example GraphQL API server.
