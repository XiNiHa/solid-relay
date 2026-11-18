import type { Disposable, GraphQLResponse, IEnvironment } from "relay-runtime";
import type { Accessor } from "solid-js";

export type ResponseChain = { value: GraphQLResponse; next: Promise<ResponseChain> } | null;

export type QueryCacheEntry = {
	response: Accessor<ResponseChain>;
	replay: (value: ResponseChain) => void;
	retain: (environment: IEnvironment) => Disposable;
};

const caches = new WeakMap<IEnvironment, Map<string, QueryCacheEntry>>();

export function getQueryCache(environment: IEnvironment): Map<string, QueryCacheEntry> {
	let cache = caches.get(environment);
	if (!cache) {
		cache = new Map();
		caches.set(environment, cache);
	}
	return cache;
}
