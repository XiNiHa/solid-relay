export type DataProxy<T> = {
	(): T | undefined;
	readonly latest: T | undefined;
	readonly error: unknown;
	readonly pending: boolean;
};

export const makeDataProxy = <
	T extends {
		readonly data: unknown;
		readonly error: unknown;
		readonly pending: boolean;
	},
>(
	store: T,
	resource: () => void,
): DataProxy<T> => {
	const readData = () => {
		void resource();
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

	return readData as unknown as DataProxy<T>;
};
