import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as esbuild from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const publicDir = join(root, "public");
const manifestPath = join(publicDir, "manifest.json");
const browserTargets = {
  chrome: {
    esbuildTarget: "chrome120",
  },
  firefox: {
    esbuildTarget: "firefox115",
  },
};

const requestedTarget = process.argv[2];
if (requestedTarget !== undefined && !(requestedTarget in browserTargets)) {
  throw new Error(`Unknown build target "${requestedTarget}". Use chrome, firefox, or omit the target to build both.`);
}

const targets = requestedTarget === undefined ? Object.keys(browserTargets) : [requestedTarget];

if (requestedTarget === undefined) {
  await rm(dist, { recursive: true, force: true });
}
await mkdir(dist, { recursive: true });

await Promise.all([
  ...targets.map((target) => buildBrowserTarget(target)),
  buildTestApi(),
]);

async function buildBrowserTarget(target) {
  const outputDir = join(dist, target);
  const buildTarget = browserTargets[target].esbuildTarget;

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  await Promise.all([
    esbuild.build({
      entryPoints: [join(root, "src", "background.ts")],
      outfile: join(outputDir, "background.js"),
      bundle: true,
      format: "esm",
      target: buildTarget,
      sourcemap: true,
    }),
    esbuild.build({
      entryPoints: [join(root, "src", "panel.ts")],
      outfile: join(outputDir, "panel.js"),
      bundle: true,
      format: "iife",
      target: buildTarget,
      sourcemap: true,
    }),
  ]);

  await copyPublicAssets(outputDir);
  await writeManifest(outputDir, target);
}

function buildTestApi() {
  return esbuild.build({
    entryPoints: [join(root, "src", "test-api.ts")],
    outfile: join(dist, "test-api.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    sourcemap: false,
  });
}

async function copyPublicAssets(outputDir) {
  for (const entry of await readdir(publicDir)) {
    if (entry === "manifest.json") {
      continue;
    }
    await cp(join(publicDir, entry), join(outputDir, entry), { recursive: true });
  }
}

async function writeManifest(outputDir, target) {
  const baseManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifest = target === "firefox" ? firefoxManifest(baseManifest) : chromeManifest(baseManifest);
  await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function chromeManifest(baseManifest) {
  return {
    ...baseManifest,
    permissions: ["activeTab", "sidePanel", "scripting", "tabs"],
    background: {
      service_worker: "background.js",
      type: "module",
    },
    side_panel: {
      default_path: "panel.html",
    },
  };
}

function firefoxManifest(baseManifest) {
  const { minimum_chrome_version, side_panel, homepage_url, ...sharedManifest } = baseManifest;
  void minimum_chrome_version;
  void side_panel;
  void homepage_url;

  return {
    ...sharedManifest,
    permissions: ["activeTab", "scripting", "tabs"],
    background: {
      scripts: ["background.js"],
      type: "module",
    },
    sidebar_action: {
      default_title: baseManifest.action.default_title,
      default_panel: "panel.html",
      default_icon: baseManifest.action.default_icon,
      open_at_install: false,
    },
    browser_specific_settings: {
      gecko: {
        id: "on-page-seo-sidebar@marcobeierer.com",
        strict_min_version: "142.0",
        data_collection_permissions: {
          required: ["none"],
          optional: [],
        },
      },
    },
  };
}
