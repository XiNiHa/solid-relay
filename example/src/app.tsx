import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { Suspense } from "solid-js";
import { RelayEnvironmentProvider } from "solid-relay";
import { createEnvironment } from "./RelayEnvironment";
import { Routes } from "./routes";

export default function App() {
	const environment = createEnvironment();

	return (
		<RelayEnvironmentProvider environment={environment}>
			<Router
				root={(props) => (
					<MetaProvider>
						<Title>solid-relay SSR example</Title>
						<Suspense>{props.children}</Suspense>
					</MetaProvider>
				)}
			>
				<Routes />
			</Router>
		</RelayEnvironmentProvider>
	);
}
