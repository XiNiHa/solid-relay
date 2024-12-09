import {
	type Disposable,
	type GraphQLTaggedNode,
	type MutationConfig,
	type MutationParameters,
	commitMutation,
} from "relay-runtime";
import { type Accessor, createSignal } from "solid-js";

import { useRelayEnvironment } from "../RelayEnvironment";

export function createMutation<TMutation extends MutationParameters>(
	mutation: GraphQLTaggedNode,
): [
	(config: Omit<MutationConfig<TMutation>, "mutation">) => Disposable,
	Accessor<boolean>,
] {
	const environment = useRelayEnvironment();
	const inFlightMutations = new Set<Disposable>();
	const [isMutationInFlight, setIsMutationInFlight] = createSignal(false);

	const cleanup = (disposable: Disposable) => {
		inFlightMutations.delete(disposable);
		setIsMutationInFlight(inFlightMutations.size > 0);
	};

	const commit = (config: Omit<MutationConfig<TMutation>, "mutation">) => {
		setIsMutationInFlight(true);
		const disposable = commitMutation(environment, {
			...config,
			mutation,
			onCompleted: (response, errors) => {
				cleanup(disposable);
				config.onCompleted?.(response, errors);
			},
			onError: (error) => {
				cleanup(disposable);
				config.onError?.(error);
			},
			onUnsubscribe: () => {
				cleanup(disposable);
				config.onUnsubscribe?.();
			},
		});
		inFlightMutations.add(disposable);
		return disposable;
	};

	return [commit, isMutationInFlight];
}
