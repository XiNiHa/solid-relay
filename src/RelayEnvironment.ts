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

export function RelayEnvironmentProvider(props: Props): JSXElement {
	const environment = createMemo(() => props.environment);

	return createComponent(RelayContext.Provider, {
		get value() {
			return { environment, dataStores: new WeakMap() };
		},
		get children() {
			return props.children;
		},
	});
}

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

export function useDataStores():
	| WeakMap<Resource<unknown>, unknown>
	| undefined {
	const context = useContext(RelayContext);
	return context?.dataStores;
}
