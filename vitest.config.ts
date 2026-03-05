import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { cjsInterop } from "vite-plugin-cjs-interop";
import relay from "vite-plugin-relay-lite";
import solid from "vite-plugin-solid";
import { defineConfig, type Plugin } from "vitest/config";
import { ssrBrowserCommands, ssrTestPlugin } from "./tests/ssr/harness/vitest";

const commonPlugins = (): Plugin[] => [
	relay({
		codegen: false,
		omitTagImport: true,
		relayConfig: "tests/relay.config.json",
	}),
];

export default defineConfig({
	resolve: {
		alias: {
			"solid-relay": path.join(__dirname, "src"),
		},
	},
	test: {
		globals: true,
		environment: "node",
		coverage: {
			include: ["src/**/*"],
		},
		setupFiles: ["./vitest.setup.ts"],
		projects: [
			{
				extends: true,
				plugins: [{ ...solid(), configEnvironment: undefined }, ...commonPlugins()],
				resolve: {
					conditions: ["solid", "development", "browser"],
				},
				test: {
					name: "browser",
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: "chromium" }],
					},
					include: ["tests/**/*.test.tsx"],
				},
			},
			{
				extends: true,
				plugins: [
					{
						...solid({ ssr: true }),
						configEnvironment: undefined,
					},
					ssrTestPlugin(),
					cjsInterop({ dependencies: ["relay-runtime"] }),
					...commonPlugins(),
				],
				resolve: {
					conditions: ["solid", "development", "browser"],
				},
				ssr: {
					resolve: {
						conditions: ["solid", "development", "node"],
					},
				},
				test: {
					name: "ssr",
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: "chromium" }],
						fileParallelism: false,
						commands: ssrBrowserCommands,
					},
					include: ["tests/**/*.test.ssr.tsx"],
				},
			},
		],
	},
});
