import { type Resource, untrack } from "solid-js";
import { type SetStoreFunction, createStore } from "solid-js/store";
import { useDataStores } from "../RelayEnvironment";
import type { MaybeAccessor } from "./access";

export type DataStore<T> =
	| {
			(): T;
			readonly latest: T;
			readonly error: undefined;
			readonly pending: false;
	  }
	| {
			(): undefined;
			readonly latest: undefined;
			readonly error: unknown;
			readonly pending: false;
	  }
	| {
			(): undefined;
			readonly latest: undefined;
			readonly error: undefined;
			readonly pending: true;
	  };

export const createDataStore = <
	T extends {
		readonly data: unknown;
		readonly error: unknown;
		readonly pending: boolean;
	},
>(
	init: T,
	maybeResource: MaybeAccessor<Resource<unknown> | undefined>,
): [DataStore<T>, SetStoreFunction<T>] => {
	const [store, setStore] = createStableStore(
		init,
		untrack(() => extractResource(maybeResource)),
	);

	const readData = () => {
		const resource = extractResource(maybeResource);
		void resource?.();
		const error = Reflect.get(store, "error");
		if (error) throw error;
		return Reflect.get(store, "data");
	};

	Object.defineProperties(readData, {
		latest: {
			get: () => Reflect.get(store, "data"),
		},
		error: {
			get: () => Reflect.get(store, "error"),
		},
		pending: {
			get: () => Reflect.get(store, "pending"),
		},
	});

	return [readData as unknown as DataStore<T>, setStore];
};

function createStableStore<
	T extends {
		readonly data: unknown;
		readonly error: unknown;
		readonly pending: boolean;
	},
>(init: T, resource: Resource<unknown> | undefined) {
	const stores = useDataStores();
	if (resource) {
		const existing = stores?.get(resource);
		if (existing) return existing as [T, SetStoreFunction<T>];
	}
	const store = createStore(init);
	if (resource) stores?.set(resource, store);
	return store;
}

function extractResource<T>(
	maybeResource: MaybeAccessor<Resource<T> | undefined>,
) {
	return maybeResource
		? "loading" in maybeResource
			? maybeResource
			: maybeResource()
		: undefined;
}
