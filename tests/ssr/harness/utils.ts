import { page } from "vitest/browser";

export function mountTestRunFrame(url: string) {
	document.body.innerHTML = "";
	const frame = document.createElement("iframe");
	frame.setAttribute("data-testid", "test-run-frame");
	frame.src = url;
	document.body.append(frame);
	return page.frameLocator(page.getByTestId("test-run-frame"));
}
