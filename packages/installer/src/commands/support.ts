import kleur from "kleur";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { collectDoctorChecks } from "./doctor.js";
import { collectStatus } from "./status.js";
import { ensureUserPaths } from "../paths.js";
import { readState } from "../state.js";
import { windowsDiagnostics } from "../windows.js";

interface Opts {
  out?: string;
}

const LOG_TAIL_BYTES = 200 * 1024;
const REDACTED = "[redacted]";
const SENSITIVE_KEY_RE = /(token|secret|password|credential|api[-_]?key|access[-_]?key|private[-_]?key)/i;

export async function supportBundle(opts: Opts = {}): Promise<void> {
  const paths = ensureUserPaths();
  const parent = resolve(opts.out ?? join(paths.root, "support"));
  const dir = join(parent, `codex-plusplus-support-${timestampForPath()}`);
  mkdirSync(dir, { recursive: true });

  writeJson(join(dir, "status.json"), collectStatus(paths, readState(paths.stateFile)));
  writeJson(join(dir, "doctor.json"), collectDoctorChecks());
  const state = readState(paths.stateFile);
  const windows = windowsDiagnostics(state?.appRoot);
  if (windows) writeJson(join(dir, "windows.json"), windows);
  writeJson(join(dir, "paths.json"), {
    root: paths.root,
    runtime: paths.runtime,
    tweaks: paths.tweaks,
    logDir: paths.logDir,
  });

  if (existsSync(paths.stateFile)) {
    writeJson(join(dir, "state.redacted.json"), readJsonRedacted(paths.stateFile));
  }
  if (existsSync(paths.configFile)) {
    writeJson(join(dir, "config.redacted.json"), readJsonRedacted(paths.configFile));
  }
  copyLogTails(paths.logDir, join(dir, "logs"));

  console.log(kleur.green(`Created support bundle: ${dir}`));
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

function timestampForPath(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
