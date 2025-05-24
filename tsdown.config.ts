import MagicString from "magic-string";
import { minimatch } from "minimatch";
import type { ImportDeclaration } from "oxc-parser";
import { parseAndWalk } from "oxc-walker";
import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["./src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	publint: true,
	plugins: [
		// taken and modified from https://github.com/cyco130/vite-plugin-cjs-interop
		{
			name: "transform-cjs-import",
			async transform(code, id) {
				if (/\.d\.[mc]?tsx?(?:$|\?)/.test(id)) return;

				const matchesDependencies = (value: string) =>
					["relay-runtime", "relay-runtime/*"].some((dependency) =>
						minimatch(value, dependency),
					);

				const toBeFixed: ImportDeclaration[] = [];
				const preambles: string[] = [];

				parseAndWalk(code, id, {
					enter(node) {
						if (
							node.type === "ImportDeclaration" &&
							node.importKind !== "type"
						) {
							if (matchesDependencies(node.source.value as string)) {
								toBeFixed.push(node);
							}
						}
					},
				});

				if (toBeFixed.length === 0) {
					return;
				}
				const bottomUpToBeFixed = toBeFixed.reverse();

				const ms = new MagicString(code);
				let counter = 1;
				let isNamespaceImport = false;

				for (const node of bottomUpToBeFixed) {
					const destructurings: string[] = [];
					const name = `__cjsInterop${counter++}__`;
					let changed = false;

					for (const specifier of node.specifiers || []) {
						if (specifier.type === "ImportDefaultSpecifier") {
							changed = true;
							destructurings.push(`default: ${specifier.local.name} = ${name}`);
						} else if (
							specifier.type === "ImportSpecifier" &&
							specifier.importKind !== "type"
						) {
							changed = true;
							const importedName =
								specifier.imported.type === "Identifier"
									? specifier.imported.name
									: specifier.imported.value;
							if (importedName === specifier.local.name) {
								destructurings.push(specifier.local.name);
							} else {
								destructurings.push(`${importedName}: ${specifier.local.name}`);
							}
						} else if (specifier.type === "ImportNamespaceSpecifier") {
							changed = true;
							isNamespaceImport = true;
							destructurings.push(specifier.local.name);
						}
					}

					if (!changed) {
						continue;
					}
					if (!isNamespaceImport)
						preambles.push(
							`const { ${destructurings.join(
								", ",
							)} } = ${name}?.default?.__esModule ? ${name}.default : ${name};`,
						);
					else
						preambles.push(
							`const ${destructurings[0]} = ${name}?.default?.__esModule ? ${name}.default : ${name};`,
						);

					const replacement = `import ${name} from ${JSON.stringify(
						node.source.value,
					)};`;

					ms.overwrite(node.start, node.end, replacement);
				}

				const preamble = preambles.reverse().join("\n") + "\n";
				ms.prepend(preamble);

				return {
					code: ms.toString(),
					map: ms.generateMap({ hires: true }),
				};
			},
		},
		{
			name: "rewrite-relay-runtime-imports",
			async transform(code, id) {
				if (/\.d\.[mc]?tsx?(?:$|\?)/.test(id)) return;

				const ms = new MagicString(code);
				ms.replaceAll(/from\s+['"]relay-runtime['"]/g, (s) =>
					s.replace("relay-runtime", "relay-runtime/index.js"),
				);

				return {
					code: ms.toString(),
					map: ms.generateMap({ hires: true }),
				};
			},
		},
	],
});
