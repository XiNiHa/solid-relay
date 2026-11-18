import {
	type GraphQLSubscriptionConfig,
	type OperationType,
	requestSubscription,
} from "relay-runtime";
import { onSettled } from "solid-js";
import { useRelayEnvironment } from "../RelayEnvironment";
import { access, type MaybeAccessor } from "../utils/access";

/**
 * Starts a Relay subscription when the owner mounts and disposes it on cleanup.
 *
 * Accepts either a static config object or an accessor returning the config.
 *
 * @param config - Subscription configuration or accessor returning it.
 * @param requestSubscriptionFn - Optional request function override (useful for tests).
 */
export function createSubscription<TSubscriptionPayload extends OperationType>(
	config: MaybeAccessor<GraphQLSubscriptionConfig<TSubscriptionPayload>>,
	requestSubscriptionFn?: typeof requestSubscription,
): void {
	const environment = useRelayEnvironment();
	const actualRequestSubscription = requestSubscriptionFn ?? requestSubscription;

	onSettled(() => {
		const subscription = actualRequestSubscription(environment(), access(config));
		return () => subscription.dispose();
	});
}
