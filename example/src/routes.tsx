// This module is separated out to prevent SolidStart HMR from recreating the Relay environment on route reloads
import { FileRoutes } from "@solidjs/start/router";

export function Routes() {
	return <FileRoutes />;
}
