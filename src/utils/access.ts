export type MaybeAccessor<T> = T | (() => T);
// oxlint-disable-next-line typescript/no-explicit-any
export type MaybeAccessorValue<T extends MaybeAccessor<any>> =
	// oxlint-disable-next-line typescript/no-explicit-any
	T extends () => any ? ReturnType<T> : T;

// oxlint-disable-next-line typescript/no-explicit-any
export const access = <T extends MaybeAccessor<any>>(v: T): MaybeAccessorValue<T> =>
	typeof v === "function" && !v.length ? v() : (v as MaybeAccessorValue<T>);
