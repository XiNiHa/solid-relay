import {
	ConnectionInterface,
	type Direction,
	getValueAtPath,
	type ReaderFragment,
} from "relay-runtime";
import invariant from "tiny-invariant";

export function getConnectionState(
	direction: Direction,
	fragmentNode: ReaderFragment,
	fragmentData: unknown,
	connectionPathInFragmentData: readonly (string | number)[],
): {
	cursor: string | null | undefined;
	hasMore: boolean;
} {
	const {
		EDGES,
		PAGE_INFO,
		HAS_NEXT_PAGE,
		HAS_PREV_PAGE,
		END_CURSOR,
		START_CURSOR,
	} = ConnectionInterface.get();
	const connection = getValueAtPath(fragmentData, connectionPathInFragmentData);
	if (connection == null) {
		return { cursor: null, hasMore: false };
	}

	invariant(
		typeof connection === "object",
		`Relay: Expected connection in fragment \`${fragmentNode.name}\` to have been \`null\`, or ` +
			`a plain object with ${EDGES} and ${PAGE_INFO} properties. Instead got \`${connection}\`.`,
	);

	const edges = connection[EDGES];
	const pageInfo = connection[PAGE_INFO];
	if (edges == null || pageInfo == null) {
		return { cursor: null, hasMore: false };
	}

	invariant(
		Array.isArray(edges),
		`Relay: Expected connection in fragment \`${fragmentNode.name}\` to have a plural \`${EDGES}\` field. ` +
			`Instead got \`${edges}\`.`,
	);
	invariant(
		typeof pageInfo === "object",
		`Relay: Expected connection in fragment \`${fragmentNode.name}\` to have a \`${PAGE_INFO}\` field. ` +
			`Instead got \`${pageInfo}\`.`,
	);

	const cursor =
		direction === "forward"
			? (pageInfo[END_CURSOR] ?? null)
			: (pageInfo[START_CURSOR] ?? null);
	invariant(
		cursor === null || typeof cursor === "string",
		`Relay: Expected page info for connection in fragment \`${fragmentNode.name}\` to have a ` +
			`valid \`${START_CURSOR}\`. Instead got \`${cursor}\`.`,
	);

	const hasMore =
		direction === "forward"
			? cursor != null && pageInfo[HAS_NEXT_PAGE] === true
			: cursor != null && pageInfo[HAS_PREV_PAGE] === true;

	return { cursor, hasMore };
}
