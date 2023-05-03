import {
  Store,
  RecordSource,
  Environment,
  Network,
  Observable,
} from 'relay-runtime'
import type {
  FetchFunction,
  IEnvironment,
  GraphQLResponse,
} from 'relay-runtime'
import { meros } from 'meros/browser'

const fetchFn: FetchFunction = (params, variables) =>
  Observable.create((sink) => {
    ;(async () => {
      if (typeof window !== 'undefined') {
        return sink.error(new Error('This fetch function is for SSR only.'))
      }

      const response = await fetch('http://0.0.0.0:4000/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, multipart/mixed',
        },
        body: JSON.stringify({ query: params.text, variables }),
      })

      const parts = await meros(response)

      if (isAsyncIterable(parts)) {
        for await (const part of parts) {
          if (!part.json) {
            sink.error(new Error('Failed to parse part as json.'))
            break
          }
          sink.next(part.body as GraphQLResponse)
          if (!(part.body as { hasNext: boolean }).hasNext) {
            break
          }
        }
      } else {
        sink.next(await parts.json())
      }

      sink.complete()
    })()
  })

export function createEnvironment(): IEnvironment {
  const network = Network.create(fetchFn)
  const store = new Store(new RecordSource())
  return new Environment({ store, network })
}

function isAsyncIterable(input: unknown): input is AsyncIterable<unknown> {
  return (
    typeof input === 'object' &&
    input !== null &&
    // Some browsers still don't have Symbol.asyncIterator implemented (iOS Safari)
    // That means every custom AsyncIterable must be built using a AsyncGeneratorFunction
    // (async function * () {})
    ((input as any)[Symbol.toStringTag] === 'AsyncGenerator' ||
      Symbol.asyncIterator in input)
  )
}
