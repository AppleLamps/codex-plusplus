import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { buildSettingsFixture, setupSettingsDom } from "./fixtures/settings-ui-fixture";

const ipcCalls: Array<{ channel: string; args: unknown[] }> = [];
let confirmResult = true;
let confirmCount = 0;
let invokeOverrides = new Map<string, () => Promise<unknown>>();

const defaultHealth = {
  version: "0.1.0",
  paths: {
    userRoot: "/user/codex-plusplus",
    runtimeDir: "/user/codex-plusplus/runtime",
    tweaksDir: "/user/codex-plusplus/tweaks",
    logDir: "/user/codex-plusplus/log",
  },
  tweaks: { discovered: 2, loadedMain: 1, loadedRenderer: null },
  startedAt: "2026-01-01T00:00:00.000Z",
  lastReload: { at: "2026-01-01T00:02:00.000Z", reason: "manual", ok: true },
  recentErrors: [] as Array<{ at: string; level: "warn" | "error"; message: string }>,
};

const electronMock = {
  ipcRenderer: {
    send(channel: string, ...args: unknown[]) {
      ipcCalls.push({ channel, args });
    },
    invoke(channel: string, ...args: unknown[]) {
      ipcCalls.push({ channel, args });
      const override = invokeOverrides.get(channel);
      if (override) return override();
      if (channel === "codexpp:read-tweak-asset") return Promise.resolve(null);
      if (channel === "codexpp:open-external") return Promise.resolve(undefined);
      if (channel === "codexpp:set-tweak-enabled") return Promise.resolve(true);
      if (channel === "codexpp:reload-tweaks") return Promise.resolve({ at: Date.now(), count: 1 });
      if (channel === "codexpp:reveal") return Promise.resolve(undefined);
      if (channel === "codexpp:copy-text") return Promise.resolve(true);
      if (channel === "codexpp:get-config") {
        return Promise.resolve({ version: "0.1.0", autoUpdate: true, updateCheck: null });
      }
      if (channel === "codexpp:runtime-health") return Promise.resolve(defaultHealth);
      if (channel === "codexpp:check-codexpp-update") {
        return Promise.resolve({
          checkedAt: "2026-01-01T00:03:00.000Z",
          currentVersion: "0.1.0",
          latestVersion: "0.1.0",
          releaseUrl: "https://github.com/b-nnett/codex-plusplus/releases",
          releaseNotes: "No changes.",
          updateAvailable: false,
        });
      }
      return Promise.resolve(null);
    },
  },
};

const moduleLoader = Module as unknown as {
  _load: (request: string, parent?: unknown, isMain?: boolean) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") return electronMock;
  return originalLoad.call(this, request, parent, isMain);
};

let injector: typeof import("../src/preload/settings-injector");

before(async () => {
  injector = await import("../src/preload/settings-injector");
});

beforeEach(() => {
  ipcCalls.length = 0;
  invokeOverrides = new Map();
  confirmResult = true;
  confirmCount = 0;
  setupDom();
  injector.__resetSettingsInjectorForTests();
});

test("injects Codex++ nav once into a settings sidebar", () => {
  injector.__tryInjectForTests();
  injector.__tryInjectForTests();

  assert.equal(document.querySelectorAll('[data-codexpp="nav-group"]').length, 1);
  assert.equal(document.querySelectorAll('[data-codexpp="nav-config"]').length, 1);
  assert.equal(document.querySelectorAll('[data-codexpp="nav-tweaks"]').length, 1);
});

test("renders unavailable tweaks in Needs Attention with friendly capability labels", () => {
  injector.setListedTweaks([
    tweak("future", {
      name: "Future Tweak",
      enabled: true,
      loadable: false,
      loadError: "requires Codex++ 99.0.0 or newer",
      capabilities: ["Renderer UI", "Runtime Requirement"],
    }),
  ]);

  openTweaks();

  assert.match(document.body.textContent ?? "", /Needs Attention \(1\)/);
  assert.match(document.body.textContent ?? "", /Future Tweak/);
  assert.match(document.body.textContent ?? "", /Not Loaded/);
  assert.match(document.body.textContent ?? "", /requires Codex\+\+ 99\.0\.0/);
  assert.match(document.body.textContent ?? "", /Renderer UI/);
  assert.match(document.body.textContent ?? "", /Runtime Requirement/);
  assert.equal(document.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled, true);
});

test("groups mixed tweaks and filters by search/status", () => {
  injector.setListedTweaks([
    tweak("attention", { name: "Broken Tweak", loadable: false, loadError: "missing entry" }),
    tweak("update", { name: "Update Tweak", updateAvailable: true }),
    tweak("enabled", { name: "Enabled Tweak" }),
    tweak("disabled", { name: "Disabled Tweak", enabled: false }),
  ]);

  openTweaks();

  assert.ok(document.querySelector('[role="toolbar"][aria-label="Tweak manager controls"]'));
  assert.ok(document.querySelector('button[aria-label="Reload tweaks"]'));
  assert.ok(document.querySelector('button[aria-label="Open tweaks folder"]'));
  assert.match(document.body.textContent ?? "", /Needs Attention \(1\)/);
  assert.match(document.body.textContent ?? "", /Updates Available \(1\)/);
  assert.match(document.body.textContent ?? "", /Enabled \(1\)/);
  assert.match(document.body.textContent ?? "", /Disabled \(1\)/);

  click('[data-codexpp-filter="updates"]');
  assert.match(document.body.textContent ?? "", /Update Tweak/);
  assert.doesNotMatch(document.body.textContent ?? "", /Enabled Tweak/);

  const search = document.querySelector<HTMLInputElement>('input[aria-label="Search tweaks"]');
  assert.ok(search);
  search.value = "disabled";
  search.dispatchEvent(new Event("input"));
  assert.match(document.body.textContent ?? "", /No tweaks match/);

  click('[data-codexpp-filter="all"]');
  assert.match(document.body.textContent ?? "", /Disabled Tweak/);
});

test("update rows and async actions surface success and error feedback", async () => {
  injector.setListedTweaks([
    tweak("flaky", { name: "Flaky Tweak", updateAvailable: true }),
  ]);

  openTweaks();
  click('button[aria-label="View Release"]');
  assert.equal(
    ipcCalls.some((c) => c.channel === "codexpp:open-external" && c.args[0] === "https://github.com/owner/repo/releases/tag/v1.1.0"),
    true,
  );

  invokeOverrides.set("codexpp:set-tweak-enabled", () => Promise.reject(new Error("toggle denied")));
  click('button[aria-label="Disable Flaky Tweak"]');
  await flush();
  assert.match(document.body.textContent ?? "", /Could not disable: Error: toggle denied/);

  invokeOverrides.set("codexpp:reload-tweaks", () => Promise.reject(new Error("reload denied")));
  click('button[aria-label="Reload tweaks"]');
  await flush();
  assert.match(document.body.textContent ?? "", /Reload failed: Error: reload denied/);
});

test("main-process tweak enable asks once per session", async () => {
  injector.setListedTweaks([
    tweak("main", {
      name: "Main Tweak",
      enabled: false,
      capabilities: ["Renderer UI", "Main Process Access", "Local Data Storage"],
    }),
  ]);

  openTweaks();
  confirmResult = false;
  click('button[aria-label="Enable Main Tweak"]');
  await flush();
  assert.equal(confirmCount, 1);
  assert.equal(ipcCalls.some((c) => c.channel === "codexpp:set-tweak-enabled"), false);

  confirmResult = true;
  click('button[aria-label="Enable Main Tweak"]');
  await flush();
  assert.equal(confirmCount, 2);
  assert.equal(ipcCalls.filter((c) => c.channel === "codexpp:set-tweak-enabled").length, 1);

  click('button[aria-label="Disable Main Tweak"]');
  await flush();
  click('button[aria-label="Enable Main Tweak"]');
  await flush();
  assert.equal(confirmCount, 2);
});

test("Config renders health hub and maintenance copy actions", async () => {
  invokeOverrides.set("codexpp:runtime-health", () => Promise.resolve({
    ...defaultHealth,
    recentErrors: [{ at: "2026-01-01T00:04:00.000Z", level: "error", message: "preload failed" }],
  }));

  injector.__tryInjectForTests();
  click('[data-codexpp="nav-config"]');
  await flush();

  assert.match(document.body.textContent ?? "", /Install Health/);
  assert.match(document.body.textContent ?? "", /Needs Attention/);
  assert.match(document.body.textContent ?? "", /preload failed/);
  assert.match(document.body.textContent ?? "", /Copy support bundle command/);

  clickText("button", "codex-plusplus status --json");
  await flush();
  assert.equal(
    ipcCalls.some((c) => c.channel === "codexpp:copy-text" && c.args[0] === "codex-plusplus status --json"),
    true,
  );
  assert.match(document.body.textContent ?? "", /Command copied/);
});

test("Config update checks show pending and error states", async () => {
  let rejectUpdate!: (reason?: unknown) => void;
  invokeOverrides.set("codexpp:check-codexpp-update", () => new Promise((_resolve, reject) => {
    rejectUpdate = reject;
  }));

  injector.__tryInjectForTests();
  click('[data-codexpp="nav-config"]');
  await flush();

  click('button[aria-label="Check for Codex++ updates"]');
  assert.match(document.body.textContent ?? "", /Checking/);
  rejectUpdate(new Error("network down"));
  await flush();

  assert.match(document.body.textContent ?? "", /Update check failed/);
  assert.match(document.body.textContent ?? "", /network down/);
});

test("registered tweak page render errors appear as polished error rows", () => {
  injector.__tryInjectForTests();
  injector.registerPage("danger", { id: "danger", name: "Danger", version: "1.0.0", githubRepo: "owner/repo", scope: "both" }, {
    id: "danger:broken",
    title: "Broken Page",
    render() {
      throw new Error("boom");
    },
  });

  click('[data-codexpp="nav-page-danger:broken"]');

  assert.match(document.body.textContent ?? "", /Main Process Access/);
  assert.match(document.body.textContent ?? "", /Error rendering page/);
  assert.match(document.body.textContent ?? "", /boom/);
});

test("recovers after the settings container remounts", () => {
  injector.__tryInjectForTests();
  assert.equal(document.querySelectorAll('[data-codexpp="nav-group"]').length, 1);

  document.body.textContent = "";
  buildSettingsFixture();
  injector.__tryInjectForTests();

  assert.equal(document.querySelectorAll('[data-codexpp="nav-group"]').length, 1);
  assert.equal(document.querySelector('[data-codexpp="nav-tweaks"]')?.textContent?.includes("Tweaks"), true);
});

function openTweaks(): void {
  injector.__tryInjectForTests();
  click('[data-codexpp="nav-tweaks"]');
}

function setupDom(): void {
  setupSettingsDom({
    onConfirm: () => {
      confirmCount++;
      return confirmResult;
    },
  });
}

function tweak(
  id: string,
  patch: Partial<{
    name: string;
    enabled: boolean;
    loadable: boolean;
    entryExists: boolean;
    loadError: string;
    capabilities: string[];
    updateAvailable: boolean;
  }> = {},
) {
  return {
    manifest: {
      id,
      name: patch.name ?? id,
      version: "1.0.0",
      githubRepo: "owner/repo",
      description: `${patch.name ?? id} description`,
    },
    entry: `/tmp/${id}/index.js`,
    dir: `/tmp/${id}`,
    entryExists: patch.entryExists ?? true,
    enabled: patch.enabled ?? true,
    loadable: patch.loadable ?? true,
    ...(patch.loadError ? { loadError: patch.loadError } : {}),
    update: patch.updateAvailable ? {
      checkedAt: "2026-01-01T00:01:00.000Z",
      repo: "owner/repo",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      latestTag: "v1.1.0",
      releaseUrl: "https://github.com/owner/repo/releases/tag/v1.1.0",
      updateAvailable: true,
    } : null,
    capabilities: patch.capabilities ?? ["Renderer UI", "Local Data Storage", "Scoped IPC"],
  };
}

function click(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  assert.ok(el, selector);
  el.click();
}

function clickText(selector: string, nearbyText: string): void {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const match = candidates.find((el) => {
    const actions = el.closest<HTMLElement>("[data-codexpp-row-actions]");
    const row = actions?.parentElement;
    return row?.textContent?.includes(nearbyText) === true;
  });
  assert.ok(match, `${selector} near ${nearbyText}`);
  match.click();
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
