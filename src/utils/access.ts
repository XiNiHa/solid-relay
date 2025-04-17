export type MaybeAccessor<T> = T | (() => T);
// biome-ignore lint/suspicious/noExplicitAny: extends
export type MaybeAccessorValue<T extends MaybeAccessor<any>> =
	// biome-ignore lint/suspicious/noExplicitAny: extends
	T extends () => any ? ReturnType<T> : T;

// biome-ignore lint/suspicious/noExplicitAny: extends
export const access = <T extends MaybeAccessor<any>>(
	v: T,
): MaybeAccessorValue<T> =>
	typeof v === "function" && !v.length ? v() : (v as MaybeAccessorValue<T>);
