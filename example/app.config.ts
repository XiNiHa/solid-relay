import { defineConfig } from "@solidjs/start/config";
import solidDevtools from "solid-devtools/vite";
import { cjsInterop } from "vite-plugin-cjs-interop";
import relay from "vite-plugin-relay";

export default defineConfig({
	vite: () => ({
		plugins: [
			solidDevtools({ autoname: true }),
			relay,
			cjsInterop({ dependencies: ["relay-runtime"] }),
		],
	}),
});
