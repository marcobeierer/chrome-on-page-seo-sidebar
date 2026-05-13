import { access, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import packageJson from "../package.json" with { type: "json" };

const root = new URL("..", import.meta.url).pathname;
const target = process.argv[2] ?? "chrome";
if (!["chrome", "firefox"].includes(target)) {
  throw new Error(`Unknown package target "${target}". Use chrome or firefox.`);
}

const dist = join(root, "dist", target);
const releaseDir = join(root, "release");
const archiveName = `${packageJson.name}-${target}-${packageJson.version}.zip`;
const archivePath = join(releaseDir, archiveName);

await access(join(dist, "manifest.json"), constants.R_OK);
await mkdir(releaseDir, { recursive: true });
await rm(archivePath, { force: true });

await zipDist(archivePath);

console.log(`Created ${archivePath}`);

function zipDist(outputPath) {
  return new Promise((resolve, reject) => {
    const zip = spawn(
      "zip",
      ["-r", outputPath, ".", "-x", "*.map", "test-api.mjs"],
      { cwd: dist, stdio: "inherit" },
    );

    zip.on("error", reject);
    zip.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`zip exited with status ${code}`));
    });
  });
}
