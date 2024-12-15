import { type MaybeAccessor, access } from "@solid-primitives/utils";
import {
	type GraphQLSubscriptionConfig,
	type OperationType,
	requestSubscription,
} from "relay-runtime";
import { onCleanup, onMount } from "solid-js";
import { useRelayEnvironment } from "../RelayEnvironment";

export function createSubscription<TSubscriptionPayload extends OperationType>(
	config: MaybeAccessor<GraphQLSubscriptionConfig<TSubscriptionPayload>>,
	requestSubscriptionFn?: typeof requestSubscription,
): void {
	const environment = useRelayEnvironment();
	const actualRequestSubscription =
		requestSubscriptionFn ?? requestSubscription;

	onMount(() => {
		const subscription = actualRequestSubscription(
			environment(),
			access(config),
		);
		onCleanup(() => subscription.dispose());
	});
}
