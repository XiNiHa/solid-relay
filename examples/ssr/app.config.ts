import { defineConfig } from "@solidjs/start/config";
import relay from "vite-plugin-relay";

export default defineConfig({
	vite: {
		plugins: [relay],
		optimizeDeps: {
			include: ["relay-runtime"],
		},
		ssr: {
			noExternal: ["relay-runtime", "relay-runtime/experimental"],
			optimizeDeps: {
				include: ["relay-runtime", "relay-runtime/experimental"],
			},
		},
	},
});
