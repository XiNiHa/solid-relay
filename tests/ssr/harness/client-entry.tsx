import { hydrate } from "solid-js/web";
import { type SetupId, SsrApp } from "./SsrApp";

declare global {
	interface Window {
		__SSR_TEST_RUN_ID__?: string;
		__SSR_SETUP_ID__?: SetupId;
	}
}

const root = document.getElementById("app");
const testRunId = window.__SSR_TEST_RUN_ID__;
const setupId = window.__SSR_SETUP_ID__;
if (!root || !testRunId || !setupId) {
	throw new Error("Missing SSR test bootstrap state");
}

hydrate(
	() => (
		<SsrApp origin={location.origin} testRunId={testRunId} setupId={setupId} />
	),
	root,
);
