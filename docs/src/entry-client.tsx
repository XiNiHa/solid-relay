// @refresh reload
import { StartClient, mount } from "@solidjs/start/client";

// biome-ignore lint/style/noNonNullAssertion: always exists
mount(() => <StartClient />, document.getElementById("app")!);
