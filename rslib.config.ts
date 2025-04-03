import { defineConfig } from "@rslib/core";

export default defineConfig({
	lib: [
		{
			format: "esm",
			bundle: false,
			autoExternal: false,
			dts: true,
		},
		{
			format: "cjs",
			bundle: false,
			autoExternal: false,
		},
	],
	output: {
		target: "web",
		sourceMap: {
			js: "source-map",
		},
		externals: [/^solid-js/, /^relay-runtime/, /^seroval/],
	},
});
