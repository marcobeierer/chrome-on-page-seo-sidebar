import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import * as esbuild from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const publicDir = join(root, "public");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all([
  esbuild.build({
    entryPoints: [join(root, "src", "background.ts")],
    outfile: join(dist, "background.js"),
    bundle: true,
    format: "esm",
    target: "chrome120",
    sourcemap: true,
  }),
  esbuild.build({
    entryPoints: [join(root, "src", "panel.ts")],
    outfile: join(dist, "panel.js"),
    bundle: true,
    format: "iife",
    target: "chrome120",
    sourcemap: true,
  }),
  esbuild.build({
    entryPoints: [join(root, "src", "test-api.ts")],
    outfile: join(dist, "test-api.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    sourcemap: false,
  }),
]);

for (const entry of await readdir(publicDir)) {
  await cp(join(publicDir, entry), join(dist, entry), { recursive: true });
}
