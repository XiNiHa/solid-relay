import { meros } from "meros/browser";
import {
	Environment,
	Network,
	Observable,
	RecordSource,
	Store,
} from "relay-runtime";
import type {
	FetchFunction,
	GraphQLResponse,
	IEnvironment,
} from "relay-runtime";

const fetchFn: FetchFunction = (params, variables) =>
	Observable.create((sink) => {
		void (async () => {
			console.warn("Arbitrary 1sec delay on query is present!");
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const response = await fetch("http://localhost:4000/graphql", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json, multipart/mixed",
				},
				body: JSON.stringify({ query: params.text, variables }),
			});

			const parts = await meros(response);

			if (Symbol.asyncIterator in parts) {
				for await (const part of parts) {
					if (!part.json) {
						sink.error(new Error("Failed to parse part as json."));
						break;
					}
					sink.next(part.body as GraphQLResponse);
					if (!(part.body as { hasNext: boolean }).hasNext) {
						break;
					}
				}
			} else {
				sink.next((await parts.json()) as GraphQLResponse);
			}

			sink.complete();
		})();
	});

export function createEnvironment(): IEnvironment {
	const network = Network.create(fetchFn);
	const store = new Store(new RecordSource());
	return new Environment({ store, network });
}