/* @refresh reload */
import { render } from "solid-js/web";
import { RelayEnvironmentProvider } from "solid-relay";

import App from "./App";
import { environment } from "./RelayEnvironment";

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
	throw new Error(
		"Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got mispelled?",
	);
}

if (root) {
	render(
		() => (
			<RelayEnvironmentProvider environment={environment}>
				<App />
			</RelayEnvironmentProvider>
		),
		root,
	);
}
