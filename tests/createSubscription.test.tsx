import type { GraphQLSubscriptionConfig, GraphQLTaggedNode, OperationType } from "relay-runtime";
import { createMockEnvironment, type MockEnvironment } from "relay-test-utils";
import { createSignal, type JSXElement } from "solid-js";
import { createSubscription, RelayEnvironmentProvider } from "solid-relay";
import { page } from "vitest/browser";
import { renderToBody, wait } from "./utils";

let environment: MockEnvironment;

const View = (props: { children: JSXElement }) => (
	<RelayEnvironmentProvider environment={environment}>{props.children}</RelayEnvironmentProvider>
);

type TestSubscription = OperationType;

const subscription = {} as GraphQLTaggedNode;

const Owner = (props: {
	config:
		| GraphQLSubscriptionConfig<TestSubscription>
		| (() => GraphQLSubscriptionConfig<TestSubscription>);
	requestSubscriptionFn: Parameters<typeof createSubscription<TestSubscription>>[1];
}) => {
	createSubscription<TestSubscription>(props.config, props.requestSubscriptionFn);
	return <h1 data-testid="subscription-owner">Owner</h1>;
};

describe("createSubscription", () => {
	beforeEach(() => {
		environment = createMockEnvironment();
	});

	it("subscribes on mount with a plain config object", async () => {
		const dispose = vi.fn();
		const config: GraphQLSubscriptionConfig<TestSubscription> = {
			subscription,
			variables: { id: "1" },
		};
		const requestSubscriptionFn = vi.fn(() => ({ dispose }));

		renderToBody(() => (
			<View>
				<Owner config={config} requestSubscriptionFn={requestSubscriptionFn} />
			</View>
		));

		await wait(2);

		await expect.element(page.getByTestId("subscription-owner")).toHaveTextContent("Owner");
		expect(requestSubscriptionFn).toHaveBeenCalledTimes(1);
		expect(requestSubscriptionFn).toHaveBeenCalledWith(environment, config);
		expect(dispose).not.toHaveBeenCalled();
	});

	it("reads an accessor config only at mount time", async () => {
		const dispose = vi.fn();
		const [id, setId] = createSignal("1");
		const requestSubscriptionFn = vi.fn<
			NonNullable<Parameters<typeof createSubscription<TestSubscription>>[1]>
		>(() => ({ dispose }));

		renderToBody(() => (
			<View>
				<Owner
					config={() => ({
						subscription,
						variables: { id: id() },
					})}
					requestSubscriptionFn={
						requestSubscriptionFn as Parameters<typeof createSubscription<TestSubscription>>[1]
					}
				/>
			</View>
		));

		await wait(2);
		setId("2");
		await wait(2);

		expect(requestSubscriptionFn).toHaveBeenCalledTimes(1);
		expect(requestSubscriptionFn.mock.calls[0]?.[1]).toMatchObject({
			variables: { id: "1" },
		});
		expect(dispose).not.toHaveBeenCalled();
	});

	it("disposes the active subscription on unmount", async () => {
		const dispose = vi.fn();
		const requestSubscriptionFn = vi.fn(() => ({ dispose }));
		let setShow: ((value: boolean) => boolean) | undefined;

		const App = () => {
			const [show, setLocalShow] = createSignal(true);
			setShow = setLocalShow;
			return (
				<>
					{show() && (
						<Owner
							config={{ subscription, variables: { id: "1" } }}
							requestSubscriptionFn={requestSubscriptionFn}
						/>
					)}
				</>
			);
		};

		renderToBody(() => (
			<View>
				<App />
			</View>
		));

		await wait(2);
		setShow?.(false);
		await wait(2);

		expect(requestSubscriptionFn).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);
		await expect.element(page.getByTestId("subscription-owner")).not.toBeInTheDocument();
	});

	it("creates a fresh subscription when remounted", async () => {
		const firstDispose = vi.fn();
		const secondDispose = vi.fn();
		const requestSubscriptionFn = vi
			.fn()
			.mockImplementationOnce(() => ({ dispose: firstDispose }))
			.mockImplementationOnce(() => ({ dispose: secondDispose }));
		let setShow: ((value: boolean) => boolean) | undefined;

		const App = () => {
			const [show, setLocalShow] = createSignal(true);
			setShow = setLocalShow;
			return (
				<>
					{show() && (
						<Owner
							config={{ subscription, variables: { id: "1" } }}
							requestSubscriptionFn={requestSubscriptionFn}
						/>
					)}
				</>
			);
		};

		renderToBody(() => (
			<View>
				<App />
			</View>
		));

		await wait(2);
		setShow?.(false);
		await wait(2);
		setShow?.(true);
		await wait(2);

		expect(firstDispose).toHaveBeenCalledTimes(1);
		expect(secondDispose).not.toHaveBeenCalled();
		expect(requestSubscriptionFn).toHaveBeenCalledTimes(2);
		await expect.element(page.getByTestId("subscription-owner")).toHaveTextContent("Owner");
	});
});
