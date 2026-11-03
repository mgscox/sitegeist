import assert from "node:assert/strict";
import test from "node:test";
import { handlers } from "../src/bridge/tools.ts";
import { ensureAttached } from "../src/browser/cdp.ts";

function event() {
	const listeners = new Set();
	return {
		addListener(listener) { listeners.add(listener); },
		removeListener(listener) { listeners.delete(listener); },
		emit(details) { for (const listener of listeners) listener(details); },
	};
}

const tabs = new Map();
const metrics = new Map();
const nav = {
	onCommitted: event(),
	onCompleted: event(),
	onDOMContentLoaded: event(),
	onErrorOccurred: event(),
	async getFrame({ tabId }) { return { errorOccurred: tabs.get(tabId).failed }; },
};
globalThis.chrome = {
	tabs: { onActivated: event(), onRemoved: event(), async get(tabId) { return tabs.get(tabId); } },
	webNavigation: nav,
	debugger: {
		onDetach: event(),
		async getTargets() { return []; },
		async attach() {},
		async sendCommand({ tabId }, method, params) {
			if (method === "Emulation.setDeviceMetricsOverride") metrics.set(tabId, [params.width, params.height]);
			if (method === "Emulation.clearDeviceMetricsOverride") metrics.delete(tabId);
		},
	},
};

const context = {
	session: {
		tabIds: [1, 2],
		async setCurrent(tabId) { this.currentTabId = tabId; },
		async requireCurrentTab() { return tabs.get(this.currentTabId); },
		async currentTab() { return undefined; },
		async createTab(url) {
			const tab = { id: 3, url, status: "complete", failed: true };
			tabs.set(tab.id, tab);
			return tab;
		},
	},
	async checkUrl() {},
};

test("a viewport resize is per tab and yields to the user's active tab", async () => {
	tabs.set(1, { id: 1, active: false });
	tabs.set(2, { id: 2, active: false });
	const resize = handlers["viewport.set"];
	assert.deepEqual(await resize(context, { tabId: 1, width: 1024, height: 640 }), {
		tabId: 1, width: 1024, height: 640,
	});
	await resize(context, { tabId: 2, width: 1280, height: 800 });
	await assert.rejects(resize(context, { tabId: 1, width: 1024.5, height: 640 }), /integer/);
	await assert.rejects(resize(context, { tabId: 999, width: 1024, height: 640 }), /not owned/);
	assert.deepEqual(metrics.get(1), [1024, 640]);
	assert.deepEqual(metrics.get(2), [1280, 800]);

	tabs.get(1).active = true;
	chrome.tabs.onActivated.emit({ tabId: 1 });
	await assert.rejects(resize(context, { tabId: 1, width: 1280, height: 800 }), /active/);
	assert.equal(metrics.has(1), false);
	tabs.get(1).active = false;
	await ensureAttached(1);
	assert.deepEqual(metrics.get(1), [1024, 640]);
});

test("a failed first navigation is reported as an error rather than a complete page", async () => {
	const url = "http://127.0.0.1:43298/";
	await assert.rejects(handlers.navigate(context, { url, timeoutMs: 100 }), /Navigation.*failed/);
});
