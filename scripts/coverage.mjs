import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const coverageRoot = join(root, "coverage");
const v8CoverageDir = join(coverageRoot, "v8");

rmSync(v8CoverageDir, { recursive: true, force: true });
mkdirSync(v8CoverageDir, { recursive: true });

const testFiles = listFiles(join(root, "tests")).filter((file) => file.endsWith(".test.mjs"));
const testRun = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: root,
  env: { ...process.env, NODE_V8_COVERAGE: v8CoverageDir },
  stdio: "inherit",
});

if (testRun.status !== 0) {
  process.exit(testRun.status ?? 1);
}

const summaries = new Map();
for (const file of listFiles(v8CoverageDir).filter((entry) => entry.endsWith(".json"))) {
  const coverage = JSON.parse(readFileSync(file, "utf8"));
  for (const script of coverage.result ?? []) {
    const filePath = filePathFromProjectScriptUrl(script.url);
    if (filePath === undefined) {
      continue;
    }
    const summary = summaries.get(filePath) ?? { ranges: new Map(), functions: new Map() };
    for (const fn of script.functions ?? []) {
      if (fn.functionName !== "") {
        const range = fn.ranges?.[0];
        const key = range === undefined ? fn.functionName : `${fn.functionName}:${range.startOffset}:${range.endOffset}`;
        const existing = summary.functions.get(key) ?? false;
        if (fn.ranges?.some((range) => range.count > 0) === true) {
          summary.functions.set(key, true);
        } else if (!existing) {
          summary.functions.set(key, false);
        }
      }
      for (const range of fn.ranges ?? []) {
        const key = `${range.startOffset}:${range.endOffset}`;
        const existing = summary.ranges.get(key) ?? { bytes: range.endOffset - range.startOffset, covered: false };
        if (range.count > 0) {
          existing.covered = true;
        }
        summary.ranges.set(key, existing);
      }
    }
    summaries.set(filePath, summary);
  }
}

const rows = Array.from(summaries, ([filePath, summary]) => {
  const ranges = Array.from(summary.ranges.values());
  const functions = Array.from(summary.functions.values());
  return {
    file: relative(root, filePath),
    coveredBytes: ranges.filter((range) => range.covered).reduce((sum, range) => sum + range.bytes, 0),
    totalBytes: ranges.reduce((sum, range) => sum + range.bytes, 0),
    coveredFunctions: functions.filter(Boolean).length,
    totalFunctions: functions.length,
  };
})
  .filter((row) => row.totalBytes > 0)
  .sort((a, b) => a.file.localeCompare(b.file));

const totals = rows.reduce(
  (sum, row) => ({
    coveredBytes: sum.coveredBytes + row.coveredBytes,
    totalBytes: sum.totalBytes + row.totalBytes,
    coveredFunctions: sum.coveredFunctions + row.coveredFunctions,
    totalFunctions: sum.totalFunctions + row.totalFunctions,
  }),
  { coveredBytes: 0, totalBytes: 0, coveredFunctions: 0, totalFunctions: 0 },
);

console.log("\nV8 execution coverage");
console.log("file                 | range % | funcs % | covered/total bytes");
console.log("---------------------|---------|---------|--------------------");
for (const row of rows) {
  console.log(`${pad(row.file, 20)} | ${pad(percent(row.coveredBytes, row.totalBytes), 7)} | ${pad(percent(row.coveredFunctions, row.totalFunctions), 7)} | ${row.coveredBytes}/${row.totalBytes}`);
}
console.log("---------------------|---------|---------|--------------------");
console.log(`${pad("all files", 20)} | ${pad(percent(totals.coveredBytes, totals.totalBytes), 7)} | ${pad(percent(totals.coveredFunctions, totals.totalFunctions), 7)} | ${totals.coveredBytes}/${totals.totalBytes}`);

mkdirSync(coverageRoot, { recursive: true });
writeFileSync(join(coverageRoot, "coverage-summary.json"), `${JSON.stringify({ rows, totals }, null, 2)}\n`);

function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function filePathFromProjectScriptUrl(url) {
  if (typeof url !== "string" || !url.startsWith("file://")) {
    return undefined;
  }
  const filePath = new URL(url).pathname;
  if (!filePath.startsWith(root) || filePath.includes("/node_modules/") || filePath.includes("/tests/")) {
    return undefined;
  }
  return filePath;
}

function percent(covered, total) {
  return total === 0 ? "n/a" : `${((covered / total) * 100).toFixed(1)}%`;
}

function pad(value, length) {
  return String(value).padEnd(length, " ");
}
