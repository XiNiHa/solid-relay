// A slightly modified version of SuspenseResource from https://github.com/facebook/relay/blob/46fa2faf0ecccd42bf6bebddb214be9446d3dcab/packages/react-relay/relay-hooks/SuspenseResource.js

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in https://github.com/facebook/relay/blob/46fa2faf0ecccd42bf6bebddb214be9446d3dcab/LICENSE.
 */

import type { Disposable, IEnvironment } from "relay-runtime";
import invariant from "tiny-invariant";

const TEMPORARY_RETAIN_DURATION_MS = 5 * 60 * 1000;

/**
 * Allows you to retain a resource as part of a component lifecycle accounting
 * for Suspense. You temporarily retain the resource during render, then
 * permanently retain it during commit and release it during unmount.
 */
export default class SuspenseResource {
	_retainCount = 0;
	_retainDisposable: Disposable | null = null;
	_releaseTemporaryRetain: (() => void) | null = null;
	_retain: (environment: IEnvironment) => Disposable;

	constructor(retain: (environment: IEnvironment) => Disposable) {
		this._retain = (environment: IEnvironment): Disposable => {
			this._retainCount++;
			if (this._retainCount === 1) {
				this._retainDisposable = retain(environment);
			}
			return {
				dispose: () => {
					this._retainCount = Math.max(0, this._retainCount - 1);
					if (this._retainCount === 0) {
						invariant(
							this._retainDisposable != null,
							"solid-relay: Expected disposable to release query to be defined." +
								"If you're seeing this, this is likely a bug in solid-relay.",
						);
						this._retainDisposable.dispose();
						this._retainDisposable = null;
					}
				},
			};
		};
	}

	temporaryRetain(environment: IEnvironment): Disposable {
		// If we're executing in a server environment, there's no need
		// to create temporary retains, since the component will never commit.
		if (environment.isServer()) {
			return { dispose: (): void => undefined };
		}

		// temporaryRetain is called during the render phase. However,
		// given that we can't tell if this render will eventually commit or not,
		// we create a timer to autodispose of this retain in case the associated
		// component never commits.
		// If the component /does/ commit, permanentRetain will clear this timeout
		// and permanently retain the data.
		const retention = this._retain(environment);
		let releaseQueryTimeout: number | null = null;
		const releaseTemporaryRetain = () => {
			if (releaseQueryTimeout != null) {
				clearTimeout(releaseQueryTimeout);
			}
			releaseQueryTimeout = null;
			this._releaseTemporaryRetain = null;
			retention.dispose();
		};
		releaseQueryTimeout = setTimeout(
			releaseTemporaryRetain,
			TEMPORARY_RETAIN_DURATION_MS,
		);

		// NOTE: Since temporaryRetain can be called multiple times, we release
		// the previous temporary retain after we re-establish a new one, since
		// we only ever need a single temporary retain until the permanent retain is
		// established.
		// temporaryRetain may be called multiple times by React during the render
		// phase, as well as multiple times by other query components that are
		// rendering the same query/variables.
		this._releaseTemporaryRetain?.();
		this._releaseTemporaryRetain = releaseTemporaryRetain;

		return {
			dispose: () => {
				this._releaseTemporaryRetain?.();
			},
		};
	}

	permanentRetain(environment: IEnvironment): Disposable {
		const disposable = this._retain(environment);
		this.releaseTemporaryRetain();
		return disposable;
	}

	releaseTemporaryRetain(): void {
		this._releaseTemporaryRetain?.();
		this._releaseTemporaryRetain = null;
	}

	getRetainCount(): number {
		return this._retainCount;
	}
}
