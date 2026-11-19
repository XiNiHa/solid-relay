import { type Accessor, isPending, NotReadyError } from "solid-js";

/**
 * A reactive data store containing the result of a query or fragment.
 *
 * Call `()` to read the value.
 *
 * `pending` is `true` during the first load and while a newer result is on its way,
 * such as after a variable change. `latest` keeps the previous value in the meantime.
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
			(): T;
			readonly latest: T;
			readonly error: undefined;
			readonly pending: true;
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
		pending: {
			get: () => {
				// Ask the gate first: isPending sees a pending refresh, and reading the gate
				// throws NotReadyError while its first value is in flight (isPending swallows
				// that outside a tracking scope). A failed request throws its error instead,
				// which data() surfaces; it is no longer pending.
				if (gate) {
					try {
						if (isPending(gate)) return true;
						gate();
					} catch (error) {
						return error instanceof NotReadyError;
					}
				}
				return store.pending;
			},
		},
	});

	return readData as unknown as DataStore<T>;
};
