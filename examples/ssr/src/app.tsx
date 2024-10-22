import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import { RelayEnvironmentProvider } from "solid-relay";
import { createEnvironment } from "./RelayEnvironment";

export default function App() {
	return (
		<Router
			root={(props) => (
				<RelayEnvironmentProvider environment={createEnvironment()}>
					<MetaProvider>
						<Title>solid-relay SSR example</Title>
						<Suspense>{props.children}</Suspense>
					</MetaProvider>
				</RelayEnvironmentProvider>
			)}
		>
			<FileRoutes />
		</Router>
	);
}
