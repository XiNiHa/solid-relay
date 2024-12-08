import {
	type DisposeFn,
	type GraphQLTaggedNode,
	type IEnvironment,
	type OperationType,
	type PreloadableConcreteRequest,
	type VariablesOf,
	getRequest,
} from "relay-runtime";
import {
	type Accessor,
	createEffect,
	createSignal,
	onCleanup,
	untrack,
} from "solid-js";
import { useRelayEnvironment } from "../RelayEnvironment.js";
import {
	type LoadQueryOptions,
	type PreloadedQuery,
	loadQuery,
} from "../loadQuery.js";
import { useIsMounted } from "../utils/useIsMounted.js";

export type NullQueryReference = { kind: "NullQueryReference" };
const initialNullQueryReferenceState: NullQueryReference = {
	kind: "NullQueryReference",
};

export type CreateQueryLoaderLoadQueryOptions = LoadQueryOptions & {
	__environment?: IEnvironment | null | undefined;
};

export type CreateQueryLoaderReturn<TQuery extends OperationType> = [
	Accessor<PreloadedQuery<TQuery> | null | undefined>,
	(
		variables: VariablesOf<TQuery>,
		options?: CreateQueryLoaderLoadQueryOptions,
	) => void,
	DisposeFn,
];

export function createQueryLoader<TQuery extends OperationType>(
	preloadableRequest: GraphQLTaggedNode | PreloadableConcreteRequest<TQuery>,
	initialQueryReference?: PreloadedQuery<TQuery> | null,
): CreateQueryLoaderReturn<TQuery> {
	const environment = useRelayEnvironment();
	const isMounted = useIsMounted();

	const initialQueryReferenceInternal =
		initialQueryReference ?? initialNullQueryReferenceState;

	const [queryReference, setQueryReference] = createSignal<
		PreloadedQuery<TQuery> | NullQueryReference
	>(initialQueryReferenceInternal);

	createEffect(() => {
		const ref = queryReference();
		onCleanup(() => {
			if (requestIsLiveQuery(preloadableRequest)) {
				if ("dispose" in ref) ref.dispose();
			} else {
				if ("releaseQuery" in ref) ref.releaseQuery();
			}
		});
	});

	const queryLoaderCallback = (
		variables: VariablesOf<TQuery>,
		options?: CreateQueryLoaderLoadQueryOptions,
	) => {
		const mergedOptions =
			options != null &&
			Object.prototype.hasOwnProperty.call(options, "__environment")
				? {
						fetchPolicy: options.fetchPolicy,
						networkCacheConfig: options.networkCacheConfig,
					}
				: options;
		if (untrack(isMounted)) {
			setQueryReference(
				loadQuery(
					options?.__environment ?? environment,
					preloadableRequest,
					variables,
					mergedOptions,
				),
			);
		}
	};

	const disposeQuery = () => {
		if (untrack(isMounted)) setQueryReference(initialNullQueryReferenceState);
	};

	return [
		() => {
			const ref = queryReference();
			return ref.kind === "NullQueryReference" ? null : ref;
		},
		queryLoaderCallback,
		disposeQuery,
	];
}

function requestIsLiveQuery<TQuery extends OperationType>(
	preloadableRequest: GraphQLTaggedNode | PreloadableConcreteRequest<TQuery>,
): boolean {
	if (
		"kind" in preloadableRequest &&
		preloadableRequest.kind === "PreloadableConcreteRequest"
	) {
		return (
			(preloadableRequest as PreloadableConcreteRequest<TQuery>).params.metadata
				.live !== undefined
		);
	}
	const request = getRequest(preloadableRequest as GraphQLTaggedNode);
	return request.params.metadata.live !== undefined;
}
