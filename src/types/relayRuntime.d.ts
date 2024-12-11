import type { TaskScheduler } from "relay-runtime";

declare module "relay-runtime" {
	export interface IEnvironment {
		getScheduler(): TaskScheduler | undefined;
	}
}
