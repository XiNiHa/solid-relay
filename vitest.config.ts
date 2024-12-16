import relay from "vite-plugin-relay-lite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
