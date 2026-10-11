import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext, Script } from "node:vm";
import { injectScript } from "../src/browser/inject.ts";
import { createOverlayScript, removeOverlayScript } from "../src/tools/repl/overlay-content.ts";

const event = { addListener() {} };
let evaluation;
globalThis.chrome = {
	tabs: { onActivated: event, onRemoved: event, async get() { return { active: true }; } },
	webNavigation: { onCommitted: event },
	debugger: {
		onDetach: event,
		onEvent: event,
		async getTargets() { return []; },
		async attach() {},
		async sendCommand(_source, method, params) {
			if (method !== "Runtime.evaluate") return {};
			try {
				return { result: { value: await evaluation(params.expression) } };
			} catch (error) {
				return { exceptionDetails: { exception: { description: String(error) } } };
			}
		},
	},
};

test("debugger fallback executes the actual overlay removal script", async () => {
	let removed = false;
	const document = {
		getElementById(id) {
			assert.equal(id, "sitegeist-repl-overlay");
			return { remove() { removed = true; } };
		},
	};
	evaluation = (expression) => runInNewContext(expression, { window: {}, document });
	await injectScript(1, removeOverlayScript());
	assert.equal(removed, true);
});

test("debugger fallback accepts overlay creation syntax and preserves expression results", async () => {
	evaluation = (expression) => { new Script(expression); return undefined; };
	await injectScript(2, createOverlayScript("Regression test"));
	evaluation = (expression) => runInNewContext(expression, { window: {} });
	assert.equal(await injectScript(2, "Promise.resolve(42);\n"), 42);
	assert.equal((await injectScript(2, "({ text: ';' })")).text, ";");
});

test("userScripts path receives the original script unchanged", async () => {
	const code = removeOverlayScript();
	globalThis.chrome.userScripts = {
		async configureWorld() {},
		async execute(config) {
			assert.equal(config.js[0].code, code);
			return [{ result: 7 }];
		},
	};
	try {
		assert.equal(await injectScript(3, code), 7);
	} finally {
		delete globalThis.chrome.userScripts;
	}
});
