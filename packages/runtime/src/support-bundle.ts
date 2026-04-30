import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { basename, join, resolve } from "node:path";
import type { RuntimeHealth } from "./health";

export interface RuntimeSupportBundleInput {
  userRoot: string;
  runtimeDir: string;
  tweaksDir: string;
  logDir: string;
  configFile: string;
  stateFile?: string;
  runtimeHealth: RuntimeHealth;
}

export interface RuntimeSupportBundleResult {
  dir: string;
}

const LOG_TAIL_BYTES = 200 * 1024;
const REDACTED = "[redacted]";
const SENSITIVE_KEY_RE = /(token|secret|password|credential|api[-_]?key|access[-_]?key|private[-_]?key)/i;

export function createRuntimeSupportBundle(
  input: RuntimeSupportBundleInput,
): RuntimeSupportBundleResult {
  const parent = resolve(input.userRoot, "support");
  const dir = join(parent, `codex-plusplus-support-${timestampForPath()}`);
  mkdirSync(dir, { recursive: true });

  writeJson(join(dir, "runtime-health.json"), input.runtimeHealth);
  writeJson(join(dir, "paths.json"), {
    root: input.userRoot,
    runtime: input.runtimeDir,
    tweaks: input.tweaksDir,
    logDir: input.logDir,
  });

  if (existsSync(input.configFile)) {
    writeJson(join(dir, "config.redacted.json"), readJsonRedacted(input.configFile));
  }
  if (input.stateFile && existsSync(input.stateFile)) {
    writeJson(join(dir, "state.redacted.json"), readJsonRedacted(input.stateFile));
  }
  const windows = runtimeWindowsDiagnostics(input.stateFile);
  if (windows) writeJson(join(dir, "windows.json"), windows);
  copyLogTails(input.logDir, join(dir, "logs"));

  return { dir };
}

export function diagnosticsJson(input: RuntimeSupportBundleInput): string {
  return JSON.stringify(redactValue({
    runtimeHealth: input.runtimeHealth,
    paths: {
      root: input.userRoot,
      runtime: input.runtimeDir,
      tweaks: input.tweaksDir,
      logDir: input.logDir,
    },
    config: existsSync(input.configFile) ? readJsonRedacted(input.configFile) : null,
    state: input.stateFile && existsSync(input.stateFile) ? readJsonRedacted(input.stateFile) : null,
    windows: runtimeWindowsDiagnostics(input.stateFile),
  }), null, 2);
}

function copyLogTails(logDir: string, outDir: string): void {
  if (!existsSync(logDir)) return;
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(logDir)) {
    const src = join(logDir, name);
    let stat;
    try {
      stat = statSync(src);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    writeFileSync(join(outDir, basename(name)), tailFile(src, LOG_TAIL_BYTES));
  }
}

function tailFile(path: string, maxBytes: number): string {
  const buf = readFileSync(path);
  const tail = buf.byteLength > maxBytes ? buf.subarray(buf.byteLength - maxBytes) : buf;
  const prefix = buf.byteLength > maxBytes
    ? `[truncated to last ${maxBytes} bytes]\n`
    : "";
  return prefix + redactText(tail.toString("utf8"));
}

function readJsonRedacted(path: string): unknown {
  try {
    return redactValue(JSON.parse(readFileSync(path, "utf8")));
  } catch (e) {
    return { error: `could not parse ${basename(path)}: ${(e as Error).message}` };
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(redactValue(value), null, 2));
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactText(value) : value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? REDACTED : redactValue(child);
  }
  return out;
}

function redactText(text: string): string {
  return text
    .replace(/(gh[pousr]_[A-Za-z0-9_]{20,})/g, REDACTED)
    .replace(/([^\s:@]{1,80}:[^\s@]{1,80})@/g, `${REDACTED}@`);
}

function runtimeWindowsDiagnostics(stateFile?: string): unknown | null {
  if (platform() !== "win32") return null;
  const state = stateFile && existsSync(stateFile) ? readJsonRedacted(stateFile) : null;
  return {
    platform: "win32",
    recordedAppRoot:
      state && typeof state === "object" && "appRoot" in state
        ? (state as { appRoot?: unknown }).appRoot
        : null,
    stateWindows:
      state && typeof state === "object" && "windows" in state
        ? (state as { windows?: unknown }).windows
        : null,
    runningCodex: runtimeCodexProcessStatus(),
  };
}

function runtimeCodexProcessStatus(): { running: boolean | null; detail: string } {
  try {
    const output = execFileSync(
      "tasklist.exe",
      ["/FI", "IMAGENAME eq Codex.exe", "/FO", "CSV", "/NH"],
      { encoding: "utf8", windowsHide: true },
    );
    const running = output
      .split(/\r?\n/)
      .some((line) => /^"Codex\.exe"/i.test(line.trim()));
    return { running, detail: running ? "Codex.exe is running" : "Codex.exe is not running" };
  } catch (e) {
    return { running: null, detail: `could not query tasklist: ${(e as Error).message}` };
  }
}

function timestampForPath(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
