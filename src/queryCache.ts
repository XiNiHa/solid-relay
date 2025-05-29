import type { Disposable, IEnvironment } from "relay-runtime";
import type { Resource } from "solid-js";

export type QueryCacheEntry = {
	resource: Resource<unknown>;
	retain: (environment: IEnvironment) => Disposable;
} | null;

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
