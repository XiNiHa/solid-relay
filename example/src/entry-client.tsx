// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";
import "solid-devtools";

// biome-ignore lint/style/noNonNullAssertion: always present
mount(() => <StartClient />, document.getElementById("app")!);
