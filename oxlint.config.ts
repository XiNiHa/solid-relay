import { defineConfig } from "oxlint";

export const baseConfig = defineConfig({
	categories: {
		correctness: "error",
	},
	plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "jsdoc"],
	rules: {
		"typescript/no-non-null-assertion": "error",
		"typescript/no-explicit-any": "error",
	},
});

export default defineConfig({
	extends: [baseConfig],
	options: {
		typeAware: true,
		typeCheck: true,
	},
	rules: {
		"jsdoc/check-property-names": "error",
		"jsdoc/check-tag-names": ["error", { jsxTags: true }],
		"jsdoc/require-param-description": "error",
		"jsdoc/require-param-name": "error",
	},
});
