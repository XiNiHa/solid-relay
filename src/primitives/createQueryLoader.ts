import {
	type DisposeFn,
	type GraphQLTaggedNode,
	getRequest,
	type IEnvironment,
	type OperationType,
	type PreloadableConcreteRequest,
	type VariablesOf,
} from "relay-runtime";
import {
	type Accessor,
	createEffect,
	createSignal,
	onCleanup,
	untrack,
} from "solid-js";
import {
	type LoadQueryOptions,
	loadQuery,
	type PreloadedQuery,
} from "../loadQuery";
import { useRelayEnvironment } from "../RelayEnvironment";
import { useIsMounted } from "../utils/useIsMounted";

type NullQueryReference = { kind: "NullQueryReference" };
const initialNullQueryReferenceState: NullQueryReference = {
	kind: "NullQueryReference",
};

export function createQueryLoader<TQuery extends OperationType>(
	preloadableRequest: GraphQLTaggedNode | PreloadableConcreteRequest<TQuery>,
	initialQueryReference?: PreloadedQuery<TQuery> | null,
): [
	Accessor<PreloadedQuery<TQuery> | null | undefined>,
	(
		variables: VariablesOf<TQuery>,
		options?: LoadQueryOptions & {
			__environment?: IEnvironment | null | undefined;
		},
	) => void,
	DisposeFn,
] {
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
			if ("controls" in ref) {
				if (requestIsLiveQuery(preloadableRequest)) {
					ref.controls?.value.dispose();
				} else {
					ref.controls?.value.releaseQuery();
				}
			}
		});
	});

	return [
		() => {
			const ref = queryReference();
			return ref.kind === "NullQueryReference" ? null : ref;
		},
		(variables, options) => {
			const mergedOptions =
				options != null && Object.hasOwn(options, "__environment")
					? {
							fetchPolicy: options.fetchPolicy,
							networkCacheConfig: options.networkCacheConfig,
						}
					: options;
			if (untrack(isMounted)) {
				setQueryReference(
					loadQuery(
						options?.__environment ?? untrack(environment),
						preloadableRequest,
						variables,
						mergedOptions,
					),
				);
			}
		},
		() => {
			if (untrack(isMounted)) setQueryReference(initialNullQueryReferenceState);
		},
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
