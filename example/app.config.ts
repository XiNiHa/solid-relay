import { defineConfig } from "@solidjs/start/config";
import solidDevtools from "solid-devtools/vite";
import relay from "vite-plugin-relay";

export default defineConfig({
	vite: {
		plugins: [solidDevtools({ autoname: true }), relay],
		optimizeDeps: {
			include: ["relay-runtime"],
		},
		ssr: {
			noExternal: [/^relay-runtime(?:\/|$)/, /^solid-js(?:\/|$)/],
			optimizeDeps: {
				include: ["relay-runtime", "relay-runtime/experimental"],
			},
		},
	},
});
