import test from "node:test";
import assert from "node:assert/strict";
import { evaluateActiveTabFunction, isRememberedActiveTab, rememberActiveTabId } from "../../dist/test-api.mjs";

test("active tab helpers remember the active tab id", () => {
  rememberActiveTabId(123);

  assert.equal(isRememberedActiveTab(123), true);
  assert.equal(isRememberedActiveTab(456), false);
});

test("evaluateActiveTabFunction rejects restricted browser URLs", async () => {
  installChrome({ tab: { id: 1, url: "chrome://extensions" } });

  await assert.rejects(() => evaluateActiveTabFunction(() => "unused"), /does not allow extensions to analyze/);
});

test("evaluateActiveTabFunction requests host access and executes in the active tab", async () => {
  const calls = installChrome({ tab: { id: 7, url: "https://example.com/path" }, executionResult: "analyzed" });

  const result = await evaluateActiveTabFunction(() => "analyzed", true);

  assert.equal(result, "analyzed");
  assert.deepEqual(calls.permissionRequests, [{ origins: ["https://example.com/*"] }]);
  assert.deepEqual(calls.scriptTargets, [{ tabId: 7 }]);
  assert.equal(isRememberedActiveTab(7), true);
});

test("evaluateActiveTabFunction normalizes missing host permission errors", async () => {
  installChrome({
    tab: { id: 9, url: "https://example.com/blocked" },
    executionError: new Error("Cannot access contents of url. Extension manifest must request permission to access this host."),
  });

  await assert.rejects(() => evaluateActiveTabFunction(() => "unused"), /Chrome has not granted access to https:\/\/example.com/);
});

function installChrome({ tab, permissionGranted = true, executionResult, executionError } = {}) {
  const calls = { permissionRequests: [], scriptTargets: [] };
  globalThis.chrome = {
    tabs: {
      query: async () => (tab === undefined ? [] : [tab]),
    },
    permissions: {
      request: async (request) => {
        calls.permissionRequests.push(request);
        return permissionGranted;
      },
    },
    scripting: {
      executeScript: async ({ target }) => {
        calls.scriptTargets.push(target);
        if (executionError !== undefined) {
          throw executionError;
        }
        return [{ result: executionResult }];
      },
    },
  };
  return calls;
}
