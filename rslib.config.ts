import { defineConfig } from "@rslib/core";

export default defineConfig({
	lib: [
		{
			format: "esm",
			autoExternal: false,
			dts: true,
		},
		{
			format: "cjs",
			autoExternal: false,
		},
	],
	output: {
		target: "web",
		sourceMap: {
			js: "source-map",
		},
		externals: [/^solid-js/, /^relay-runtime/],
	},
});
