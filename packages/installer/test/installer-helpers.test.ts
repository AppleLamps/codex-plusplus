import test from "node:test";
import assert from "node:assert/strict";
import asar from "@electron/asar";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { resolveUninstallAppRoot } from "../src/commands/uninstall";
import { collectDoctorChecks, diagnosticDirLabel } from "../src/commands/doctor";
import { collectStatus } from "../src/commands/status";
import { supportBundle } from "../src/commands/support";
import { tweaksList } from "../src/commands/tweaks";
import { preflightProbePath } from "../src/commands/install";
import { describeIntegritySupport } from "../src/integrity";
import { openCommandForPath } from "../src/open-path";
import { listLocalTweaks } from "../src/tweak-manifest";
import { injectLoader, requiredRuntimeAssetPaths, restoreFromBackup } from "../src/installer-core";
import { readFileInAsar } from "../src/asar";
import { buildWindowsRepairCommand, windowsCommandArg } from "../src/watcher";
import {
  assertWindowsCodexNotRunning,
  discoverWindowsInstalls,
  getWindowsCodexProcessStatus,
  getWindowsScheduledTaskStatus,
  windowsCandidateFromPath,
} from "../src/windows";

test("resolveUninstallAppRoot requires state or explicit app override", () => {
  assert.equal(resolveUninstallAppRoot("C:/Codex", undefined), "C:/Codex");
  assert.equal(resolveUninstallAppRoot(undefined, "C:/RecordedCodex"), "C:/RecordedCodex");
  assert.throws(
    () => resolveUninstallAppRoot(undefined, undefined),
    /--app <path-to-Codex-app>/,
  );
});

test("diagnosticDirLabel uses platform basename semantics", () => {
  assert.equal(diagnosticDirLabel("C:\\Users\\me\\.codex-plusplus\\runtime"), "runtime");
});

test("describeIntegritySupport is explicit by platform", () => {
  assert.equal(describeIntegritySupport("darwin", true).supported, true);
  const win = describeIntegritySupport("win32", false);
  assert.equal(win.supported, false);
  assert.match(win.detail, /not implemented/);
});

test("Windows discovery semver-sorts Squirrel app directories", () => {
  const root = tempDir();
  try {
    writeWindowsApp(root, "app-0.9.0");
    writeWindowsApp(root, "app-0.10.0");
    mkdirSync(join(root, "app-99.0.0"), { recursive: true });
    writeFileSync(join(root, "not-app-100"), "");

    const discovery = discoverWindowsInstalls(root);
    assert.equal(discovery.selected?.version, "0.10.0");
    assert.equal(discovery.candidates.find((c) => c.version === "99.0.0")?.valid, false);
  } finally {
    cleanup(root);
  }
});

test("Windows discovery accepts Squirrel root overrides", () => {
  const root = tempDir();
  try {
    writeWindowsApp(root, "app-1.2.0");
    assert.equal(discoverWindowsInstalls(root).selected?.appRoot, join(root, "app-1.2.0"));
  } finally {
    cleanup(root);
  }
});

test("Windows watcher uses a wrapper script for metacharacter-heavy paths", () => {
  const root = tempDir();
  const execPath = "C:\\Program Files\\node&js\\node%.exe";
  const cliPath = "C:\\Users\\Me (Work)\\codex^plusplus!\\cli.js";
  const wrapper = join(root, "repair & run.cmd");

  assert.equal(windowsCommandArg(execPath), `"${execPath}"`);
  assert.equal(buildWindowsRepairCommand(execPath, cliPath, wrapper), `"${wrapper}"`);
  const body = readFileSync(wrapper, "utf8");
  assert.match(body, /repair --quiet/);
  assert.match(body, /node%%\.exe/);
  assert.match(body, /codex\^plusplus!/);
  cleanup(root);
});

test("Windows process status and running guard are injectable", () => {
  const running = getWindowsCodexProcessStatus((() => `"Codex.exe","1234","Console"`) as never);
  assert.equal(running.running, true);
  const stopped = getWindowsCodexProcessStatus((() => "INFO: No tasks are running") as never);
  assert.equal(stopped.running, false);
  assert.throws(
    () => assertWindowsCodexNotRunning("win32", () => ({ running: true, detail: "Codex.exe is running" })),
    /Quit Codex/,
  );
  assert.doesNotThrow(() => assertWindowsCodexNotRunning("linux"));
});

test("Windows scheduled task status is injectable", () => {
  const status = getWindowsScheduledTaskStatus((() => "") as never);
  assert.equal(status.installed, true);
  assert.equal(status.dailyInstalled, true);
});

test("preflightProbePath selects platform-specific writable targets", () => {
  assert.equal(
    preflightProbePath({
      appRoot: "/Applications/Codex.app",
      resourcesDir: "/Applications/Codex.app/Contents/Resources",
      platform: "darwin",
    }),
    join("/Applications/Codex.app", "Contents", ".codexpp-write-probe"),
  );
  assert.equal(
    preflightProbePath({
      appRoot: "C:\\Users\\me\\AppData\\Local\\codex\\app-1",
      resourcesDir: "C:\\Users\\me\\AppData\\Local\\codex\\app-1\\resources",
      platform: "win32",
    }),
    "C:\\Users\\me\\AppData\\Local\\codex\\app-1\\resources\\.codexpp-write-probe",
  );
});

test("openCommandForPath chooses platform opener without launching UI", () => {
  assert.deepEqual(openCommandForPath("/tmp/tweaks", "darwin"), {
    command: "open",
    args: ["/tmp/tweaks"],
  });
  assert.deepEqual(openCommandForPath("C:\\Tweaks", "win32"), {
    command: "explorer.exe",
    args: ["C:\\Tweaks"],
  });
  assert.deepEqual(openCommandForPath("/tmp/tweaks", "linux"), {
    command: "xdg-open",
    args: ["/tmp/tweaks"],
  });
});

test("listLocalTweaks reports valid, missing, invalid, and incompatible tweaks", () => {
  const root = tempDir();
  try {
    writeTweak(root, "valid", {}, { "index.js": "" });
    mkdirSync(join(root, "missing-manifest"));
    mkdirSync(join(root, "bad-json"));
    writeFileSync(join(root, "bad-json", "manifest.json"), "{");
    writeTweak(root, "future", { minRuntime: "99.0.0" }, { "index.js": "" });

    const byId = new Map(listLocalTweaks(root).map((t) => [t.id, t.status]));
    const valid = listLocalTweaks(root).find((t) => t.id === "valid");

    assert.equal(byId.get("valid"), "ok");
    assert.equal(byId.get("missing-manifest"), "missing-manifest");
    assert.equal(byId.get("bad-json"), "invalid");
    assert.equal(byId.get("future"), "incompatible");
    assert.deepEqual(valid?.capabilities.slice(0, 2), ["Renderer UI", "Main Process Access"]);
  } finally {
    cleanup(root);
  }
});

test("tweaks list supports JSON, grouped human output, and verbose trust details", async () => {
  const root = tempDir();
  const oldAppData = process.env.APPDATA;
  const oldXdg = process.env.XDG_DATA_HOME;
  try {
    process.env.APPDATA = root;
    process.env.XDG_DATA_HOME = root;
    const userRoot = join(root, "codex-plusplus");
    const tweaksRoot = join(userRoot, "tweaks");
    writeTweak(tweaksRoot, "valid", {}, { "index.js": "" });
    writeTweak(tweaksRoot, "future", { minRuntime: "99.0.0" }, { "index.js": "" });

    const json = await captureConsole(() => tweaksList({ json: true }));
    const parsed = JSON.parse(json);
    assert.equal(parsed.dir, tweaksRoot);
    assert.equal(parsed.tweaks.some((t: { id: string }) => t.id === "valid"), true);
    assert.match(parsed.capabilityDescriptions["Main Process Access"], /main process/);

    const human = await captureConsole(() => tweaksList({ verbose: true }));
    assert.match(human, /Needs Attention/);
    assert.match(human, /Ready/);
    assert.match(human, /Main Process Access: can run code/);
  } finally {
    process.env.APPDATA = oldAppData;
    process.env.XDG_DATA_HOME = oldXdg;
    cleanup(root);
  }
});

test("injectLoader patches fake app.asar and is idempotent", async () => {
  const root = tempDir();
  try {
    const appAsar = await makeAsar(root, {
      "package.json": JSON.stringify({ main: "dist/main.js" }),
      "dist/main.js": "console.log('codex')",
    });

    assert.equal(await injectLoader(appAsar, join(root, "user")), "dist/main.js");
    let pkg = JSON.parse(readFileInAsar(appAsar, "package.json").toString("utf8"));
    assert.equal(pkg.main, "codex-plusplus-loader.cjs");
    assert.equal(pkg.__codexpp.originalMain, "dist/main.js");
    assert.match(readFileInAsar(appAsar, "codex-plusplus-loader.cjs").toString("utf8"), /CODEX_PLUSPLUS/);

    assert.equal(await injectLoader(appAsar, join(root, "user")), "dist/main.js");
    pkg = JSON.parse(readFileInAsar(appAsar, "package.json").toString("utf8"));
    assert.equal(pkg.__codexpp.originalMain, "dist/main.js");
  } finally {
    cleanup(root);
  }
});

test("injectLoader fails clearly for corrupted asar/package layouts", async () => {
  const root = tempDir();
  try {
    const corrupt = join(root, "app.asar");
    writeFileSync(corrupt, "not an asar");
    await assert.rejects(() => injectLoader(corrupt, root));

    const noPackage = await makeAsar(root, { "index.js": "" }, "no-package.asar");
    await assert.rejects(() => injectLoader(noPackage, root), /no package\.json/);
  } finally {
    cleanup(root);
  }
});

test("restoreFromBackup restores asar, unpacked files, plist, and framework", async () => {
  const root = tempDir();
  try {
    const backup = join(root, "backup");
    const resources = join(root, "resources");
    mkdirSync(backup, { recursive: true });
    mkdirSync(resources, { recursive: true });

    await makeAsar(backup, { "package.json": JSON.stringify({ main: "original.js" }) });
    mkdirSync(join(backup, "app.asar.unpacked"), { recursive: true });
    writeFileSync(join(backup, "app.asar.unpacked", "native.node"), "native");
    writeFileSync(join(backup, "Info.plist"), "plist");
    writeFileSync(join(backup, "Electron Framework"), "framework");

    const codex = {
      asarPath: join(resources, "app.asar"),
      metaPath: join(root, "Info.plist"),
      electronBinary: join(root, "Electron Framework"),
    };
    writeFileSync(codex.asarPath, "patched");

    restoreFromBackup(codex, backup);

    assert.equal(readFileInAsar(codex.asarPath, "package.json").toString("utf8"), JSON.stringify({ main: "original.js" }));
    assert.equal(readFileSync(join(resources, "app.asar.unpacked", "native.node"), "utf8"), "native");
    assert.equal(readFileSync(codex.metaPath, "utf8"), "plist");
    assert.equal(readFileSync(codex.electronBinary, "utf8"), "framework");
  } finally {
    cleanup(root);
  }
});

test("collectStatus emits JSON-safe uninstalled snapshot", () => {
  const root = tempDir();
  try {
    const snapshot = collectStatus({
      root,
      runtime: join(root, "runtime"),
      tweaks: join(root, "tweaks"),
      backup: join(root, "backup"),
      configFile: join(root, "config.json"),
      stateFile: join(root, "state.json"),
      logDir: join(root, "log"),
    }, null);

    const parsed = JSON.parse(JSON.stringify(snapshot));
    assert.equal(parsed.installed, false);
    assert.equal(parsed.paths.root, root);
  } finally {
    cleanup(root);
  }
});

test("packaged runtime assets include required Phase 2 modules", () => {
  const assets = resolve("assets", "runtime");
  for (const file of requiredRuntimeAssetPaths(assets)) {
    assert.equal(existsSync(file), true, file);
  }
});

test("collectDoctorChecks emits JSON-safe diagnostics", () => {
  const snapshot = collectDoctorChecks();
  const parsed = JSON.parse(JSON.stringify(snapshot));
  assert.equal(typeof parsed.checkedAt, "string");
  assert.equal(Array.isArray(parsed.checks), true);
});

test("support bundle writes redacted diagnostics and bounded log tails", async () => {
  const root = tempDir();
  const oldAppData = process.env.APPDATA;
  const oldXdg = process.env.XDG_DATA_HOME;
  try {
    process.env.APPDATA = root;
    process.env.XDG_DATA_HOME = root;
    const supportOut = join(root, "out");
    const userRoot = process.platform === "win32"
      ? join(root, "codex-plusplus")
      : join(root, "codex-plusplus");
    mkdirSync(join(userRoot, "log"), { recursive: true });
    writeFileSync(join(userRoot, "config.json"), JSON.stringify({ token: "secret-value", safe: "ok" }));
    writeFileSync(join(userRoot, "log", "main.log"), `token=ghp_${"a".repeat(36)}\n${"x".repeat(250 * 1024)}`);

    await supportBundle({ out: supportOut });
    const [bundleName] = readdirSync(supportOut);
    const bundle = join(supportOut, bundleName);

    assert.equal(existsSync(join(bundle, "status.json")), true);
    assert.equal(existsSync(join(bundle, "doctor.json")), true);
    assert.match(readFileSync(join(bundle, "config.redacted.json"), "utf8"), /\[redacted\]/);
    const log = readFileSync(join(bundle, "logs", "main.log"), "utf8");
    assert.match(log, /truncated to last/);
    assert.doesNotMatch(log, /ghp_/);
  } finally {
    process.env.APPDATA = oldAppData;
    process.env.XDG_DATA_HOME = oldXdg;
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

function writeWindowsApp(root: string, name: string): void {
  const resources = join(root, name, "resources");
  mkdirSync(resources, { recursive: true });
  writeFileSync(join(resources, "app.asar"), "not a real asar");
  writeFileSync(join(root, name, "Codex.exe"), "");
  assert.equal(windowsCandidateFromPath(join(root, name)).valid, true);
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "codexpp-installer-"));
}

function cleanup(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

async function captureConsole(fn: () => void | Promise<void>): Promise<string> {
  const oldLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = oldLog;
  }
  return lines.join("\n");
}

async function makeAsar(
  root: string,
  files: Record<string, string>,
  name = "app.asar",
): Promise<string> {
  const src = join(root, `${name}-src`);
  mkdirSync(src, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const file = join(src, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  const out = join(root, name);
  await asar.createPackageWithOptions(src, out, { globOptions: { dot: true } });
  return out;
}
