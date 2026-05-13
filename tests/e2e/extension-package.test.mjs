import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../../dist/", import.meta.url).pathname;
const chromeDist = join(dist, "chrome");
const firefoxDist = join(dist, "firefox");

for (const [browser, outputDir] of [
  ["chrome", chromeDist],
  ["firefox", firefoxDist],
]) {
  test(`${browser} extension package contains manifest, panel, bundles, and icons`, async () => {
    const manifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8"));

    assert.equal(manifest.manifest_version, 3);
    assert.equal(existsSync(join(outputDir, "panel.html")), true);
    assert.equal(existsSync(join(outputDir, "panel.css")), true);
    assert.equal(existsSync(join(outputDir, "background.js")), true);
    assert.equal(existsSync(join(outputDir, "panel.js")), true);

    for (const icon of Object.values(manifest.icons)) {
      assert.equal(existsSync(join(outputDir, icon)), true, `${icon} exists`);
    }
  });
}

test("chrome extension package uses Chrome side panel integration", async () => {
  const manifest = JSON.parse(await readFile(join(chromeDist, "manifest.json"), "utf8"));

  assert.equal(manifest.side_panel.default_path, "panel.html");
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.minimum_chrome_version, "114");
  assert.deepEqual(manifest.permissions, ["activeTab", "sidePanel", "scripting", "tabs"]);
  assert.equal(manifest.sidebar_action, undefined);
  assert.equal(manifest.browser_specific_settings, undefined);
});

test("firefox extension package uses Firefox sidebar integration", async () => {
  const manifest = JSON.parse(await readFile(join(firefoxDist, "manifest.json"), "utf8"));

  assert.equal(manifest.sidebar_action.default_panel, "panel.html");
  assert.deepEqual(manifest.background.scripts, ["background.js"]);
  assert.equal(manifest.background.type, "module");
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "tabs"]);
  assert.equal(manifest.side_panel, undefined);
  assert.equal(manifest.minimum_chrome_version, undefined);
  assert.equal(manifest.homepage_url, undefined);
  assert.equal(manifest.permissions.includes("sidePanel"), false);
  assert.equal(typeof manifest.browser_specific_settings.gecko.id, "string");
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "142.0");
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions, {
    required: ["none"],
    optional: [],
  });
});

test("side panel shell exposes required first-release views", async () => {
  const panelHtml = await readFile(join(chromeDist, "panel.html"), "utf8");
  assert.match(panelHtml, /id="refresh"/);
  assert.match(panelHtml, /id="shortcut-settings"/);
  assert.match(panelHtml, /id="page-data"/);
  assert.match(panelHtml, /id="findings-view"/);
  assert.match(panelHtml, /may not be reliable/);
  assert.match(panelHtml, /id="tree-view"/);
  assert.match(panelHtml, /id="source-view"/);
  assert.match(panelHtml, /id="search"/);
  assert.match(panelHtml, /id="severity"/);
  assert.match(panelHtml, /id="format"/);
});

for (const [browser, outputDir, expectedPermissions] of [
  ["chrome", chromeDist, ["activeTab", "sidePanel", "scripting", "tabs"]],
  ["firefox", firefoxDist, ["activeTab", "scripting", "tabs"]],
]) {
  test(`${browser} extension keeps local-only analysis assumptions`, async () => {
    const manifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8"));
    const panelJs = await readFile(join(outputDir, "panel.js"), "utf8");

    assert.deepEqual(manifest.permissions, expectedPermissions);
    assert.equal(manifest.host_permissions, undefined);
    assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
    assert.equal(manifest.commands, undefined);
    assert.doesNotMatch(panelJs, /\bfetch\s*\(/);
    assert.doesNotMatch(panelJs, /XMLHttpRequest/);
  });
}

test("background bundle guards Chrome and Firefox sidebar APIs", async () => {
  const backgroundJs = await readFile(join(chromeDist, "background.js"), "utf8");

  assert.match(backgroundJs, /openPanelOnActionClick/);
  assert.match(backgroundJs, /sidebarAction/);
  assert.match(backgroundJs, /sidePanel/);
});

test("side panel bundle automatically analyzes on open and navigation", async () => {
  const panelJs = await readFile(join(chromeDist, "panel.js"), "utf8");

  assert.match(panelJs, /scheduleAnalysis\("Analyzing current DOM\.\.\."/);
  assert.match(panelJs, /onUpdated\.addListener/);
  assert.match(panelJs, /onActivated\.addListener/);
  assert.match(panelJs, /executeScript/);
  assert.match(panelJs, /window\.location\.href/);
});
