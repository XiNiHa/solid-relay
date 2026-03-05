import { meros } from "meros/browser";
import {
	Environment,
	type GraphQLSingularResponse,
	Observable,
	RecordSource,
	Store,
} from "relay-runtime";
import { createMemo, type JSXElement } from "solid-js";
import { RelayEnvironmentProvider } from "solid-relay";
import * as Setups from "../setups";

export type SetupFile = keyof typeof Setups;
export type SetupSuite<T extends SetupFile> = keyof (typeof Setups)[T];
export type SetupId<
	TSetupFile extends SetupFile = SetupFile,
	TSetupSuite extends SetupSuite<TSetupFile> = SetupSuite<TSetupFile>,
> = `${TSetupFile}/${TSetupSuite & string}`;

export function SsrApp<
	TSetupFile extends SetupFile,
	TSetupSuite extends SetupSuite<TSetupFile>,
	TSetupId extends SetupId<TSetupFile, TSetupSuite> = SetupId<TSetupFile, TSetupSuite>,
>(props: { origin: string; testRunId: string; setupId: TSetupId }) {
	const environment = new Environment({
		store: new Store(new RecordSource(), { gcReleaseBufferSize: 0 }),
		network: {
			execute: () =>
				Observable.create((sink) => {
					(async () => {
						const response = await fetch(
							new URL(`/__ssr/graphql?testRunId=${props.testRunId}`, props.origin),
						);
						if (!response.ok) throw new Error("HTTP Error");

						const parts = await meros<GraphQLSingularResponse>(response);

						if (Symbol.asyncIterator in parts) {
							for await (const part of parts) {
								sink.next(part.body);
							}
						} else {
							sink.next(await parts.json());
						}

						sink.complete();
					})().catch((e) => sink.error(e));
				}),
		},
	});
	const SetupSuite = createMemo(() => {
		const [setupFile, setupSuite] = props.setupId.split("/") as [TSetupFile, TSetupSuite];
		return Setups[setupFile][setupSuite];
	});

	return (
		<RelayEnvironmentProvider environment={environment}>
			{(() => {
				const Comp = SetupSuite() as () => JSXElement;
				return <Comp />;
			})()}
		</RelayEnvironmentProvider>
	);
}
