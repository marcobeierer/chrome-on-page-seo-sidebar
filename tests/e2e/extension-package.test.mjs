import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../../dist/", import.meta.url).pathname;

test("built extension package contains manifest, panel, bundles, and icons", async () => {
  const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.side_panel.default_path, "panel.html");
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(existsSync(join(dist, "panel.html")), true);
  assert.equal(existsSync(join(dist, "panel.css")), true);
  assert.equal(existsSync(join(dist, "background.js")), true);
  assert.equal(existsSync(join(dist, "panel.js")), true);

  for (const icon of Object.values(manifest.icons)) {
    assert.equal(existsSync(join(dist, icon)), true, `${icon} exists`);
  }
});

test("side panel shell exposes required first-release views", async () => {
  const panelHtml = await readFile(join(dist, "panel.html"), "utf8");
  assert.match(panelHtml, /id="refresh"/);
  assert.match(panelHtml, /id="shortcut-settings"/);
  assert.match(panelHtml, /id="page-panel"/);
  assert.match(panelHtml, /id="schema-panel"/);
  assert.match(panelHtml, /id="gsc-panel"/);
  assert.match(panelHtml, /Search Console \(GSC\)/);
  assert.match(panelHtml, /id="gsc-connect"/);
  assert.match(panelHtml, /id="gsc-property"/);
  assert.match(panelHtml, /id="gsc-quick-ranges"/);
  assert.match(panelHtml, /data-gsc-range="1"/);
  assert.match(panelHtml, /data-gsc-range="90"/);
  assert.match(panelHtml, /id="gsc-filter-details"/);
  assert.match(panelHtml, /id="gsc-query-filter"/);
  assert.match(panelHtml, /id="gsc-start-date"/);
  assert.match(panelHtml, /id="gsc-end-date"/);
  assert.match(panelHtml, /id="gsc-search-type"/);
  assert.match(panelHtml, /id="gsc-country"/);
  assert.match(panelHtml, /id="gsc-device"/);
  assert.match(panelHtml, /id="page-data"/);
  assert.match(panelHtml, /id="findings-view"/);
  assert.match(panelHtml, /may not be reliable/);
  assert.match(panelHtml, /id="tree-view"/);
  assert.match(panelHtml, /id="source-view"/);
  assert.match(panelHtml, /id="search"/);
  assert.match(panelHtml, /id="severity"/);
  assert.match(panelHtml, /id="format"/);
});

test("built extension keeps local-only analysis assumptions", async () => {
  const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
  const panelJs = await readFile(join(dist, "panel.js"), "utf8");
  const backgroundJs = await readFile(join(dist, "background.js"), "utf8");

  assert.deepEqual(manifest.permissions, ["activeTab", "identity", "sidePanel", "scripting", "storage", "tabs"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.googleapis.com/*"]);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.equal(manifest.oauth2.client_id, "69058266264-ld7v1ub46c76dicqgi0ul04hknq611ti.apps.googleusercontent.com");
  assert.deepEqual(manifest.oauth2.scopes, ["https://www.googleapis.com/auth/webmasters.readonly"]);
  assert.match(manifest.key, /^MIIB/);
  assert.match(backgroundJs, /openPanelOnActionClick/);
  assert.equal(manifest.commands, undefined);
  assert.doesNotMatch(panelJs, /\bfetch\s*\(/);
  assert.doesNotMatch(panelJs, /XMLHttpRequest/);
  assert.match(backgroundJs, /getAuthToken/);
  assert.match(backgroundJs, /webmasters\/v3\/sites/);
});

test("side panel bundle automatically analyzes on open and navigation", async () => {
  const panelJs = await readFile(join(dist, "panel.js"), "utf8");

  assert.match(panelJs, /scheduleAnalysis\("Analyzing current DOM\.\.\."/);
  assert.match(panelJs, /chrome\.tabs\.onUpdated\.addListener/);
  assert.match(panelJs, /chrome\.tabs\.onActivated\.addListener/);
  assert.match(panelJs, /chrome\.scripting\.executeScript/);
  assert.match(panelJs, /window\.location\.href/);
});
