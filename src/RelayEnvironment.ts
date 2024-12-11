import type { IEnvironment } from "relay-runtime";
import {
	type JSXElement,
	createComponent,
	createContext,
	useContext,
} from "solid-js";
import invariant from "tiny-invariant";

interface Props {
	children?: JSXElement;
	environment: IEnvironment;
}

const RelayContext = createContext<{
	environment: IEnvironment;
}>();

export function RelayEnvironmentProvider(props: Props) {
	return createComponent(RelayContext.Provider, {
		get value() {
			return { environment: props.environment };
		},
		get children() {
			return props.children;
		},
	});
}

export const useRelayEnvironment = () => {
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
};