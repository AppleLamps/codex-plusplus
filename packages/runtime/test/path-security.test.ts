import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { isInsidePath, resolveInside } from "../src/path-security";

test("resolveInside accepts nested files inside the base directory", () => {
  const root = tempDir();
  try {
    mkdirSync(join(root, "nested"));
    const file = join(root, "nested", "file.txt");
    writeFileSync(file, "ok");

    assert.equal(resolveInside(root, "nested/file.txt", { mustExist: true }), file);
  } finally {
    cleanup(root);
  }
});

test("resolveInside rejects traversal and absolute paths outside the base directory", () => {
  const root = tempDir();
  const outside = tempDir();
  try {
    const outsideFile = join(outside, "outside.txt");
    writeFileSync(outsideFile, "nope");

    assert.throws(() => resolveInside(root, "../outside.txt"), /outside base/);
    assert.throws(() => resolveInside(root, outsideFile), /outside base/);
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test("resolveInside rejects sibling-prefix paths", () => {
  const parent = tempDir();
  const root = join(parent, "tweak");
  const sibling = join(parent, "tweak-other");
  try {
    mkdirSync(root);
    mkdirSync(sibling);
    const siblingFile = join(sibling, "file.txt");
    writeFileSync(siblingFile, "nope");

    assert.throws(() => resolveInside(root, siblingFile), /outside base/);
  } finally {
    cleanup(parent);
  }
});

test("resolveInside permits missing write targets only when their existing parent is contained", () => {
  const root = tempDir();
  const outside = tempDir();
  try {
    mkdirSync(join(root, "nested"));

    assert.equal(
      resolveInside(root, "nested/new.txt"),
      resolve(root, "nested", "new.txt"),
    );
    assert.throws(() => resolveInside(root, join(outside, "new.txt")), /outside base/);
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test("isInsidePath respects directory boundaries", () => {
  const root = resolve("C:/tmp/tweak");

  assert.equal(isInsidePath(root, resolve("C:/tmp/tweak/file.js")), true);
  assert.equal(isInsidePath(root, resolve("C:/tmp/tweak-other/file.js")), false);
});

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "codexpp-"));
}

function cleanup(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
