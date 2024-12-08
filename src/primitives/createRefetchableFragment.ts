import {
	type Disposable,
	type FetchPolicy,
	type GraphQLResponse,
	type GraphQLTaggedNode,
	type IEnvironment,
	type OperationDescriptor,
	type OperationType,
	type PluralReaderSelector,
	ReplaySubject,
	type SingularReaderSelector,
	type Variables,
	type VariablesOf,
	__internal,
	createOperationDescriptor,
	getFragment,
	getFragmentIdentifier,
	getRefetchMetadata,
	getSelector,
	getValueAtPath,
} from "relay-runtime";
import RelayRuntimeExperimental from "relay-runtime/experimental";
import type {
	KeyType,
	KeyTypeData,
} from "relay-runtime/lib/store/ResolverFragments.js";
import {
	type Accessor,
	batch,
	createComputed,
	createEffect,
	createMemo,
	createResource,
	createSignal,
	untrack,
} from "solid-js";
import { unwrap } from "solid-js/store";
import { useRelayEnvironment } from "../RelayEnvironment.js";
import type { DataProxy } from "../utils/dataProxy.js";
import { getQueryRef } from "../utils/getQueryRef.js";
import { useIsMounted } from "../utils/useIsMounted.js";
import { createFragment, createFragmentInternal } from "./createFragment.js";
import { createQueryLoader } from "./createQueryLoader.js";

export type CreateRefetchableFragmentReturn<
	TQuery extends OperationType,
	TKey extends KeyType,
	TFragmentData,
> = [DataProxy<TFragmentData>, RefetchFnDynamic<TQuery, TKey>];

export type RefetchFnDynamic<
	TQuery extends OperationType,
	TKey extends KeyType | null | undefined,
	TOptions = Options,
> = RefetchInexactDynamicResponse<TQuery, TOptions> &
	RefetchExactDynamicResponse<TQuery, TOptions>;

export type RefetchInexact<TQuery extends OperationType, TOptions> = (
	data?: unknown,
) => RefetchFnInexact<TQuery, TOptions>;
export type RefetchInexactDynamicResponse<
	TQuery extends OperationType,
	TOptions,
> = ReturnType<RefetchInexact<TQuery, TOptions>>;

export type RefetchExact<TQuery extends OperationType, TOptions> = (
	data?: unknown | null,
) => RefetchFnExact<TQuery, TOptions>;
export type RefetchExactDynamicResponse<
	TQuery extends OperationType,
	TOptions,
> = ReturnType<RefetchExact<TQuery, TOptions>>;

export type RefetchFnBase<TVars, TOptions> = (
	vars: TVars,
	options?: TOptions,
) => Disposable;

export type RefetchFnExact<
	TQuery extends OperationType,
	TOptions = Options,
> = RefetchFnBase<VariablesOf<TQuery>, TOptions>;
export type RefetchFnInexact<
	TQuery extends OperationType,
	TOptions = Options,
> = RefetchFnBase<Partial<VariablesOf<TQuery>>, TOptions>;

export interface Options {
	fetchPolicy?: FetchPolicy | undefined;
	onComplete?: ((arg: Error | null) => void) | undefined;
}

export function createRefetchableFragment<
	TQuery extends OperationType,
	TKey extends KeyType,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey>,
): CreateRefetchableFragmentReturn<TQuery, TKey, KeyTypeData<TKey>>;
export function createRefetchableFragment<
	TQuery extends OperationType,
	TKey extends KeyType,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
): CreateRefetchableFragmentReturn<
	TQuery,
	TKey,
	KeyTypeData<TKey> | null | undefined
>;
export function createRefetchableFragment<
	TQuery extends OperationType,
	TKey extends KeyType,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
): CreateRefetchableFragmentReturn<
	TQuery,
	TKey,
	KeyTypeData<TKey> | null | undefined
> {
	const parentEnvironment = useRelayEnvironment();
	const parentFragmentRef = () => unwrap(key());
	const isMounted = useIsMounted();
	const fragmentNode = getFragment(fragment);
	// Outdated type definitions on DT, fix PR: https://github.com/DefinitelyTyped/DefinitelyTyped/pull/71342
	const { refetchableRequest, fragmentRefPathInResponse, identifierInfo } =
		getRefetchMetadata(
			fragmentNode,
			"createRefetchableFragment()",
		) as ReturnType<typeof getRefetchMetadata> & {
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
		mirroredEnvironment: parentEnvironment,
		mirroredFragmentIdentifier: fragmentIdentifier(),
		onComplete: undefined,
		refetchEnvironment: null,
		refetchQuery: null,
	});

	const environment = createMemo(
		() => state().refetchEnvironment ?? parentEnvironment,
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
			preloadedQuery.source != null
				? preloadedQuery.source
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
				const data = await RelayRuntimeExperimental.waitForFragmentData(
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

	const fragmentData = createFragmentInternal(fragment, fragmentRef, () => ({
		parentOperation: refetchObservable(),
	}));

	return [
		fragmentData,
		(providedRefetchVariables, options) => {
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
						`\`${fragmentNode.name}\` in \`createRefetchableFragment()\`. It looks like some instances of your component are ` +
						"still trying to fetch data but they already unmounted. " +
						"Please make sure you clear all timers, intervals, " +
						"async calls, etc that may trigger a fetch.",
				);
				return { dispose: () => {} };
			}
			if (fragmentRef === null) {
				console.warn(
					"Relay: Unexpected call to `refetch` while using a null fragment ref " +
						`for fragment \`fragmentNode.name\` in \`createRefetchableFragment()\`. When calling \`refetch\`, we expect ` +
						"initial fragment data to be non-null. Please make sure you're " +
						"passing a valid fragment ref to `createRefetchableFragment()` before calling " +
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
				!Object.prototype.hasOwnProperty.call(
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
	];
}
