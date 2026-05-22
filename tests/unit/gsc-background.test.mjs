import test from "node:test";
import assert from "node:assert/strict";

let importIndex = 0;

test("GSC runtime connect lists normalized Search Console properties", async () => {
  const chromeMock = installChrome();
  const fetchCalls = installFetch(() => ({ siteEntry: [{ siteUrl: "https://example.com/", permissionLevel: "siteFullUser" }] }));
  const { registerGscRuntimeHandlers } = await importFreshTestApi();
  registerGscRuntimeHandlers();

  const response = await dispatch(chromeMock.messageListeners[0], { type: "gsc:connect" });

  assert.equal(response.ok, true);
  assert.deepEqual(response.value, [{ siteUrl: "https://example.com/", permissionLevel: "siteFullUser", type: "url-prefix", displayName: "https://example.com/" }]);
  assert.deepEqual(chromeMock.authTokenRequests, [{ interactive: true }]);
  assert.equal(fetchCalls[0].headers.get("Authorization"), "Bearer test-token");
});

test("GSC runtime query fetches rows, returns cached reports, and clears cache on sign-in change", async () => {
  const chromeMock = installChrome();
  const fetchCalls = installFetch((call) => {
    if (call.body.dimensions?.[0] === "query") {
      return { rows: [{ keys: ["desk"], clicks: 4, impressions: 20, ctr: 0.2, position: 3 }] };
    }
    return { rows: [{ clicks: 8, impressions: 40, ctr: 0.2, position: 2.5 }] };
  });
  const { registerGscRuntimeHandlers } = await importFreshTestApi();
  registerGscRuntimeHandlers();

  const message = {
    type: "gsc:query",
    property: property(),
    targetUrl: "https://example.com/page",
    filters: filters(),
    forceRefresh: false,
  };

  const first = await dispatch(chromeMock.messageListeners[0], message);
  const cached = await dispatch(chromeMock.messageListeners[0], message);
  chromeMock.signInListeners[0]();
  const afterSignInChange = await dispatch(chromeMock.messageListeners[0], message);

  assert.equal(first.ok, true);
  assert.equal(first.value.rows[0].query, "desk");
  assert.deepEqual(first.value.summary, { clicks: 8, impressions: 40, ctr: 0.2, position: 2.5 });
  assert.equal(cached.value.cacheHit, true);
  assert.equal(afterSignInChange.value.cacheHit, false);
  assert.equal(fetchCalls.length, 4);
  assert.equal(fetchCalls[0].body.dimensionFilterGroups[0].filters[0].expression, "https://example.com/page");
});

test("GSC runtime inspects URLs separately from query data", async () => {
  const chromeMock = installChrome();
  const fetchCalls = installFetch(() => ({ inspectionResult: { indexStatusResult: { googleCanonical: "https://example.com/google", userCanonical: "https://example.com/page" } } }));
  const { registerGscRuntimeHandlers } = await importFreshTestApi();
  registerGscRuntimeHandlers();

  const message = {
    type: "gsc:inspectUrl",
    property: property(),
    inspectionUrl: "https://example.com/current",
    forceRefresh: false,
  };

  const first = await dispatch(chromeMock.messageListeners[0], message);
  const cached = await dispatch(chromeMock.messageListeners[0], message);

  assert.equal(first.ok, true);
  assert.equal(first.value.result.googleCanonical, "https://example.com/google");
  assert.equal(cached.value.cacheHit, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].body.inspectionUrl, "https://example.com/current");
});

test("GSC runtime stores preferences and rejects malformed messages", async () => {
  const chromeMock = installChrome();
  const { registerGscRuntimeHandlers } = await importFreshTestApi();
  registerGscRuntimeHandlers();
  const listener = chromeMock.messageListeners[0];

  assert.equal(listener({ type: "gsc:query", property: {}, filters: filters(), targetUrl: "https://example.com", forceRefresh: false }, {}, () => {}), false);
  assert.equal(listener({ type: "gsc:inspectUrl", property: property(), inspectionUrl: 123, forceRefresh: false }, {}, () => {}), false);

  const preferences = { selectedProperties: { "example.com": "https://example.com/" }, filters: filters() };
  const saveResponse = await dispatch(listener, { type: "gsc:savePreferences", preferences });
  const getResponse = await dispatch(listener, { type: "gsc:getPreferences" });

  assert.deepEqual(saveResponse, { ok: true, value: { saved: true } });
  assert.deepEqual(getResponse, { ok: true, value: preferences });
});

test("GSC runtime returns user-facing API errors", async () => {
  const chromeMock = installChrome();
  installFetch(() => ({ error: { status: "PERMISSION_DENIED", message: "Forbidden" } }), { status: 403, statusText: "Forbidden" });
  const { registerGscRuntimeHandlers } = await importFreshTestApi();
  registerGscRuntimeHandlers();

  const response = await dispatch(chromeMock.messageListeners[0], { type: "gsc:listProperties" });

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "PERMISSION_DENIED");
  assert.match(response.error.message, /cannot read the selected Search Console property/);
});

function installChrome() {
  const storage = {};
  const mock = { authTokenRequests: [], removedTokens: [], messageListeners: [], signInListeners: [] };
  globalThis.chrome = {
    identity: {
      onSignInChanged: { addListener: (listener) => mock.signInListeners.push(listener) },
      getAuthToken: async (request) => {
        mock.authTokenRequests.push(request);
        return "test-token";
      },
      removeCachedAuthToken: async (request) => mock.removedTokens.push(request),
    },
    runtime: {
      lastError: undefined,
      onMessage: { addListener: (listener) => mock.messageListeners.push(listener) },
    },
    storage: {
      local: {
        get: async (key) => ({ [key]: storage[key] }),
        set: async (value) => Object.assign(storage, value),
      },
    },
  };
  return mock;
}

function installFetch(responseForCall, init = {}) {
  const calls = [];
  globalThis.fetch = async (url, request = {}) => {
    const call = { url, headers: request.headers, body: request.body === undefined ? undefined : JSON.parse(request.body) };
    calls.push(call);
    return new Response(JSON.stringify(responseForCall(call)), { status: init.status ?? 200, statusText: init.statusText ?? "OK" });
  };
  return calls;
}

function dispatch(listener, message) {
  return new Promise((resolve) => {
    const returned = listener(message, {}, resolve);
    assert.equal(returned, true);
  });
}

function importFreshTestApi() {
  importIndex += 1;
  return import(`../../dist/test-api.mjs?gsc-background=${importIndex}`);
}

function property() {
  return { siteUrl: "https://example.com/", permissionLevel: "siteFullUser", type: "url-prefix", displayName: "https://example.com/" };
}

function filters() {
  return { startDate: "2026-04-01", endDate: "2026-04-28", searchType: "web", country: "", device: "" };
}
