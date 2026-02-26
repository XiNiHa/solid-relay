// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

// biome-ignore lint/style/noNonNullAssertion: always exists
mount(() => <StartClient />, document.getElementById("app")!);
