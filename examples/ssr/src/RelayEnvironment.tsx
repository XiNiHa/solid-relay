import { meros } from 'meros/browser'
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

const fetchFn: FetchFunction = (params, variables) =>
  Observable.create((sink) => {
    void (async () => {
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

      if (Symbol.asyncIterator in parts) {
        for await (const part of parts) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
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
        sink.next((await parts.json()) as GraphQLResponse)
      }

      sink.complete()
    })()
  })

export function createEnvironment(): IEnvironment {
  const network = Network.create(fetchFn)
  const store = new Store(new RecordSource())
  return new Environment({ store, network })
}
