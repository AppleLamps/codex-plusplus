import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { platform as currentPlatform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { CodexInstall } from "./platform.js";

export interface WindowsInstallCandidate {
  appRoot: string;
  version: string | null;
  valid: boolean;
  reason?: string;
}

export interface WindowsInstallDiscovery {
  squirrelRoot: string | null;
  candidates: WindowsInstallCandidate[];
  selected: WindowsInstallCandidate | null;
}

export interface WindowsInstallMetadata {
  squirrelRoot: string | null;
  appVersion: string | null;
  appRootSource: "explicit" | "squirrel" | "state" | "unknown";
}

export interface WindowsProcessStatus {
  running: boolean | null;
  detail: string;
}

export interface WindowsScheduledTaskStatus {
  installed: boolean | null;
  dailyInstalled: boolean | null;
  detail: string;
}

export interface WindowsWritableProbe {
  ok: boolean | null;
  target: string;
  detail: string;
}

export interface WindowsDiagnostics {
  platform: "win32";
  discovery: WindowsInstallDiscovery;
  activeAppRoot: string | null;
  recordedAppRoot: string | null;
  stateAppRootStale: boolean | null;
  runningCodex: WindowsProcessStatus;
  scheduledTasks: WindowsScheduledTaskStatus;
  dependencies: {
    node: string | null;
    npm: string | null;
    git: string | null;
  };
  writableProbe: WindowsWritableProbe | null;
}

export function defaultWindowsSquirrelRoot(localAppData = process.env.LOCALAPPDATA): string | null {
  return localAppData ? join(localAppData, "codex") : null;
}

export function discoverWindowsInstalls(
  squirrelRoot = defaultWindowsSquirrelRoot(),
): WindowsInstallDiscovery {
  const discovery: WindowsInstallDiscovery = {
    squirrelRoot,
    candidates: [],
    selected: null,
  };
  if (!squirrelRoot || !existsSync(squirrelRoot)) return discovery;

  let names: string[];
  try {
    names = readdirSync(squirrelRoot).filter((name) => name.startsWith("app-"));
  } catch (e) {
    discovery.candidates.push({
      appRoot: squirrelRoot,
      version: null,
      valid: false,
      reason: (e as Error).message,
    });
    return discovery;
  }

  discovery.candidates = names
    .map((name) => windowsCandidateFromPath(join(squirrelRoot, name)))
    .sort(compareWindowsCandidates);
  discovery.selected = [...discovery.candidates].reverse().find((candidate) => candidate.valid) ?? null;
  return discovery;
}

export function windowsCandidateFromPath(appRoot: string): WindowsInstallCandidate {
  const version = parseSquirrelVersion(appRoot);
  try {
    if (!statSync(appRoot).isDirectory()) {
      return { appRoot, version, valid: false, reason: "not a directory" };
    }
  } catch (e) {
    return { appRoot, version, valid: false, reason: (e as Error).message };
  }
  if (!existsSync(join(appRoot, "resources", "app.asar"))) {
    return { appRoot, version, valid: false, reason: "missing resources/app.asar" };
  }
  return { appRoot, version, valid: true };
}

export function compareWindowsCandidates(
  a: WindowsInstallCandidate,
  b: WindowsInstallCandidate,
): number {
  const versionCompare = compareSquirrelVersions(a.version, b.version);
  if (versionCompare !== 0) return versionCompare;
  return a.appRoot.localeCompare(b.appRoot);
}

export function parseSquirrelVersion(appRoot: string): string | null {
  const name = basename(appRoot);
  return name.startsWith("app-") ? name.slice(4) || null : null;
}

export function compareSquirrelVersions(a: string | null, b: string | null): number {
  if (a && !b) return 1;
  if (!a && b) return -1;
  if (!a && !b) return 0;
  const pa = parseVersionParts(a!);
  const pb = parseVersionParts(b!);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return a!.localeCompare(b!);
}

export function windowsMetadataForInstall(
  codex: Pick<CodexInstall, "appRoot" | "platform">,
  source: WindowsInstallMetadata["appRootSource"],
): WindowsInstallMetadata | undefined {
  if (codex.platform !== "win32") return undefined;
  const version = parseSquirrelVersion(codex.appRoot);
  const parent = version ? dirname(codex.appRoot) : defaultWindowsSquirrelRoot();
  return {
    squirrelRoot: parent,
    appVersion: version,
    appRootSource: source,
  };
}

export function windowsDiagnostics(recordedAppRoot?: string | null): WindowsDiagnostics | null {
  if (currentPlatform() !== "win32") return null;
  const discovery = discoverWindowsInstalls();
  const activeAppRoot = discovery.selected?.appRoot ?? null;
  return {
    platform: "win32",
    discovery,
    activeAppRoot,
    recordedAppRoot: recordedAppRoot ?? null,
    stateAppRootStale:
      recordedAppRoot && activeAppRoot ? resolve(recordedAppRoot) !== resolve(activeAppRoot) : null,
    runningCodex: getWindowsCodexProcessStatus(),
    scheduledTasks: getWindowsScheduledTaskStatus(),
    dependencies: getWindowsDependencyVersions(),
    writableProbe: activeAppRoot ? probeWindowsWritable(join(activeAppRoot, "resources")) : null,
  };
}

export function getWindowsCodexProcessStatus(
  exec: typeof execFileSync = execFileSync,
): WindowsProcessStatus {
  try {
    const output = exec("tasklist.exe", ["/FI", "IMAGENAME eq Codex.exe", "/FO", "CSV", "/NH"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const running = output
      .split(/\r?\n/)
      .some((line) => /^"Codex\.exe"/i.test(line.trim()));
    return {
      running,
      detail: running ? "Codex.exe is running" : "Codex.exe is not running",
    };
  } catch (e) {
    return {
      running: null,
      detail: `could not query tasklist: ${(e as Error).message}`,
    };
  }
}

export function assertWindowsCodexNotRunning(
  platform = currentPlatform(),
  getStatus = getWindowsCodexProcessStatus,
): void {
  if (platform !== "win32") return;
  const status = getStatus();
  if (status.running === true) {
    throw new Error(
      "Codex.exe is running. Quit Codex completely, then re-run this command.",
    );
  }
  if (status.running === null) {
    console.warn(`Could not confirm whether Codex is running: ${status.detail}`);
  }
}

export function getWindowsScheduledTaskStatus(
  exec: typeof execFileSync = execFileSync,
): WindowsScheduledTaskStatus {
  const primary = queryTask("codex-plusplus-watcher", exec);
  const daily = queryTask("codex-plusplus-watcher-daily", exec);
  return {
    installed: primary.installed,
    dailyInstalled: daily.installed,
    detail: [primary.detail, daily.detail].join("; "),
  };
}

export function writeWindowsRepairWrapper(
  wrapperPath: string,
  execPath: string,
  cliPath: string,
): string {
  mkdirSync(dirname(wrapperPath), { recursive: true });
  const body = [
    "@echo off",
    "setlocal",
    `${batchFileQuote(execPath)} ${batchFileQuote(cliPath)} repair --quiet`,
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
  writeFileSync(wrapperPath, body);
  return wrapperPath;
}

export function buildWindowsTaskCommand(wrapperPath: string): string {
  return batchQuote(wrapperPath);
}

export function batchQuote(value: string): string {
  return `"${value.replace(/"/g, `""`)}"`;
}

function batchFileQuote(value: string): string {
  return `"${value.replace(/%/g, "%%").replace(/"/g, `""`)}"`;
}

export function probeWindowsWritable(dir: string): WindowsWritableProbe {
  const target = join(dir, ".codexpp-write-probe");
  try {
    const fd = openSync(target, "w");
    closeSync(fd);
    unlinkSync(target);
    return { ok: true, target, detail: "writable" };
  } catch (e) {
    return { ok: false, target, detail: (e as Error).message };
  }
}

export function canWritePath(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function parseVersionParts(version: string): number[] {
  const [core] = version.split("-", 1);
  return core.split(".").map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : -1;
  });
}

function queryTask(
  name: string,
  exec: typeof execFileSync,
): { installed: boolean | null; detail: string } {
  try {
    exec("schtasks.exe", ["/Query", "/TN", name], { stdio: "ignore", windowsHide: true });
    return { installed: true, detail: `${name}: installed` };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { status?: number };
    if (err.status === 1) return { installed: false, detail: `${name}: not installed` };
    return { installed: null, detail: `${name}: ${(e as Error).message}` };
  }
}

function getWindowsDependencyVersions(): WindowsDiagnostics["dependencies"] {
  return {
    node: commandVersion("node", ["-v"]),
    npm: commandVersion("npm", ["-v"]),
    git: commandVersion("git", ["--version"]),
  };
}

function commandVersion(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, { encoding: "utf8", windowsHide: true }).trim();
  } catch {
    return null;
  }
}
