import * as fs from "node:fs";
import * as path from "node:path";
import { createWithSolidBase } from "@kobalte/solidbase/config";
import defaultTheme, {
	type SidebarItem,
} from "@kobalte/solidbase/default-theme";
import { defineConfig } from "@solidjs/start/config";

export default defineConfig(
	createWithSolidBase(defaultTheme)(
		{
			ssr: true,
			server: {
				prerender: {
					crawlLinks: true,
				},
			},
		},
		{
			title: "Solid Relay",
			description: "SolidJS Bindings for Relay",
			lang: "en",
			issueAutolink: "https://github.com/XiNiHa/solid-relay/issues/:issue",
			editPath: "https://github.com/XiNiHa/solid-relay/edit/main/docs/:path",
			themeConfig: {
				socialLinks: {
					// @ts-ignore
					github: "https://github.com/XiNiHa/solid-relay",
				},
				nav: [
					{
						text: "Guide",
						link: "/guide",
					},
					{
						text: "API",
						link: "/api",
					},
				],
				sidebar: {
					"/guide": {
						items: [
							{
								title: "Overview",
								collapsed: false,
								items: [
									{
										title: "Getting Started",
										link: "/",
									},
								],
							},
						],
					},
					"/api": {
						items: [
							{
								title: "API Reference",
								collapsed: false,
								items: [
									{
										title: "Index",
										link: "/",
									},
								],
							},
							...(await Promise.all(
								["Functions", "Interfaces"].map(
									async (section): Promise<SidebarItem> => {
										const dir = section.toLowerCase();
										const items = await fs.promises.readdir(
											path.join(import.meta.dirname, "src/routes/api", dir),
										);

										return {
											title: section,
											collapsed: false,
											items: items.map((item) => {
												const name = path
													.basename(item)
													.replace(path.extname(item), "");
												return {
													title: name,
													link: `/${dir}/${name}`,
												};
											}),
										};
									},
								),
							)),
						],
					},
				},
			},
		},
	),
);
