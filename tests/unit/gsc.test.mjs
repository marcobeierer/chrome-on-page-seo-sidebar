import test from "node:test";
import assert from "node:assert/strict";
import {
  GscMemoryCache,
  buildSearchAnalyticsRequest,
  buildSearchAnalyticsSummaryRequest,
  buildUrlInspectionRequest,
  gscTargetUrl,
  normalizeGscProperties,
  normalizeSearchAnalyticsRows,
  normalizeSearchAnalyticsSummary,
  normalizeStoredPreferences,
  normalizeUrlInspectionResult,
  selectBestGscProperty,
  sitePreferenceKey,
} from "../../dist/test-api.mjs";

test("GSC target URL prefers canonical and strips fragments", () => {
  assert.equal(gscTargetUrl("https://example.com/current#section", "https://example.com/canonical#main"), "https://example.com/canonical");
  assert.equal(gscTargetUrl("https://example.com/current#section", undefined), "https://example.com/current");
});

test("GSC property matching prefers saved property and longest URL prefix", () => {
  const properties = normalizeGscProperties({
    siteEntry: [
      { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
      { siteUrl: "https://example.com/", permissionLevel: "siteFullUser" },
      { siteUrl: "https://example.com/blog/", permissionLevel: "siteFullUser" },
    ],
  });

  assert.equal(selectBestGscProperty(properties, "https://example.com/blog/post")?.siteUrl, "https://example.com/blog/");
  assert.equal(selectBestGscProperty(properties, "https://example.com/blog/post", "sc-domain:example.com")?.siteUrl, "sc-domain:example.com");
  assert.equal(selectBestGscProperty(properties, "https://example.com/shop/product", "https://example.com/blog/")?.siteUrl, "https://example.com/");
});

test("GSC search analytics request includes page and optional filters", () => {
  const body = buildSearchAnalyticsRequest("https://example.com/page", {
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    searchType: "web",
    country: "USA",
    device: "MOBILE",
  });

  assert.equal(body.rowLimit, 50);
  assert.deepEqual(body.dimensions, ["query"]);
  assert.deepEqual(body.dimensionFilterGroups[0].filters, [
    { dimension: "page", operator: "equals", expression: "https://example.com/page" },
    { dimension: "country", operator: "equals", expression: "usa" },
    { dimension: "device", operator: "equals", expression: "MOBILE" },
  ]);
});

test("GSC summary request omits query dimension", () => {
  const body = buildSearchAnalyticsSummaryRequest("https://example.com/page", {
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    searchType: "web",
    country: "",
    device: "",
  });

  assert.equal(body.dimensions, undefined);
  assert.equal(body.rowLimit, 1);
  assert.deepEqual(body.dimensionFilterGroups[0].filters, [{ dimension: "page", operator: "equals", expression: "https://example.com/page" }]);
});

test("GSC rows normalize and sort by clicks", () => {
  const rows = normalizeSearchAnalyticsRows({
    rows: [
      { keys: ["second"], clicks: 1, impressions: 10, ctr: 0.1, position: 4.2 },
      { keys: ["first"], clicks: 9, impressions: 20, ctr: 0.45, position: 2.1 },
      { keys: [], clicks: 100 },
    ],
  });

  assert.deepEqual(rows.map((row) => row.query), ["first", "second"]);
  assert.equal(rows[0].ctr, 0.45);
});

test("GSC summary normalizes page-level totals", () => {
  const summary = normalizeSearchAnalyticsSummary({ rows: [{ clicks: 123, impressions: 456, ctr: 0.27, position: 3.4 }] });

  assert.deepEqual(summary, { clicks: 123, impressions: 456, ctr: 0.27, position: 3.4 });
});

test("GSC URL inspection request and canonical normalize", () => {
  assert.deepEqual(buildUrlInspectionRequest("https://example.com/current", "https://example.com/"), {
    inspectionUrl: "https://example.com/current",
    siteUrl: "https://example.com/",
  });
  assert.deepEqual(
    normalizeUrlInspectionResult({
      inspectionResult: {
        inspectionResultLink: "https://search.google.com/search-console/inspect/drilldown",
        indexStatusResult: { googleCanonical: "https://example.com/google", userCanonical: "N/A" },
      },
    }),
    { googleCanonical: "https://example.com/google", inspectionResultLink: "https://search.google.com/search-console/inspect/drilldown" },
  );
});

test("GSC memory cache expires after 15 minutes", () => {
  const cache = new GscMemoryCache();
  const property = { siteUrl: "https://example.com/", permissionLevel: "siteFullUser", type: "url-prefix", displayName: "https://example.com/" };
  const filters = { startDate: "2026-04-01", endDate: "2026-04-28", searchType: "web", country: "", device: "" };
  cache.set({ property, targetUrl: "https://example.com/page", filters, summary: { clicks: 0, impressions: 0, ctr: 0, position: 0 }, rows: [], fetchedAt: "2026-05-01T00:00:00.000Z", cacheHit: false }, 0);

  assert.equal(cache.get(property, "https://example.com/page", filters, 15 * 60 * 1000)?.cacheHit, true);
  assert.equal(cache.get(property, "https://example.com/other", filters, 15 * 60 * 1000), undefined);
  assert.equal(cache.get(property, "https://example.com/page", filters, 15 * 60 * 1000 + 1), undefined);
});

test("GSC preferences normalize without persisted report rows", () => {
  const preferences = normalizeStoredPreferences({
    selectedProperties: { [sitePreferenceKey("https://example.com/page")]: "https://example.com/" },
    filters: { startDate: "2026-04-01", endDate: "2026-04-28", searchType: "web", country: "deu", device: "DESKTOP" },
    rows: [{ query: "should not persist" }],
  });

  assert.equal(preferences.selectedProperties["example.com"], "https://example.com/");
  assert.equal(preferences.filters.device, "DESKTOP");
  assert.equal("rows" in preferences, false);
});
