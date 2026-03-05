import type { IEnvironment } from "relay-runtime";
import {
	type Accessor,
	createComponent,
	createContext,
	createMemo,
	type JSXElement,
	type Resource,
	useContext,
} from "solid-js";
import invariant from "tiny-invariant";

interface Props {
	children?: JSXElement;
	environment: IEnvironment;
}

const RelayContext = createContext<{
	environment: Accessor<IEnvironment>;
	dataStores: WeakMap<Resource<unknown>, unknown>;
}>();

/**
 * Provides a Relay environment to Solid Relay primitives in the subtree.
 *
 * Wrap your application (or route subtree) with this provider before calling
 * primitives such as `createLazyLoadQuery`, `createFragment`, or `createMutation`.
 */
export function RelayEnvironmentProvider(props: Props): JSXElement {
	const environment = createMemo(() => props.environment);

	return createComponent(RelayContext.Provider, {
		get value() {
			return {
				environment,
				dataStores: new WeakMap<Resource<unknown>, unknown>(),
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
	const context = useContext(RelayContext);

	invariant(
		context != null,
		"useRelayEnvironment: Expected to have found a Relay environment provided by " +
			"a `RelayEnvironmentProvider` component. " +
			"This usually means that useRelayEnvironment was used in a " +
			"component that is not a descendant of a `RelayEnvironmentProvider`. " +
			"Please make sure a `RelayEnvironmentProvider` has been rendered somewhere " +
			"as a parent or ancestor of your component.",
	);

	return context.environment;
}

export function useDataStores(): WeakMap<Resource<unknown>, unknown> | undefined {
	const context = useContext(RelayContext);
	return context?.dataStores;
}
