import { type Accessor } from "solid-js";

/**
 * A reactive data store containing the result of a query or fragment.
 *
 * Call `()` to read the value.
 *
 * @param T - The type of the value stored in the data store.
 */
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
	store: T,
	gate?: Accessor<unknown>,
): DataStore<T> => {
	const readData = () => {
		gate?.();
		const error = store.error;
		if (error) throw error;
		return store.data;
	};

	Object.defineProperties(readData, {
		latest: { get: () => store.data },
		error: { get: () => store.error },
		pending: { get: () => store.pending },
	});

	return readData as unknown as DataStore<T>;
};
