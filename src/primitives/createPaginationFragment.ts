import {
	type ConcreteRequest,
	type Direction,
	type Disposable,
	type GraphQLTaggedNode,
	type OperationType,
	type ReaderFragment,
	type ReaderPaginationMetadata,
	type SingularReaderSelector,
	type VariablesOf,
	__internal,
	createOperationDescriptor,
	getFragment,
	getFragmentIdentifier,
	getPaginationMetadata,
	getPaginationVariables,
	getRefetchMetadata,
	getSelector,
} from "relay-runtime";
import {
	type Accessor,
	batch,
	createEffect,
	createMemo,
	createSignal,
	untrack,
} from "solid-js";
import invariant from "tiny-invariant";
import { useRelayEnvironment } from "../RelayEnvironment";
import type { KeyType, KeyTypeData } from "../types/keyType";
import { createFetchTracker } from "../utils/createFetchTracker";
import type { DataStore } from "../utils/dataStore";
import { getConnectionState } from "../utils/getConnectionState";
import { useIsMounted } from "../utils/useIsMounted";
import { useIsOperationNodeActive } from "../utils/useIsOperationNodeActive";
import {
	type RefetchFnDynamic,
	type RefetchOptions,
	createRefetchableFragmentInternal,
} from "./createRefetchableFragment";

type CreatePaginationFragmentReturn<
	TQuery extends OperationType,
	TKey extends KeyType | null | undefined,
	TFragmentData,
> = DataStore<TFragmentData> & {
	loadNext: LoadMoreFn<TQuery>;
	loadPrevious: LoadMoreFn<TQuery>;
	hasNext: boolean;
	hasPrevious: boolean;
	isLoadingNext: boolean;
	isLoadingPrevious: boolean;
	refetch: RefetchFnDynamic<TQuery, TKey>;
};

export type LoadMoreFn<_TQuery extends OperationType> = (
	count: number,
	options?: {
		onComplete?: (error: Error | null) => void;
	},
) => Disposable;

export function createPaginationFragment<
	TQuery extends OperationType,
	TKey extends KeyType,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey>,
): CreatePaginationFragmentReturn<TQuery, TKey, KeyTypeData<TKey>>;
export function createPaginationFragment<
	TQuery extends OperationType,
	TKey extends KeyType,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
): CreatePaginationFragmentReturn<
	TQuery,
	TKey | null,
	KeyTypeData<TKey> | null | undefined
>;
export function createPaginationFragment<
	TQuery extends OperationType,
	TKey extends KeyType,
>(
	fragment: GraphQLTaggedNode,
	key: Accessor<TKey | null | undefined>,
): CreatePaginationFragmentReturn<
	TQuery,
	TKey | null,
	KeyTypeData<TKey> | null | undefined
> {
	const fragmentNode = getFragment(fragment);
	const componentDisplayName = "createPaginationFragment()";
	const {
		connectionPathInFragmentData,
		paginationRequest,
		paginationMetadata,
	} = getPaginationMetadata(fragmentNode, componentDisplayName);
	const { fragmentData, fragmentRef, refetch } =
		createRefetchableFragmentInternal(fragment, key, componentDisplayName);
	const fragmentIdentifier = createMemo(() =>
		getFragmentIdentifier(fragmentNode, fragmentRef()),
	);
	const [loadPrevious, hasPrevious, isLoadingPrevious, disposeFetchPrevious] =
		createLoadMore<TQuery, TKey>({
			direction: "backward",
			fragmentNode,
			fragmentRef,
			fragmentIdentifier,
			fragmentData,
			connectionPathInFragmentData,
			paginationRequest,
			paginationMetadata,
			componentDisplayName,
		});
	const [loadNext, hasNext, isLoadingNext, disposeFetchNext] = createLoadMore<
		TQuery,
		TKey
	>({
		direction: "forward",
		fragmentNode,
		fragmentRef,
		fragmentIdentifier,
		fragmentData,
		connectionPathInFragmentData,
		paginationRequest,
		paginationMetadata,
		componentDisplayName,
	});

	const refetchPagination = (
		variables: VariablesOf<TQuery>,
		options?: RefetchOptions,
	) => {
		disposeFetchNext();
		disposeFetchPrevious();
		return refetch(variables, options);
	};

	Object.defineProperties(fragmentData, {
		loadNext: { value: loadNext },
		loadPrevious: { value: loadPrevious },
		hasNext: { get: hasNext },
		hasPrevious: { get: hasPrevious },
		isLoadingNext: { get: isLoadingNext },
		isLoadingPrevious: { get: isLoadingPrevious },
		refetch: { value: refetchPagination },
	});

	return fragmentData as unknown as CreatePaginationFragmentReturn<
		TQuery,
		TKey | null,
		KeyTypeData<TKey> | null | undefined
	>;
}

function createLoadMore<TQuery extends OperationType, TKey extends KeyType>({
	direction,
	fragmentNode,
	fragmentRef,
	fragmentIdentifier,
	fragmentData,
	connectionPathInFragmentData,
	paginationRequest,
	paginationMetadata,
	componentDisplayName,
}: {
	direction: Direction;
	fragmentNode: ReaderFragment;
	fragmentRef: Accessor<TKey | null | undefined>;
	fragmentIdentifier: Accessor<string>;
	fragmentData: DataStore<KeyTypeData<TKey>>;
	connectionPathInFragmentData: readonly (string | number)[];
	paginationRequest: ConcreteRequest;
	paginationMetadata: ReaderPaginationMetadata;
	componentDisplayName: string;
}): [LoadMoreFn<TQuery>, Accessor<boolean>, Accessor<boolean>, () => void] {
	const environment = useRelayEnvironment();
	const [isLoadingMore, reallySetIsLoadingMore] = createSignal(false);
	const setIsLoadingMore = (value: boolean) => {
		const schedule = untrack(environment).getScheduler()?.schedule;
		if (schedule) {
			schedule(() => {
				reallySetIsLoadingMore(value);
			});
		} else {
			reallySetIsLoadingMore(value);
		}
	};
	const { isFetching, startFetch, disposeFetch, completeFetch } =
		createFetchTracker();
	// Outdated type definitions on DT, fix PR: https://github.com/DefinitelyTyped/DefinitelyTyped/pull/71342
	const { identifierInfo } = getRefetchMetadata(
		fragmentNode,
		componentDisplayName,
	) as ReturnType<typeof getRefetchMetadata> & {
		readonly identifierInfo:
			| {
					readonly identifierField: string;
					readonly identifierQueryVariableName: string;
			  }
			| null
			| undefined;
	};
	const identifierValue = createMemo(() =>
		identifierInfo?.identifierField != null && fragmentData.latest != null
			? (fragmentData.latest as Record<string, unknown>)[
					identifierInfo.identifierField
				]
			: null,
	);

	const isMounted = useIsMounted();
	const [mirroredEnvironment, setMirroredEnvironment] = createSignal(
		environment(),
	);
	const [mirroredFragmentIdentifier, setMirroredFragmentIdentifier] =
		createSignal(fragmentIdentifier());

	const isParentQueryActive = useIsOperationNodeActive(
		fragmentNode,
		fragmentRef,
	);

	const shouldReset = createMemo(
		() =>
			environment() !== mirroredEnvironment() ||
			fragmentIdentifier() !== mirroredFragmentIdentifier(),
	);
	createEffect(() => {
		if (shouldReset()) {
			batch(() => {
				disposeFetch();
				setIsLoadingMore(false);
				setMirroredEnvironment(untrack(environment));
				setMirroredFragmentIdentifier(untrack(fragmentIdentifier));
			});
		}
	});

	const connectionState = createMemo(() =>
		getConnectionState(
			direction,
			fragmentNode,
			fragmentData.latest,
			connectionPathInFragmentData,
		),
	);
	const isRequestInvalid = createMemo(
		() => fragmentData.latest == null || isParentQueryActive(),
	);

	return [
		(count, options) => {
			if (!untrack(isMounted)) {
				console.warn(
					"Relay: Unexpected fetch on unmounted component for fragment " +
						`\`${fragmentNode.name}\` in \`${componentDisplayName}\`. It looks like some instances of your component are ` +
						"still trying to fetch data but they already unmounted. " +
						"Please make sure you clear all timers, intervals, " +
						"async calls, etc that may trigger a fetch.",
				);
				return { dispose: () => {} };
			}

			const fragmentSelector = getSelector(fragmentNode, untrack(fragmentRef));

			if (untrack(isFetching) || untrack(isRequestInvalid)) {
				if (fragmentSelector == null) {
					console.warn(
						"Relay: Unexpected fetch while using a null fragment ref " +
							`for fragment \`${fragmentNode.name}\` in \`${componentDisplayName}\`. When fetching more items, we expect ` +
							"initial fragment data to be non-null. Please make sure you're " +
							`passing a valid fragment ref to \`${componentDisplayName}\` before paginating.`,
					);
				}

				options?.onComplete?.(null);
				return { dispose: () => {} };
			}

			invariant(
				fragmentSelector != null &&
					fragmentSelector.kind !== "PluralReaderSelector",
				"Relay: Expected to be able to find a non-plural fragment owner for " +
					`fragment \`${fragmentNode.name}\` when using \`${componentDisplayName}\`. If you're seeing this, ` +
					"this is likely a bug in Relay.",
			);

			const selector = fragmentSelector as SingularReaderSelector;
			const parentVariables = selector.owner.variables;
			const fragmentVariables = selector.variables;
			const baseVariables = {
				...parentVariables,
				...fragmentVariables,
			};
			const paginationVariables = getPaginationVariables(
				direction,
				count,
				untrack(connectionState).cursor,
				baseVariables,
				{},
				paginationMetadata,
			);

			if (identifierInfo != null) {
				const value = untrack(identifierValue);
				if (typeof value !== "string") {
					console.warn(
						"Relay: Expected result to have a string  " +
							`\`${identifierInfo.identifierField}\` in order to refetch, got \`${value}\`.`,
					);
				}
				paginationVariables[identifierInfo.identifierQueryVariableName] = value;
			}

			const paginationQuery = createOperationDescriptor(
				paginationRequest,
				paginationVariables,
				{ force: true },
			);
			__internal.fetchQuery(untrack(environment), paginationQuery).subscribe({
				start(subscription) {
					startFetch(subscription);
					setIsLoadingMore(true);
				},
				complete() {
					completeFetch();
					setIsLoadingMore(false);
					options?.onComplete?.(null);
				},
				error(error: Error) {
					completeFetch();
					setIsLoadingMore(false);
					options?.onComplete?.(error);
				},
				unsubscribe() {
					setIsLoadingMore(false);
				},
			});
			return { dispose: disposeFetch };
		},
		() => connectionState().hasMore,
		isLoadingMore,
		disposeFetch,
	];
}
