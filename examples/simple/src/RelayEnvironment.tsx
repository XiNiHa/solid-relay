import {
  Store,
  RecordSource,
  Environment,
  Network,
  Observable,
} from 'relay-runtime'
import type { FetchFunction, IEnvironment } from 'relay-runtime'

const fetchFn: FetchFunction = (params, variables) => {
  const response = fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Github-Next-Global-ID': '1',
      Authorization: `Bearer ${import.meta.env.VITE_GITHUB_TOKEN}`,
    },
    body: JSON.stringify({ query: params.text, variables }),
  })

  return Observable.from(response.then((data) => data.json()))
}

function createEnvironment(): IEnvironment {
  const network = Network.create(fetchFn)
  const store = new Store(new RecordSource())
  return new Environment({ store, network })
}

export const environment = createEnvironment()
