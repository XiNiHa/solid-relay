import {
	__internal,
	createOperationDescriptor,
	type Disposable,
	type FetchPolicy,
	type GraphQLResponse,
	type GraphQLTaggedNode,
	getFragment,
	getFragmentIdentifier,
	getRefetchMetadata,
	getSelector,
	getValueAtPath,
	type IEnvironment,
	type OperationDescriptor,
	type OperationType,
	type PluralReaderSelector,
	ReplaySubject,
	type SingularReaderSelector,
	type Variables,
	type VariablesOf,
} from "relay-runtime";
import { waitForFragmentData } from "relay-runtime/experimental.js";
import {
	type Accessor,
	batch,
	createComputed,
	createEffect,
	createMemo,
	createSignal,
	untrack,
} from "solid-js";
import { unwrap } from "solid-js/store";
import { isServer } from "solid-js/web";
import { useRelayEnvironment } from "../RelayEnvironment";
import type { KeyType, KeyTypeData } from "../types/keyType";
import type { DataStore } from "../utils/dataStore";
import { getQueryRef } from "../utils/getQueryRef";
import { useIsMounted } from "../utils/useIsMounted";
import { createFragmentInternal } from "./createFragment";
import { createQueryLoader } from "./createQueryLoader";

export type RefetchFnDynamic<
	TQuery extends OperationType,
	_TKey extends KeyType | null | undefined,
	TOptions = RefetchOptions,
> = RefetchInexactDynamicResponse<TQuery, TOptions> &
	RefetchExactDynamicResponse<TQuery, TOptions>;

type RefetchInexact<TQuery extends OperationType, TOptions> = (
	data?: unknown,
) => RefetchFnInexact<TQuery, TOptions>;
type RefetchInexactDynamicResponse<
	TQuery extends OperationType,
	TOptions,
> = ReturnType<RefetchInexact<TQuery, TOptions>>;

type RefetchExact<TQuery extends OperationType, TOptions> = (
	data?: unknown | null,
) => RefetchFnExact<TQuery, TOptions>;
type RefetchExactDynamicResponse<
	TQuery extends OperationType,
	TOptions,
> = ReturnType<RefetchExact<TQuery, TOptions>>;

type RefetchFnBase<TVars, TOptions> = (
	vars: TVars,
	options?: TOptions,
) => Disposable;

type RefetchFnExact<
	TQuery extends OperationType,
	TOptions = RefetchOptions,
> = RefetchFnBase<VariablesOf<TQuery>, TOptions>;
type RefetchFnInexact<
	TQuery extends OperationType,
	TOptions = RefetchOptions,
> = RefetchFnBase<Partial<VariablesOf<TQuery>>, TOptions>;

export interface RefetchOptions {
	fetchPolicy?: FetchPolicy | undefined;
	onComplete?: ((arg: Error | null) => void) | undefined;
}

export function createRefetchableFragment<
	TQuery extends OperationType,
	TKey extends KeyType,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey>,
	options?: {
		deferStream?: boolean;
	},
): [DataStore<KeyTypeData<TKey>>, RefetchFnDynamic<TQuery, TKey>];
export function createRefetchableFragment<
	TQuery extends OperationType,
	TKey extends KeyType,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
	options?: {
		deferStream?: boolean;
	},
): [
	DataStore<KeyTypeData<TKey> | null | undefined>,
	RefetchFnDynamic<TQuery, TKey>,
];
export function createRefetchableFragment<
	TQuery extends OperationType,
	TKey extends KeyType,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
	options?: {
		deferStream?: boolean;
	},
): [
	DataStore<KeyTypeData<TKey> | null | undefined>,
	RefetchFnDynamic<TQuery, TKey>,
] {
	const { fragmentData, refetch } = createRefetchableFragmentInternal(
		fragment,
		key,
		"createRefetchableFragment()",
		options,
	);
	return [fragmentData, refetch];
}

export function createRefetchableFragmentInternal<
	TQuery extends OperationType,
	TKey extends KeyType,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
	componentDisplayName = "createRefetchableFragment()",
	options?: {
		deferStream?: boolean;
	},
): {
	fragmentData: DataStore<KeyTypeData<TKey> | null | undefined>;
	fragmentRef: Accessor<TKey | null | undefined>;
	refetch: RefetchFnDynamic<TQuery, TKey>;
} {
	const parentEnvironment = useRelayEnvironment();
	const parentFragmentRef = () => unwrap(key());
	const isMounted = useIsMounted();
	const fragmentNode = getFragment(fragment);
	// Outdated type definitions on DT, fix PR: https://github.com/DefinitelyTyped/DefinitelyTyped/pull/71342
	const { refetchableRequest, fragmentRefPathInResponse, identifierInfo } =
		getRefetchMetadata(fragmentNode, componentDisplayName) as ReturnType<
			typeof getRefetchMetadata
		> & {
			readonly identifierInfo:
				| {
						readonly identifierField: string;
						readonly identifierQueryVariableName: string;
				  }
				| null
				| undefined;
		};
	const fragmentIdentifier = createMemo(() =>
		getFragmentIdentifier(fragmentNode, parentFragmentRef()),
	);

	const [state, setState] = createSignal<{
		fetchPolicy: FetchPolicy | undefined;
		mirroredEnvironment: IEnvironment;
		mirroredFragmentIdentifier: string;
		onComplete: ((arg: Error | null) => void) | undefined;
		refetchEnvironment: IEnvironment | null | undefined;
		refetchQuery: OperationDescriptor | null;
	}>({
		fetchPolicy: undefined,
		mirroredEnvironment: parentEnvironment(),
		mirroredFragmentIdentifier: fragmentIdentifier(),
		onComplete: undefined,
		refetchEnvironment: null,
		refetchQuery: null,
	});

	const environment = createMemo(
		() => state().refetchEnvironment ?? parentEnvironment(),
	);

	const [preloadedQueryRef, loadQuery, disposeQuery] =
		createQueryLoader<TQuery>(refetchableRequest);
	const [fragmentRef, setFragmentRef] = createSignal(parentFragmentRef());
	createComputed(() => {
		if (untrack(fragmentRef) !== parentFragmentRef()) {
			setFragmentRef(() => parentFragmentRef());
		}
	});

	const refetchObservable = createMemo(() => {
		const refetchQuery = state().refetchQuery;
		const preloadedQuery = preloadedQueryRef();
		if (!refetchQuery || !preloadedQuery) return;

		const fetchObservable =
			preloadedQuery.controls?.value.source != null
				? preloadedQuery.controls.value.source
				: __internal.fetchQuery(environment(), refetchQuery);

		const replaySubject = new ReplaySubject<GraphQLResponse>();
		fetchObservable.subscribe({
			...replaySubject,
			complete() {
				replaySubject.complete();
				state().onComplete?.(null);
			},
			error(err: Error) {
				replaySubject.error(err);
				state().onComplete?.(err);
			},
		});
		return replaySubject;
	});
	createComputed(() => {
		const refetchQuery = state().refetchQuery;
		if (!refetchQuery) return;
		const obs = refetchObservable();
		if (!obs) return;
		obs.subscribe({
			async complete() {
				const data = await waitForFragmentData(
					environment(),
					refetchableRequest.fragment,
					getQueryRef(refetchQuery),
				);
				if (!data) return;
				const refetchedFragmentRef = getValueAtPath(
					unwrap(data),
					fragmentRefPathInResponse,
				);
				if (!refetchedFragmentRef) return;
				setFragmentRef(unwrap(refetchedFragmentRef));
			},
		});
	});

	const refetch = (action: {
		refetchQuery: OperationDescriptor;
		fetchPolicy?: FetchPolicy;
		onComplete?: (arg: Error | null) => void;
		refetchEnvironment?: IEnvironment | null | undefined;
	}) =>
		setState((state) => ({
			...state,
			fetchPolicy: action.fetchPolicy,
			mirroredEnvironment:
				state.refetchEnvironment ?? state.mirroredEnvironment,
			onComplete: action.onComplete,
			refetchEnvironment: action.refetchEnvironment,
			refetchQuery: action.refetchQuery,
		}));

	const reset = (action: {
		environment: IEnvironment;
		fragmentIdentifier: string;
	}) =>
		setState({
			fetchPolicy: undefined,
			mirroredEnvironment: action.environment,
			mirroredFragmentIdentifier: action.fragmentIdentifier,
			onComplete: undefined,
			refetchEnvironment: undefined,
			refetchQuery: null,
		});

	createEffect(() => {
		const env = environment();
		const fragmentIdent = fragmentIdentifier();
		const shouldReset =
			env !== state().mirroredEnvironment ||
			fragmentIdent !== state().mirroredFragmentIdentifier;
		if (shouldReset) {
			reset({
				environment: env,
				fragmentIdentifier: fragmentIdent,
			});
			disposeQuery();
		}
	});

	const fragmentData = createFragmentInternal(
		fragment,
		isServer ? parentFragmentRef : fragmentRef,
		() => ({
			parentOperation: refetchObservable(),
		}),
		options,
	);

	return {
		fragmentData,
		fragmentRef,
		refetch: (providedRefetchVariables, options) => {
			const fragmentRef = parentFragmentRef();
			const identifierValue =
				identifierInfo?.identifierField != null &&
				fragmentData.latest != null &&
				typeof fragmentData.latest === "object"
					? (fragmentData.latest as Record<string, unknown>)[
							identifierInfo.identifierField
						]
					: null;

			if (!untrack(isMounted)) {
				console.warn(
					"Relay: Unexpected call to `refetch` on unmounted component for fragment " +
						`\`${fragmentNode.name}\` in \`${componentDisplayName}\`. It looks like some instances of your component are ` +
						"still trying to fetch data but they already unmounted. " +
						"Please make sure you clear all timers, intervals, " +
						"async calls, etc that may trigger a fetch.",
				);
				return { dispose: () => {} };
			}
			if (fragmentRef === null) {
				console.warn(
					"Relay: Unexpected call to `refetch` while using a null fragment ref " +
						`for fragment \`fragmentNode.name\` in \`${componentDisplayName}\`. When calling \`refetch\`, we expect ` +
						"initial fragment data to be non-null. Please make sure you're " +
						`passing a valid fragment ref to \`${componentDisplayName}\` before calling ` +
						"`refetch`, or make sure you pass all required variables to `refetch`.",
				);
			}

			const fetchPolicy = options?.fetchPolicy;
			const onComplete = options?.onComplete;
			const fragmentSelector = getSelector(fragmentNode, fragmentRef);
			let parentVariables: Variables;
			let fragmentVariables: Variables;
			if (fragmentSelector == null) {
				parentVariables = {};
				fragmentVariables = {};
			} else if (fragmentSelector.kind === "PluralReaderSelector") {
				const selector = fragmentSelector as PluralReaderSelector;
				parentVariables = selector.selectors[0]?.owner.variables ?? {};
				fragmentVariables = selector.selectors[0]?.variables ?? {};
			} else {
				const selector = fragmentSelector as SingularReaderSelector;
				parentVariables = selector.owner.variables;
				fragmentVariables = selector.variables;
			}

			const refetchVariables: VariablesOf<TQuery> = {
				...parentVariables,
				...fragmentVariables,
				...providedRefetchVariables,
			};

			if (
				identifierInfo != null &&
				!Object.hasOwn(
					providedRefetchVariables,
					identifierInfo.identifierQueryVariableName,
				)
			) {
				if (typeof identifierValue !== "string") {
					console.warn(
						"Relay: Expected result to have a string  " +
							`\`${identifierInfo.identifierField}\` in order to refetch, got \`${identifierValue}\`. `,
					);
				}
				(refetchVariables as Record<string, unknown>)[
					identifierInfo.identifierQueryVariableName
				] = identifierValue;
			}

			const refetchQuery = createOperationDescriptor(
				refetchableRequest,
				refetchVariables,
				{ force: true },
			);

			batch(() => {
				loadQuery(refetchQuery.request.variables, {
					fetchPolicy,
					__environment: state().refetchEnvironment,
				});

				refetch({
					fetchPolicy,
					onComplete,
					refetchEnvironment: state().refetchEnvironment,
					refetchQuery,
				});
			});

			return { dispose: disposeQuery };
		},
	};
}
