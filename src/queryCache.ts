import type { Disposable, IEnvironment } from "relay-runtime";

export type QueryCacheEntry =
	| {
			resource: () => void;
			retain: (environment: IEnvironment) => Disposable;
	  }
	| false;

const caches = new WeakMap<IEnvironment, Map<string, QueryCacheEntry>>();

export function getQueryCache(
	environment: IEnvironment,
): Map<string, QueryCacheEntry> {
	let cache = caches.get(environment);
	if (!cache) {
		cache = new Map();
		caches.set(environment, cache);
	}
	return cache;
}
