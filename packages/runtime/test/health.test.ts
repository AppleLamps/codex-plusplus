import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeHealth } from "../src/health";

test("createRuntimeHealth returns redacted stable diagnostics", () => {
  const health = createRuntimeHealth({
    version: "0.1.0",
    userRoot: "/user/root",
    runtimeDir: "/user/root/runtime",
    tweaksDir: "/user/root/tweaks",
    logDir: "/user/root/log",
    discoveredTweaks: 2,
    loadedMainTweaks: 1,
    loadedRendererTweaks: null,
    startedAt: "2026-01-01T00:00:00.000Z",
    lastReload: { at: "2026-01-01T00:01:00.000Z", reason: "test", ok: true },
    recentErrors: Array.from({ length: 12 }, (_, i) => ({
      at: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
      level: "warn" as const,
      message: `warning ${i}`,
    })),
  });

  assert.equal(health.version, "0.1.0");
  assert.equal(health.tweaks.discovered, 2);
  assert.equal(health.tweaks.loadedRenderer, null);
  assert.equal(health.recentErrors.length, 10);
  assert.deepEqual(Object.keys(health.paths).sort(), ["logDir", "runtimeDir", "tweaksDir", "userRoot"].sort());
});
