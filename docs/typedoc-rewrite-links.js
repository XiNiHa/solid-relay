// @ts-check

import { MarkdownPageEvent } from "typedoc-plugin-markdown";

/**
 * @param {import('typedoc-plugin-markdown').MarkdownApplication} app
 */
export function load(app) {
	app.renderer.on(MarkdownPageEvent.END, (page) => {
		page.contents = page.contents?.replace(
			/\[([^\]]+)\]\((?!https?:|\/|\.)([^)]*#?[^)]*)\)/g,
			(_, text, url) => {
				const urlWithAnchor = url.split("#");
				if (urlWithAnchor.length > 1) {
					const anchorPart = slugifyAnchor(urlWithAnchor[1]);
					return `[${text}](${encodeURI(`${rewritePath(urlWithAnchor[0])}#${anchorPart}`)})`;
				}
				return `[${text}](${encodeURI(rewritePath(url))})`;
			},
		);
	});
}

/**
 * @param {string} path
 */
function rewritePath(path) {
	return path.replace(/\.mdx?$/, "");
}

// biome-ignore lint/suspicious/noControlCharactersInRegex:
const rControl = /[\u0000-\u001f]/g;
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;
// biome-ignore lint/suspicious/noMisleadingCharacterClass:
const rCombining = /[\u0300-\u036F]/g;

/**
 *
 * @param {string} str
 * @returns {string}
 */
export const slugifyAnchor = (str) =>
	str
		.normalize("NFKD")
		// Remove accents
		.replace(rCombining, "")
		// Remove control characters
		.replace(rControl, "")
		// Replace special characters
		.replace(rSpecial, "-")
		// Remove continuos separators
		.replace(/-{2,}/g, "-")
		// Remove prefixing and trailing separators
		.replace(/^-+|-+$/g, "")
		// ensure it doesn't start with a number (#121)
		.replace(/^(\d)/, "_$1")
		// lowercase
		.toLowerCase();
