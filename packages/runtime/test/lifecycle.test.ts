import test from "node:test";
import assert from "node:assert/strict";
import { stopLoadedTweaks } from "../src/lifecycle";

test("stopLoadedTweaks awaits async stop before flushing storage", async () => {
  const events: string[] = [];
  const loaded = new Map([
    [
      "a",
      {
        stop: async () => {
          await Promise.resolve();
          events.push("stop");
        },
        storage: {
          flush: () => events.push("flush"),
        },
      },
    ],
  ]);

  await stopLoadedTweaks(loaded);

  assert.deepEqual(events, ["stop", "flush"]);
  assert.equal(loaded.size, 0);
});

test("stopLoadedTweaks continues after stop failures", async () => {
  const warnings: string[] = [];
  const events: string[] = [];
  const loaded = new Map([
    [
      "bad",
      {
        stop: async () => {
          throw new Error("boom");
        },
        storage: {
          flush: () => events.push("bad flush"),
        },
      },
    ],
    [
      "good",
      {
        stop: () => events.push("good stop"),
      },
    ],
  ]);

  await stopLoadedTweaks(loaded, {
    warn: (message) => warnings.push(message),
  });

  assert.deepEqual(events, ["bad flush", "good stop"]);
  assert.equal(warnings.length, 1);
  assert.equal(loaded.size, 0);
});

test("stopLoadedTweaks runs disposers even when stop fails", async () => {
  const events: string[] = [];
  const loaded = new Map([
    [
      "a",
      {
        stop: () => {
          throw new Error("boom");
        },
        disposers: [() => events.push("dispose")],
      },
    ],
  ]);

  await stopLoadedTweaks(loaded, { warn: () => {} });

  assert.deepEqual(events, ["dispose"]);
  assert.equal(loaded.size, 0);
});
