// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";
import "solid-devtools";

// oxlint-disable-next-line typescript/no-non-null-assertion
mount(() => <StartClient />, document.getElementById("app")!);
