import { commitLocalUpdate, type DataID, type Disposable } from "relay-runtime";
import { createMockEnvironment, type MockEnvironment } from "relay-test-utils";
import { createSignal, type JSXElement } from "solid-js";
import { createSubscriptionToInvalidationState, RelayEnvironmentProvider } from "solid-relay";
import { page } from "vitest/browser";
import { renderToBody, wait } from "./utils";

let environment: MockEnvironment;

const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>{props.children}</RelayEnvironmentProvider>
);

const Owner = (props: {
	dataIDs: readonly DataID[] | (() => readonly DataID[]);
	callback: (() => void) | (() => () => void);
	onDisposable?: (disposable: Disposable) => void;
}) => {
	const disposable = createSubscriptionToInvalidationState(props.dataIDs, props.callback);
	props.onDisposable?.(disposable);
	return <h1 data-testid="invalidation-owner">Owner</h1>;
};

const createUsers = (...ids: string[]) =>
	commitLocalUpdate(environment, (store) => {
		for (const id of ids) store.create(id, "User").setValue(id, "id");
	});

const invalidateRecord = (id: string) =>
	commitLocalUpdate(environment, (store) => store.get(id)?.invalidateRecord());

const invalidateStore = () => commitLocalUpdate(environment, (store) => store.invalidateStore());

describe("createSubscriptionToInvalidationState", () => {
	beforeEach(() => {
		environment = createMockEnvironment();
		createUsers("1", "2", "3");
	});

	it("calls the callback when a subscribed record is invalidated", async () => {
		const callback = vi.fn();

		renderToBody(() => (
			<View>
				<Owner dataIDs={["1", "2"]} callback={callback} />
			</View>
		));
		await wait(2);

		await expect.element(page.getByTestId("invalidation-owner")).toHaveTextContent("Owner");
		expect(callback).not.toHaveBeenCalled();

		invalidateRecord("1");
		expect(callback).toHaveBeenCalledTimes(1);

		invalidateRecord("2");
		expect(callback).toHaveBeenCalledTimes(2);
	});

	it("calls the callback when the whole store is invalidated", async () => {
		const callback = vi.fn();

		renderToBody(() => (
			<View>
				<Owner dataIDs={["1"]} callback={callback} />
			</View>
		));
		await wait(2);

		invalidateStore();
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("ignores invalidation of unrelated records", async () => {
		const callback = vi.fn();

		renderToBody(() => (
			<View>
				<Owner dataIDs={["1"]} callback={callback} />
			</View>
		));
		await wait(2);

		invalidateRecord("2");
		expect(callback).not.toHaveBeenCalled();
	});

	it("re-establishes the subscription when the data IDs change", async () => {
		const callback = vi.fn();
		const [ids, setIds] = createSignal<readonly DataID[]>(["1"]);
		const store = environment.getStore();
		const subscribe = vi.spyOn(store, "subscribeToInvalidationState");

		renderToBody(() => (
			<View>
				<Owner dataIDs={ids} callback={callback} />
			</View>
		));
		await wait(2);
		expect(subscribe).toHaveBeenCalledTimes(1);

		setIds(["2"]);
		await wait(2);
		expect(subscribe).toHaveBeenCalledTimes(2);

		invalidateRecord("1");
		expect(callback).not.toHaveBeenCalled();

		invalidateRecord("2");
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("does not re-subscribe when the data IDs are equivalent", async () => {
		const callback = vi.fn();
		const [ids, setIds] = createSignal<readonly DataID[]>(["1", "2"]);
		const subscribe = vi.spyOn(environment.getStore(), "subscribeToInvalidationState");

		renderToBody(() => (
			<View>
				<Owner dataIDs={ids} callback={callback} />
			</View>
		));
		await wait(2);

		setIds(["2", "1"]);
		await wait(2);
		setIds(["1", "2"]);
		await wait(2);

		expect(subscribe).toHaveBeenCalledTimes(1);

		invalidateRecord("1");
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("reads the latest callback from an accessor without re-subscribing", async () => {
		const first = vi.fn();
		const second = vi.fn();
		const [callback, setCallback] = createSignal<() => void>(first);
		const subscribe = vi.spyOn(environment.getStore(), "subscribeToInvalidationState");

		renderToBody(() => (
			<View>
				<Owner dataIDs={["1"]} callback={callback} />
			</View>
		));
		await wait(2);

		invalidateRecord("1");
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();

		setCallback(() => second);
		await wait(2);

		invalidateRecord("1");
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		expect(subscribe).toHaveBeenCalledTimes(1);
	});

	it("disposes the subscription on unmount", async () => {
		const callback = vi.fn();
		const [show, setShow] = createSignal(true);

		renderToBody(() => <View>{show() && <Owner dataIDs={["1"]} callback={callback} />}</View>);
		await wait(2);

		setShow(false);
		await wait(2);
		await expect.element(page.getByTestId("invalidation-owner")).not.toBeInTheDocument();

		invalidateRecord("1");
		invalidateStore();
		expect(callback).not.toHaveBeenCalled();
	});

	it("stops calling the callback after the returned disposable is disposed", async () => {
		const callback = vi.fn();
		let disposable: Disposable | undefined;

		renderToBody(() => (
			<View>
				<Owner dataIDs={["1"]} callback={callback} onDisposable={(d) => (disposable = d)} />
			</View>
		));
		await wait(2);

		invalidateRecord("1");
		expect(callback).toHaveBeenCalledTimes(1);

		disposable?.dispose();
		invalidateRecord("1");
		invalidateStore();
		expect(callback).toHaveBeenCalledTimes(1);
	});
});
