import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { discoverTweaks } from "../src/tweak-discovery";

test("discoverTweaks accepts valid custom main and default entries", () => {
  const root = tempDir();
  try {
    writeTweak(root, "custom", { main: "src/main.js" }, { "src/main.js": "" });
    writeTweak(root, "default", {}, { "index.js": "" });

    const ids = discoverTweaks(root).map((t) => t.manifest.id).sort();

    assert.deepEqual(ids, ["default", "custom"].sort());
  } finally {
    cleanup(root);
  }
});

test("discoverTweaks rejects escaped, absolute outside, and directory main entries", () => {
  const root = tempDir();
  const outside = tempDir();
  try {
    const outsideFile = join(outside, "outside.js");
    writeFileSync(outsideFile, "");
    writeTweak(root, "escaped", { main: "../outside.js" }, { "index.js": "" });
    writeTweak(root, "absolute", { main: outsideFile }, { "index.js": "" });
    writeTweak(root, "directory", { main: "src" }, { "src/index.js": "" });
    writeTweak(root, "default-directory", {}, { "index.js/nested.js": "" });

    assert.deepEqual(discoverTweaks(root), []);
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test("discoverTweaks marks incompatible minRuntime tweaks as not loadable", () => {
  const root = tempDir();
  try {
    writeTweak(root, "old", { minRuntime: "0.0.1" }, { "index.js": "" });
    writeTweak(root, "new", { minRuntime: "99.0.0" }, { "index.js": "" });
    writeTweak(root, "invalid", { minRuntime: "soon" }, { "index.js": "" });

    const byId = new Map(discoverTweaks(root).map((t) => [t.manifest.id, t]));

    assert.equal(byId.get("old")?.loadable, true);
    assert.equal(byId.get("new")?.loadable, false);
    assert.match(byId.get("new")?.loadError ?? "", /Requires Codex\+\+/);
    assert.equal(byId.get("invalid")?.loadable, false);
    assert.match(byId.get("invalid")?.loadError ?? "", /Invalid minRuntime/);
  } finally {
    cleanup(root);
  }
});

function writeTweak(
  root: string,
  id: string,
  manifestPatch: Record<string, unknown>,
  files: Record<string, string>,
): void {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const file = join(dir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      id,
      name: id,
      version: "1.0.0",
      githubRepo: "owner/repo",
      ...manifestPatch,
    }),
  );
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "codexpp-"));
}

function cleanup(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
