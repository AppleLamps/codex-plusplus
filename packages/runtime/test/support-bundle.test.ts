import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRuntimeSupportBundle, diagnosticsJson } from "../src/support-bundle";

test("runtime support bundle is redacted, bounded, and under support dir", () => {
  const root = mkdtempSync(join(tmpdir(), "codexpp-runtime-support-"));
  try {
    const runtimeDir = join(root, "runtime");
    const tweaksDir = join(root, "tweaks");
    const logDir = join(root, "log");
    mkdirSync(logDir, { recursive: true });
    mkdirSync(runtimeDir, { recursive: true });
    mkdirSync(tweaksDir, { recursive: true });
    writeFileSync(join(root, "config.json"), JSON.stringify({ token: "secret", ok: true }));
    writeFileSync(join(root, "state.json"), JSON.stringify({ accessKey: "secret", ok: true }));
    writeFileSync(join(logDir, "main.log"), `ghp_${"a".repeat(36)}\n${"x".repeat(250 * 1024)}`);
    writeFileSync(join(tweaksDir, "source.js"), "must not be copied");

    const result = createRuntimeSupportBundle({
      userRoot: root,
      runtimeDir,
      tweaksDir,
      logDir,
      configFile: join(root, "config.json"),
      stateFile: join(root, "state.json"),
      runtimeHealth: health(root, runtimeDir, tweaksDir, logDir),
    });

    assert.equal(result.dir.startsWith(join(root, "support")), true);
    assert.equal(existsSync(join(result.dir, "runtime-health.json")), true);
    assert.equal(existsSync(join(result.dir, "paths.json")), true);
    assert.equal(existsSync(join(result.dir, "config.redacted.json")), true);
    assert.equal(existsSync(join(result.dir, "state.redacted.json")), true);
    assert.equal(existsSync(join(result.dir, "source.js")), false);
    const log = readFileSync(join(result.dir, "logs", "main.log"), "utf8");
    assert.match(log, /truncated to last/);
    assert.doesNotMatch(log, /ghp_/);
    assert.match(readFileSync(join(result.dir, "config.redacted.json"), "utf8"), /\[redacted\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("diagnosticsJson is parseable and redacted", () => {
  const root = mkdtempSync(join(tmpdir(), "codexpp-runtime-diagnostics-"));
  try {
    const logDir = join(root, "log");
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(root, "config.json"), JSON.stringify({ apiKey: "secret", ok: true }));
    const json = diagnosticsJson({
      userRoot: root,
      runtimeDir: join(root, "runtime"),
      tweaksDir: join(root, "tweaks"),
      logDir,
      configFile: join(root, "config.json"),
      stateFile: join(root, "state.json"),
      runtimeHealth: health(root, join(root, "runtime"), join(root, "tweaks"), logDir),
    });
    const parsed = JSON.parse(json);
    assert.equal(parsed.config.apiKey, "[redacted]");
    assert.equal(parsed.runtimeHealth.version, "0.1.0");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function health(userRoot: string, runtimeDir: string, tweaksDir: string, logDir: string) {
  return {
    version: "0.1.0",
    paths: { userRoot, runtimeDir, tweaksDir, logDir },
    tweaks: { discovered: 1, loadedMain: 0, loadedRenderer: null },
    startedAt: "2026-01-01T00:00:00.000Z",
    lastReload: null,
    recentErrors: [],
  };
}
