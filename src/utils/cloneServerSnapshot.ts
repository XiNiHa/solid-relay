import { isServer } from "solid-js/web";

// Relay freezes reader snapshots; Solid's browser store unwraps those before reconciling,
// while the server store reconciles in place.
export const cloneServerSnapshot = <T>(value: T): T => (isServer ? structuredClone(value) : value);
