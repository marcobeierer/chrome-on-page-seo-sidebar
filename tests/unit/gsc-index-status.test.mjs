import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { gscIndexStatusCard } from "../../dist/test-api.mjs";

const currentUrl = "https://example.com/a?x=1&y=two";
const owner = property("sc-domain:example.com", "siteOwner", "domain");

test("PASS is indexed and does not offer indexing request", () => {
  installDom();
  const card = cardFor({ verdict: "PASS", inspectionResultLink: "https://search.google.com/search-console/inspect/ok" });
  assert.match(card.textContent, /Indexed/);
  assert.doesNotMatch(card.textContent, /Request indexing/);
  assertNoInspectionBoilerplate(card);
});

test("FAIL and NEUTRAL offer request indexing only to owners and full users", () => {
  installDom();
  for (const verdict of ["FAIL", "NEUTRAL"]) {
    const card = cardFor({ verdict, coverageState: "Discovered - currently not indexed" }, owner);
    assert.match(card.textContent, /Not indexed/);
    assert.match(card.textContent, /Discovered - currently not indexed/);
    assertNoInspectionBoilerplate(card);
    const action = card.querySelector("a");
    assert.equal(action.textContent, "Request indexing in Search Console");
    assert.equal(action.target, "_blank");
    assert.equal(action.rel, "noopener noreferrer");
    assert.equal(action.href, "https://search.google.com/search-console?action=inspect&resource_id=sc-domain%3Aexample.com");
  }
  assert.match(cardFor({ verdict: "FAIL" }, property("https://example.com/", "siteFullUser")).querySelector("a").textContent, /Request indexing/);
  const restricted = cardFor({ verdict: "FAIL" }, property("https://example.com/", "siteRestrictedUser"));
  assert.equal(restricted.querySelector("a").textContent, "Open URL Inspection");
  assert.match(restricted.textContent, /owner or full-user/);
});

test("unspecified and unknown verdicts remain unavailable with no request CTA", () => {
  installDom();
  for (const verdict of [undefined, "VERDICT_UNSPECIFIED", "PARTIAL", "FUTURE"]) {
    const card = cardFor(verdict === undefined ? {} : { verdict });
    assert.match(card.textContent, /Indexing status unavailable/);
    assert.doesNotMatch(card.textContent, /Not indexed|Request indexing/);
    assert.equal(card.querySelector("a").textContent, "Open URL Inspection");
  }
});

test("status-only results do not infer status from canonicals and mismatched inspection is ignored", () => {
  installDom();
  assert.match(cardFor({ googleCanonical: "https://example.com/canonical" }).textContent, /Indexing status unavailable/);
  assert.match(cardFor({ verdict: "FAIL" }, owner, { inspectionUrl: "https://example.com/other" }).textContent, /Indexing status unavailable/);
  assert.match(cardFor({ verdict: "FAIL" }, owner, { property: property("https://example.com/", "siteOwner") }).textContent, /Indexing status unavailable/);
});

test("safe API link is used and unsafe API links fall back to encoded property action", () => {
  installDom();
  const safe = cardFor({ verdict: "FAIL", inspectionResultLink: "https://search.google.com/search-console/inspect?q=ok" }).querySelector("a");
  assert.equal(safe.href, "https://search.google.com/search-console/inspect?q=ok");
  const unsafe = cardFor({ verdict: "FAIL", inspectionResultLink: "https://evil.example/search-console/" }, owner).querySelector("a");
  assert.equal(unsafe.href, "https://search.google.com/search-console?action=inspect&resource_id=sc-domain%3Aexample.com");
});

test("loading and structured errors suppress stale verdicts", () => {
  installDom();
  const loading = gscIndexStatusCard({ inspectionUrl: currentUrl, property: owner, inspection: response({ verdict: "FAIL" }), loading: true });
  assert.equal(loading.textContent.trim(), "Indexing statusChecking indexing status...");
  assert.equal(loading.querySelectorAll("p").length, 0);
  assert.equal(loading.querySelectorAll("a, button").length, 0);

  const error = gscIndexStatusCard({ inspectionUrl: currentUrl, property: owner, inspection: response({ verdict: "FAIL" }), loading: false, error: { code: "failed", message: "Inspection failed" } });
  assert.doesNotMatch(error.textContent, /Not indexed|Request indexing/);
  assert.match(error.textContent, /Inspection failed/);
});

function assertNoInspectionBoilerplate(card) {
  assert.doesNotMatch(card.textContent, /https:\/\/example\.com\/a\?x=1&y=two|Based on Google's stored index data|live test|2026-05-01|cache hit|API/);
}

function cardFor(result, selectedProperty = owner, overrides = {}) {
  return gscIndexStatusCard({
    inspectionUrl: currentUrl,
    property: selectedProperty,
    inspection: response(result, { property: selectedProperty, ...overrides }),
    loading: false,
  });
}

function response(result, overrides = {}) {
  return { property: owner, inspectionUrl: currentUrl, result, fetchedAt: "2026-05-01T00:00:00.000Z", cacheHit: false, ...overrides };
}

function property(siteUrl, permissionLevel, type = "url-prefix") {
  return { siteUrl, permissionLevel, type, displayName: siteUrl };
}

function installDom() {
  const { window } = parseHTML("<!doctype html><html><body></body></html>");
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
}
