import { defineConfig } from "vite";
import relay from "vite-plugin-relay";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
	plugins: [solidPlugin(), relay],
	server: {
		port: 3000,
	},
	build: {
		target: "esnext",
	},
});
