import path from "node:path";
import relay from "vite-plugin-relay-lite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"solid-relay": path.join(__dirname, "src"),
		},
	},
	plugins: [
		solid(),
		relay({
			codegen: false,
			omitTagImport: true,
			relayConfig: "tests/relay.config.json",
		}),
	],
	test: {
		globals: true,
		environment: "happy-dom",
		include: ["tests/**/*.test.tsx"],
		coverage: {
			include: ["src/**/*"],
		},
		setupFiles: ["./vitest.setup.ts"],
	},
});
