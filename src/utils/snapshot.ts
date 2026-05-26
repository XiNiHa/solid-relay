import { FRAGMENT_OWNER_KEY, RequestDescriptor } from "relay-runtime";

const OWNER_PROTO = {};
/// Attach a custom prototype to the fragment owner, to prevent fine-grained merging in Solid stores
export function cleanSnapshot(input: unknown): unknown {
	if (typeof input !== "object" || input === null) return input;
	if (Array.isArray(input)) return input.map(cleanSnapshot);
	return Object.fromEntries(
		Object.entries(input).map(([key, value]) => {
			if (key === FRAGMENT_OWNER_KEY) {
				const wrapped = { ...(value as RequestDescriptor) };
				Object.setPrototypeOf(wrapped, OWNER_PROTO);
				return [key, wrapped];
			}
			return [key, cleanSnapshot(value)];
		}),
	);
}
