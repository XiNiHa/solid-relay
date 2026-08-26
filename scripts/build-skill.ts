/**
 * Embeds the guide docs (docs/src/routes/guide) into skills/solid-relay/references
 * as plain markdown, and regenerates the reference table in SKILL.md from each
 * guide's `skillPointer` frontmatter field.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const guideDir = path.join(root, "docs/src/routes/guide");
const skillDir = path.join(root, "skills/solid-relay");
const outDir = path.join(skillDir, "references");
const skillFile = path.join(skillDir, "SKILL.md");

const outputName = (file: string) =>
	file === "index.mdx" ? "getting-started.md" : file.replace(/\.mdx$/, ".md");

// YAML scalars quoted for reserved characters (backticks, colons) — unwrap and unescape them
const unquote = (value: string) => {
	const match = value.match(/^"(.*)"$/) ?? value.match(/^'(.*)'$/);
	if (!match) return value;
	return value.startsWith('"')
		? match[1].replace(/\\(["\\])/g, "$1")
		: match[1].replace(/''/g, "'");
};

const parseFrontmatter = (source: string) => {
	const match = source.match(/^---\n([\s\S]*?)\n---\n+/);
	if (!match) throw new Error("missing frontmatter");
	const fields = Object.fromEntries(
		match[1].split("\n").map((line) => {
			const [key, ...rest] = line.split(":");
			return [key.trim(), unquote(rest.join(":").trim())];
		}),
	);
	return { fields, body: source.slice(match[0].length) };
};

const transform = (body: string) =>
	body
		// docs-site-only fences for the package manager tabs
		.replace(
			/```package-install-dev\n([\s\S]*?)```/g,
			(_, pkgs: string) => "```sh\nnpm install -D " + pkgs.trim() + "\n```",
		)
		.replace(
			/```package-install\n([\s\S]*?)```/g,
			(_, pkgs: string) => "```sh\nnpm install " + pkgs.trim() + "\n```",
		)
		// site-relative links → sibling files
		.replace(/\]\(\/guide\/([\w-]+)\)/g, (_, slug: string) => `](./${slug}.md)`)
		.replace(/\]\(\/guide\/?\)/g, "](./getting-started.md)")
		.trimEnd() + "\n";

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const files = (await readdir(guideDir)).filter((f) => f.endsWith(".mdx")).sort();

const tableHeader = "| Task | Reference |";
const rows = [tableHeader, "| --- | --- |"];
for (const file of files) {
	const { fields, body } = parseFrontmatter(await readFile(path.join(guideDir, file), "utf8"));
	if (!fields.skillPointer) throw new Error(`${file}: missing \`skillPointer\` frontmatter field`);
	const name = outputName(file);
	await writeFile(path.join(outDir, name), transform(body));
	rows.push(`| ${fields.skillPointer} | \`references/${name}\` |`);
}

// replace the markdown table that opens with `tableHeader` (header row through the last contiguous `|` row)
const skill = await readFile(skillFile, "utf8");
const lines = skill.split("\n");
const start = lines.indexOf(tableHeader);
if (start === -1) throw new Error(`SKILL.md: missing table with header ${tableHeader}`);
let end = start;
while (end + 1 < lines.length && lines[end + 1].startsWith("|")) end++;
lines.splice(start, end - start + 1, ...rows);
await writeFile(skillFile, lines.join("\n"));
console.log(`Embedded ${files.length} guide docs into ${path.relative(root, outDir)}`);
