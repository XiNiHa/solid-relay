import * as path from "node:path";
import { defineConfig } from "rspress/config";

export default defineConfig({
	root: path.join(__dirname, "docs"),
	title: "Solid Relay",
	icon: "/favicon.png",
	themeConfig: {
		socialLinks: [
			{
				icon: "github",
				mode: "link",
				content: "https://github.com/XiNiHa/solid-relay",
			},
		],
	},
	globalStyles: path.join(__dirname, "styles/global.css"),
});
