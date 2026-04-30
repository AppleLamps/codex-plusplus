/**
 * Main-process bootstrap. Loaded by the asar loader before Codex's own
 * main process code runs. We hook `BrowserWindow` so every window Codex
 * creates gets our preload script attached. We also stand up an IPC
 * channel for tweaks to talk to the main process.
 *
 * We are in CJS land here (matches Electron's main process and Codex's own
 * code). The renderer-side runtime is bundled separately into preload.js.
 */
import { app, BrowserWindow, clipboard, ipcMain, session, shell, webContents } from "electron";
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import chokidar from "chokidar";
import { discoverTweaks, type DiscoveredTweak } from "./tweak-discovery";
import { createDiskStorage, type DiskStorage } from "./storage";
import { resolveInside, isInsidePath } from "./path-security";
import { stopLoadedTweaks } from "./lifecycle";
import { CODEX_PLUSPLUS_VERSION, compareVersions, normalizeVersion } from "./version";
import { createMainIpc, type Disposer } from "./main-ipc";
import { createRuntimeHealth, type RuntimeHealthEvent, type RuntimeReloadStatus } from "./health";

const userRoot = process.env.CODEX_PLUSPLUS_USER_ROOT;
const runtimeDir = process.env.CODEX_PLUSPLUS_RUNTIME;

if (!userRoot || !runtimeDir) {
  throw new Error(
    "codex-plusplus runtime started without CODEX_PLUSPLUS_USER_ROOT/RUNTIME envs",
  );
}

const PRELOAD_PATH = resolve(runtimeDir, "preload.js");
const TWEAKS_DIR = resolve(userRoot, "tweaks");
const LOG_DIR = join(userRoot, "log");
const LOG_FILE = join(LOG_DIR, "main.log");
const CONFIG_FILE = join(userRoot, "config.json");
const CODEX_PLUSPLUS_REPO = "b-nnett/codex-plusplus";

mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(TWEAKS_DIR, { recursive: true });

const runtimeStartedAt = new Date().toISOString();
const recentRuntimeErrors: RuntimeHealthEvent[] = [];
let lastReload: RuntimeReloadStatus | null = null;

// Optional: enable Chrome DevTools Protocol on a TCP port so we can drive the
// running Codex from outside (curl http://localhost:<port>/json, attach via
// CDP WebSocket, take screenshots, evaluate in renderer, etc.). Codex's
// production build sets webPreferences.devTools=false, which kills the
// in-window DevTools shortcut, but `--remote-debugging-port` works regardless
// because it's a Chromium command-line switch processed before app init.
//
// Off by default. Set CODEXPP_REMOTE_DEBUG=1 (optionally CODEXPP_REMOTE_DEBUG_PORT)
// to turn it on. Must be appended before `app` becomes ready; we're at module
// top-level so that's fine.
if (process.env.CODEXPP_REMOTE_DEBUG === "1") {
  const port = process.env.CODEXPP_REMOTE_DEBUG_PORT ?? "9222";
  app.commandLine.appendSwitch("remote-debugging-port", port);
  log("info", `remote debugging enabled on port ${port}`);
}

interface PersistedState {
  codexPlusPlus?: {
    autoUpdate?: boolean;
    updateCheck?: CodexPlusPlusUpdateCheck;
  };
  /** Per-tweak enable flags. Missing entries default to enabled. */
  tweaks?: Record<string, { enabled?: boolean }>;
  /** Cached GitHub release checks. Runtime never auto-installs updates. */
  tweakUpdateChecks?: Record<string, TweakUpdateCheck>;
}

interface CodexPlusPlusUpdateCheck {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  updateAvailable: boolean;
  error?: string;
}

interface TweakUpdateCheck {
  checkedAt: string;
  repo: string;
  currentVersion: string;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  updateAvailable: boolean;
  error?: string;
}

function readState(): PersistedState {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as PersistedState;
  } catch {
    return {};
  }
}
function writeState(s: PersistedState): void {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(s, null, 2));
  } catch (e) {
    log("warn", "writeState failed:", String((e as Error).message));
  }
}
function isCodexPlusPlusAutoUpdateEnabled(): boolean {
  return readState().codexPlusPlus?.autoUpdate !== false;
}
function setCodexPlusPlusAutoUpdate(enabled: boolean): void {
  const s = readState();
  s.codexPlusPlus ??= {};
  s.codexPlusPlus.autoUpdate = enabled;
  writeState(s);
}
function isTweakEnabled(id: string): boolean {
  const s = readState();
  return s.tweaks?.[id]?.enabled !== false;
}
function setTweakEnabled(id: string, enabled: boolean): void {
  const s = readState();
  s.tweaks ??= {};
  s.tweaks[id] = { ...s.tweaks[id], enabled };
  writeState(s);
}

function log(level: "info" | "warn" | "error", ...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] [${level}] ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}\n`;
  try {
    appendFileSync(LOG_FILE, line);
  } catch {}
  if (level === "warn" || level === "error") {
    recentRuntimeErrors.push({
      at: new Date().toISOString(),
      level,
      message: args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ")
        .slice(0, 500),
    });
    recentRuntimeErrors.splice(0, Math.max(0, recentRuntimeErrors.length - 20));
  }
  if (level === "error") console.error("[codex-plusplus]", ...args);
}

// Surface unhandled errors from anywhere in the main process to our log.
process.on("uncaughtException", (e: Error & { code?: string }) => {
  log("error", "uncaughtException", { code: e.code, message: e.message, stack: e.stack });
});
process.on("unhandledRejection", (e) => {
  log("error", "unhandledRejection", { value: String(e) });
});

interface LoadedMainTweak {
  stop?: () => void | Promise<void>;
  disposers: Disposer[];
  storage: DiskStorage;
}

const tweakState = {
  discovered: [] as DiscoveredTweak[],
  loadedMain: new Map<string, LoadedMainTweak>(),
};

const registeredMainHandles = new Map<string, Disposer>();

// 1. Hook every session so our preload runs in every renderer.
//
// We use Electron's modern `session.registerPreloadScript` API (added in
// Electron 35). The deprecated `setPreloads` path silently no-ops in some
// configurations (notably with sandboxed renderers), so registerPreloadScript
// is the only reliable way to inject into Codex's BrowserWindows.
function registerPreload(s: Electron.Session, label: string): void {
  try {
    const reg = (s as unknown as {
      registerPreloadScript?: (opts: {
        type?: "frame" | "service-worker";
        id?: string;
        filePath: string;
      }) => string;
    }).registerPreloadScript;
    if (typeof reg === "function") {
      reg.call(s, { type: "frame", filePath: PRELOAD_PATH, id: "codex-plusplus" });
      log("info", `preload registered (registerPreloadScript) on ${label}:`, PRELOAD_PATH);
      return;
    }
    // Fallback for older Electron versions.
    const existing = s.getPreloads();
    if (!existing.includes(PRELOAD_PATH)) {
      s.setPreloads([...existing, PRELOAD_PATH]);
    }
    log("info", `preload registered (setPreloads) on ${label}:`, PRELOAD_PATH);
  } catch (e) {
    if (e instanceof Error && e.message.includes("existing ID")) {
      log("info", `preload already registered on ${label}:`, PRELOAD_PATH);
      return;
    }
    log("error", `preload registration on ${label} failed:`, e);
  }
}

app.whenReady().then(() => {
  log("info", "app ready fired");
  registerPreload(session.defaultSession, "defaultSession");
});

app.on("session-created", (s) => {
  registerPreload(s, "session-created");
});

// DIAGNOSTIC: log every webContents creation. Useful for verifying our
// preload reaches every renderer Codex spawns.
app.on("web-contents-created", (_e, wc) => {
  try {
    const wp = (wc as unknown as { getLastWebPreferences?: () => Record<string, unknown> })
      .getLastWebPreferences?.();
    log("info", "web-contents-created", {
      id: wc.id,
      type: wc.getType(),
      sessionIsDefault: wc.session === session.defaultSession,
      sandbox: wp?.sandbox,
      contextIsolation: wp?.contextIsolation,
    });
    wc.on("preload-error", (_ev, p, err) => {
      log("error", `wc ${wc.id} preload-error path=${p}`, String(err?.stack ?? err));
    });
  } catch (e) {
    log("error", "web-contents-created handler failed:", String((e as Error)?.stack ?? e));
  }
});

log("info", "main.ts evaluated; app.isReady=" + app.isReady());

// 2. Initial tweak discovery + main-scope load.
void loadAllMainTweaks();

let quitAfterTweakStop = false;
app.on("before-quit", (event) => {
  if (quitAfterTweakStop) return;
  event.preventDefault();
  quitAfterTweakStop = true;
  void (async () => {
    await stopAllMainTweaks();
    app.quit();
  })();
});

// 3. IPC: expose tweak metadata + reveal-in-finder.
ipcMain.handle("codexpp:list-tweaks", async () => {
  await Promise.all(tweakState.discovered.map((t) => ensureTweakUpdateCheck(t)));
  const updateChecks = readState().tweakUpdateChecks ?? {};
  return tweakState.discovered.map((t) => ({
    manifest: t.manifest,
    entry: t.entry,
    dir: t.dir,
    entryExists: existsSync(t.entry),
    enabled: isTweakEnabled(t.manifest.id),
    loadable: t.loadable,
    loadError: t.loadError,
    capabilities: t.capabilities,
    update: updateChecks[t.manifest.id] ?? null,
  }));
});

ipcMain.handle("codexpp:get-tweak-enabled", (_e, id: string) => isTweakEnabled(id));
ipcMain.handle("codexpp:set-tweak-enabled", async (_e, id: string, enabled: boolean) => {
  setTweakEnabled(id, !!enabled);
  log("info", `tweak ${id} enabled=${!!enabled}`);
  await reloadTweaks(`tweak ${id} enabled=${!!enabled}`);
  return true;
});

ipcMain.handle("codexpp:get-config", () => {
  const s = readState();
  return {
    version: CODEX_PLUSPLUS_VERSION,
    autoUpdate: s.codexPlusPlus?.autoUpdate !== false,
    updateCheck: s.codexPlusPlus?.updateCheck ?? null,
  };
});

ipcMain.handle("codexpp:set-auto-update", (_e, enabled: boolean) => {
  setCodexPlusPlusAutoUpdate(!!enabled);
  return { autoUpdate: isCodexPlusPlusAutoUpdateEnabled() };
});

ipcMain.handle("codexpp:check-codexpp-update", async (_e, force?: boolean) => {
  return ensureCodexPlusPlusUpdateCheck(force === true);
});

ipcMain.handle("codexpp:runtime-health", () =>
  createRuntimeHealth({
    version: CODEX_PLUSPLUS_VERSION,
    userRoot,
    runtimeDir,
    tweaksDir: TWEAKS_DIR,
    logDir: LOG_DIR,
    discoveredTweaks: tweakState.discovered.length,
    loadedMainTweaks: tweakState.loadedMain.size,
    loadedRendererTweaks: null,
    startedAt: runtimeStartedAt,
    lastReload,
    recentErrors: recentRuntimeErrors,
  }),
);

// Sandboxed renderer preload can't use Node fs to read tweak source. Main
// reads it on the renderer's behalf. Path must live under tweaksDir for
// security — we refuse anything else.
ipcMain.handle("codexpp:read-tweak-source", (_e, entryPath: string) => {
  const resolved = resolveInside(TWEAKS_DIR, entryPath, {
    mustExist: true,
    requireFile: true,
  });
  return require("node:fs").readFileSync(resolved, "utf8");
});

/**
 * Read an arbitrary asset file from inside a tweak's directory and return it
 * as a `data:` URL. Used by the settings injector to render manifest icons
 * (the renderer is sandboxed; `file://` won't load).
 *
 * Security: caller passes `tweakDir` and `relPath`; we (1) require tweakDir
 * to live under TWEAKS_DIR, (2) resolve relPath against it and re-check the
 * result still lives under TWEAKS_DIR, (3) cap output size at 1 MiB.
 */
const ASSET_MAX_BYTES = 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
ipcMain.handle(
  "codexpp:read-tweak-asset",
  (_e, tweakDir: string, relPath: string) => {
    const fs = require("node:fs") as typeof import("node:fs");
    const dir = resolveInside(TWEAKS_DIR, tweakDir, {
      mustExist: true,
      requireDirectory: true,
    });
    const full = resolveInside(dir, relPath, {
      mustExist: true,
      requireFile: true,
    });
    const stat = fs.statSync(full);
    if (stat.size > ASSET_MAX_BYTES) {
      throw new Error(`asset too large (${stat.size} > ${ASSET_MAX_BYTES})`);
    }
    const ext = full.slice(full.lastIndexOf(".")).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const buf = fs.readFileSync(full);
    return `data:${mime};base64,${buf.toString("base64")}`;
  },
);

// Sandboxed preload can't write logs to disk; forward to us via IPC.
ipcMain.on("codexpp:preload-log", (_e, level: "info" | "warn" | "error", msg: string) => {
  const lvl = level === "error" || level === "warn" ? level : "info";
  try {
    appendFileSync(
      join(LOG_DIR, "preload.log"),
      `[${new Date().toISOString()}] [${lvl}] ${msg}\n`,
    );
  } catch {}
});

// Sandbox-safe filesystem ops for renderer-scope tweaks. Each tweak gets
// a sandboxed dir under userRoot/tweak-data/<id>. Renderer side calls these
// over IPC instead of using Node fs directly.
ipcMain.handle("codexpp:tweak-fs", (_e, op: string, id: string, p: string, c?: string) => {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error("bad tweak id");
  const dir = resolve(userRoot!, "tweak-data", id);
  mkdirSync(dir, { recursive: true });
  if (op === "dataDir") return dir;
  if (!["read", "write", "exists"].includes(op)) {
    throw new Error(`unknown op: ${op}`);
  }
  const full = resolveInside(dir, p, {
    mustExist: op === "read",
    requireFile: op === "read",
  });
  const fs = require("node:fs") as typeof import("node:fs");
  switch (op) {
    case "read": return fs.readFileSync(full, "utf8");
    case "write": return fs.writeFileSync(full, c ?? "", "utf8");
    case "exists": return fs.existsSync(full);
  }
});

ipcMain.handle("codexpp:user-paths", () => ({
  userRoot,
  runtimeDir,
  tweaksDir: TWEAKS_DIR,
  logDir: LOG_DIR,
}));

ipcMain.handle("codexpp:reveal", (_e, p: string) => {
  shell.openPath(p).catch(() => {});
});

ipcMain.handle("codexpp:open-external", (_e, url: string) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    throw new Error("only github.com links can be opened from tweak metadata");
  }
  shell.openExternal(parsed.toString()).catch(() => {});
});

ipcMain.handle("codexpp:copy-text", (_e, text: string) => {
  clipboard.writeText(String(text));
  return true;
});

// Manual force-reload trigger from the renderer (e.g. the "Force Reload"
// button on our injected Tweaks page). Bypasses the watcher debounce.
ipcMain.handle("codexpp:reload-tweaks", async () => {
  await reloadTweaks("manual");
  return { at: Date.now(), count: tweakState.discovered.length };
});

// 4. Filesystem watcher → debounced reload + broadcast.
//    We watch the tweaks dir for any change. On the first tick of inactivity
//    we stop main-side tweaks, clear their cached modules, re-discover, then
//    restart and broadcast `codexpp:tweaks-changed` to every renderer so it
//    can re-init its host.
const RELOAD_DEBOUNCE_MS = 250;
let reloadTimer: NodeJS.Timeout | null = null;
function scheduleReload(reason: string): void {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    void reloadTweaks(reason);
  }, RELOAD_DEBOUNCE_MS);
}

try {
  const watcher = chokidar.watch(TWEAKS_DIR, {
    ignoreInitial: true,
    // Wait for files to settle before triggering — guards against partially
    // written tweak files during editor saves / git checkouts.
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    // Avoid eating CPU on huge node_modules trees inside tweak folders.
    ignored: (p) =>
      isInsidePath(TWEAKS_DIR, resolve(p)) &&
      /(^|[\\/])node_modules([\\/]|$)/.test(p),
  });
  watcher.on("all", (event, path) => scheduleReload(`${event} ${path}`));
  watcher.on("error", (e) => log("warn", "watcher error:", e));
  log("info", "watching", TWEAKS_DIR);
  app.on("will-quit", () => watcher.close().catch(() => {}));
} catch (e) {
  log("error", "failed to start watcher:", e);
}

// --- helpers ---

async function reloadTweaks(reason: string): Promise<void> {
  log("info", `reloading tweaks (${reason})`);
  try {
    await stopAllMainTweaks();
    clearTweakModuleCache();
    await loadAllMainTweaks();
    lastReload = { at: new Date().toISOString(), reason, ok: true };
    broadcastReload();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    lastReload = { at: new Date().toISOString(), reason, ok: false, error };
    log("error", `reload failed (${reason}):`, error);
    throw e;
  }
}

async function loadAllMainTweaks(): Promise<void> {
  try {
    tweakState.discovered = discoverTweaks(TWEAKS_DIR);
    log(
      "info",
      `discovered ${tweakState.discovered.length} tweak(s):`,
      tweakState.discovered.map((t) => t.manifest.id).join(", "),
    );
  } catch (e) {
    log("error", "tweak discovery failed:", e);
    tweakState.discovered = [];
  }

  for (const t of tweakState.discovered) {
    if (t.manifest.scope === "renderer") continue;
    if (!t.loadable) {
      log("warn", `skipping incompatible main tweak ${t.manifest.id}: ${t.loadError}`);
      continue;
    }
    if (!isTweakEnabled(t.manifest.id)) {
      log("info", `skipping disabled main tweak: ${t.manifest.id}`);
      continue;
    }
    let startupDisposers: Disposer[] = [];
    try {
      const mod = require(t.entry);
      const tweak = mod.default ?? mod;
      if (typeof tweak?.start === "function") {
        const storage = createDiskStorage(userRoot!, t.manifest.id);
        const disposers: Disposer[] = [];
        startupDisposers = disposers;
        await tweak.start({
          manifest: t.manifest,
          process: "main",
          log: makeLogger(t.manifest.id),
          storage,
          ipc: makeMainIpc(t.manifest.id, disposers),
          fs: makeMainFs(t.manifest.id),
        });
        tweakState.loadedMain.set(t.manifest.id, {
          stop: tweak.stop,
          disposers,
          storage,
        });
        log("info", `started main tweak: ${t.manifest.id}`);
      }
    } catch (e) {
      for (const dispose of startupDisposers) {
        try {
          dispose();
        } catch {}
      }
      log("error", `tweak ${t.manifest.id} failed to start:`, e);
    }
  }
}

function stopAllMainTweaks(): Promise<void> {
  return stopLoadedTweaks(tweakState.loadedMain, {
    info: (message) => log("info", message.replace("stopped tweak:", "stopped main tweak:")),
    warn: (message, error) => log("warn", message, error),
  });
}

function clearTweakModuleCache(): void {
  // Drop cached require() entries that live inside the tweaks dir so a
  // re-require on next load picks up fresh code.
  for (const key of Object.keys(require.cache)) {
    try {
      resolveInside(TWEAKS_DIR, key);
      delete require.cache[key];
    } catch {}
  }
}

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function ensureCodexPlusPlusUpdateCheck(force = false): Promise<CodexPlusPlusUpdateCheck> {
  const state = readState();
  const cached = state.codexPlusPlus?.updateCheck;
  if (
    !force &&
    cached &&
    cached.currentVersion === CODEX_PLUSPLUS_VERSION &&
    Date.now() - Date.parse(cached.checkedAt) < UPDATE_CHECK_INTERVAL_MS
  ) {
    return cached;
  }

  const release = await fetchLatestRelease(CODEX_PLUSPLUS_REPO, CODEX_PLUSPLUS_VERSION);
  const latestVersion = release.latestTag ? normalizeVersion(release.latestTag) : null;
  const check: CodexPlusPlusUpdateCheck = {
    checkedAt: new Date().toISOString(),
    currentVersion: CODEX_PLUSPLUS_VERSION,
    latestVersion,
    releaseUrl: release.releaseUrl ?? `https://github.com/${CODEX_PLUSPLUS_REPO}/releases`,
    releaseNotes: release.releaseNotes,
    updateAvailable: latestVersion
      ? (compareVersions(normalizeVersion(latestVersion), CODEX_PLUSPLUS_VERSION) ?? 0) > 0
      : false,
    ...(release.error ? { error: release.error } : {}),
  };
  state.codexPlusPlus ??= {};
  state.codexPlusPlus.updateCheck = check;
  writeState(state);
  return check;
}

async function ensureTweakUpdateCheck(t: DiscoveredTweak): Promise<void> {
  const id = t.manifest.id;
  const repo = t.manifest.githubRepo;
  const state = readState();
  const cached = state.tweakUpdateChecks?.[id];
  if (
    cached &&
    cached.repo === repo &&
    cached.currentVersion === t.manifest.version &&
    Date.now() - Date.parse(cached.checkedAt) < UPDATE_CHECK_INTERVAL_MS
  ) {
    return;
  }

  const next = await fetchLatestRelease(repo, t.manifest.version);
  const latestVersion = next.latestTag ? normalizeVersion(next.latestTag) : null;
  const check: TweakUpdateCheck = {
    checkedAt: new Date().toISOString(),
    repo,
    currentVersion: t.manifest.version,
    latestVersion,
    latestTag: next.latestTag,
    releaseUrl: next.releaseUrl,
    updateAvailable: latestVersion
      ? (compareVersions(latestVersion, normalizeVersion(t.manifest.version)) ?? 0) > 0
      : false,
    ...(next.error ? { error: next.error } : {}),
  };
  state.tweakUpdateChecks ??= {};
  state.tweakUpdateChecks[id] = check;
  writeState(state);
}

async function fetchLatestRelease(
  repo: string,
  currentVersion: string,
): Promise<{ latestTag: string | null; releaseUrl: string | null; releaseNotes: string | null; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": `codex-plusplus/${currentVersion}`,
        },
        signal: controller.signal,
      });
      if (res.status === 404) {
        return { latestTag: null, releaseUrl: null, releaseNotes: null, error: "no GitHub release found" };
      }
      if (!res.ok) {
        return { latestTag: null, releaseUrl: null, releaseNotes: null, error: `GitHub returned ${res.status}` };
      }
      const body = await res.json() as { tag_name?: string; html_url?: string; body?: string };
      return {
        latestTag: body.tag_name ?? null,
        releaseUrl: body.html_url ?? `https://github.com/${repo}/releases`,
        releaseNotes: body.body ?? null,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return {
      latestTag: null,
      releaseUrl: null,
      releaseNotes: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function broadcastReload(): void {
  const payload = {
    at: Date.now(),
    tweaks: tweakState.discovered.map((t) => t.manifest.id),
  };
  for (const wc of webContents.getAllWebContents()) {
    try {
      wc.send("codexpp:tweaks-changed", payload);
    } catch (e) {
      log("warn", "broadcast send failed:", e);
    }
  }
}

function makeLogger(scope: string) {
  return {
    debug: (...a: unknown[]) => log("info", `[${scope}]`, ...a),
    info: (...a: unknown[]) => log("info", `[${scope}]`, ...a),
    warn: (...a: unknown[]) => log("warn", `[${scope}]`, ...a),
    error: (...a: unknown[]) => log("error", `[${scope}]`, ...a),
  };
}

function makeMainIpc(id: string, disposers: Disposer[]) {
  return createMainIpc(id, ipcMain, disposers, registeredMainHandles);
}

function makeMainFs(id: string) {
  const dir = resolve(userRoot!, "tweak-data", id);
  mkdirSync(dir, { recursive: true });
  const fs = require("node:fs/promises") as typeof import("node:fs/promises");
  return {
    dataDir: dir,
    read: (p: string) =>
      fs.readFile(resolveInside(dir, p, { mustExist: true, requireFile: true }), "utf8"),
    write: (p: string, c: string) =>
      fs.writeFile(resolveInside(dir, p), c, "utf8"),
    exists: async (p: string) => {
      const full = resolveInside(dir, p);
      try {
        await fs.access(full);
        return true;
      } catch {
        return false;
      }
    },
  };
}

// Touch BrowserWindow to keep its import — older Electron lint rules.
void BrowserWindow;
