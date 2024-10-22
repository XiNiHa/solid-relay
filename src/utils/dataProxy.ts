export type DataProxy<T> =
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

export const makeDataProxy = <
	T extends {
		readonly data: unknown;
		readonly error: unknown;
		readonly pending: boolean;
	},
>(
	store: T,
	resource: () => void,
	data?: () => T["data"],
): DataProxy<T> => {
	const readData = () => {
		void resource();
		return data ? data() : Reflect.get(store, "data");
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
