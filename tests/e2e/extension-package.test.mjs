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
  assert.match(panelHtml, /id="page-data"/);
  assert.match(panelHtml, /id="findings-view"/);
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

  assert.deepEqual(manifest.permissions, ["sidePanel", "scripting", "tabs"]);
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.match(backgroundJs, /openPanelOnActionClick/);
  assert.equal(manifest.commands, undefined);
  assert.doesNotMatch(panelJs, /\bfetch\s*\(/);
  assert.doesNotMatch(panelJs, /XMLHttpRequest/);
});

test("side panel bundle automatically analyzes on open and navigation", async () => {
  const panelJs = await readFile(join(dist, "panel.js"), "utf8");

  assert.match(panelJs, /scheduleAnalysis\("Analyzing current DOM\.\.\."/);
  assert.match(panelJs, /chrome\.tabs\.onUpdated\.addListener/);
  assert.match(panelJs, /chrome\.tabs\.onActivated\.addListener/);
  assert.match(panelJs, /chrome\.scripting\.executeScript/);
  assert.match(panelJs, /window\.location\.href/);
});
