import type { IEnvironment } from "relay-runtime";
import {
	type Accessor,
	createComponent,
	createContext,
	createMemo,
	type Element,
	useContext,
} from "solid-js";
import invariant from "tiny-invariant";

interface Props {
	children?: Element;
	environment: IEnvironment;
}

const RelayContext = createContext<{
	environment: Accessor<IEnvironment>;
}>();

/**
 * Provides a Relay environment to Solid Relay primitives in the subtree.
 *
 * Wrap your application (or route subtree) with this provider before calling
 * primitives such as `createLazyLoadQuery`, `createFragment`, or `createMutation`.
 */
export function RelayEnvironmentProvider(props: Props): Element {
	const environment = createMemo(() => props.environment);

	return createComponent(RelayContext, {
		get value() {
			return {
				environment,
			};
		},
		get children() {
			return props.children;
		},
	});
}

/**
 * Returns the current Relay environment accessor from context.
 *
 * Throws if called outside `RelayEnvironmentProvider`.
 */
export function useRelayEnvironment(): () => IEnvironment {
	try {
		return useContext(RelayContext).environment;
	} catch {
		// Solid 2.0 throws ContextNotFoundError (or NoOwnerError) outside a provider.
		invariant(
			false,
			"useRelayEnvironment: Expected to have found a Relay environment provided by " +
				"a `RelayEnvironmentProvider` component. " +
				"This usually means that useRelayEnvironment was used in a " +
				"component that is not a descendant of a `RelayEnvironmentProvider`. " +
				"Please make sure a `RelayEnvironmentProvider` has been rendered somewhere " +
				"as a parent or ancestor of your component.",
		);
	}
}
