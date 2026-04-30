import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rootPkg = readJson("package.json");
const workspaces = [
  "packages/installer/package.json",
  "packages/runtime/package.json",
  "packages/sdk/package.json",
];
const errors = [];

for (const rel of workspaces) {
  const pkg = readJson(rel);
  if (pkg.version !== rootPkg.version) {
    errors.push(`${rel} version ${pkg.version} does not match root ${rootPkg.version}`);
  }
}

for (const rel of [
  "packages/installer/src/version.ts",
  "packages/runtime/src/version.ts",
]) {
  const text = read(rel);
  if (!text.includes(`CODEX_PLUSPLUS_VERSION = "${rootPkg.version}"`)) {
    errors.push(`${rel} CODEX_PLUSPLUS_VERSION does not match ${rootPkg.version}`);
  }
}

for (const rel of [
  "packages/installer/assets/runtime/main.js",
  "packages/installer/assets/runtime/preload.js",
  "packages/installer/assets/runtime/path-security.js",
  "packages/installer/assets/runtime/health.js",
  "packages/installer/assets/runtime/main-ipc.js",
  "packages/installer/assets/runtime/support-bundle.js",
]) {
  if (!existsSync(join(root, rel))) errors.push(`missing packaged runtime asset: ${rel}`);
}

const docs = [
  ["README.md", ["doctor --json", "support bundle", "install.ps1", "tweaks list"]],
  ["CHANGELOG.md", ["Phase 3", "doctor --json", "support bundle"]],
  ["docs/TROUBLESHOOTING.md", ["doctor --json", "support bundle"]],
];
for (const [rel, needles] of docs) {
  const text = read(rel);
  for (const needle of needles) {
    if (!text.includes(needle)) errors.push(`${rel} does not mention ${needle}`);
  }
}

if (errors.length > 0) {
  console.error("Release consistency check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Release consistency check passed.");

function readJson(rel) {
  return JSON.parse(read(rel));
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}
