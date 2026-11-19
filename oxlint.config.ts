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
	// example still runs on Solid 1 and cannot type-check against this package;
	// remove once the example is migrated to Solid 2 in the follow-up PR.
	ignorePatterns: ["example/**"],
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
