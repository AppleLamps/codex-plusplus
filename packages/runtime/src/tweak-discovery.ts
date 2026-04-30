/**
 * Discover tweaks under <userRoot>/tweaks. Each tweak is a directory with a
 * manifest.json and an entry script. Entry resolution is manifest.main first,
 * then index.js, index.mjs, and index.cjs.
 *
 * The manifest gate is intentionally strict. A tweak must identify its GitHub
 * repository so the manager can check releases without granting the tweak an
 * update/install channel. Update checks are advisory only.
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { TweakManifest } from "@codex-plusplus/sdk";
import { resolveInside } from "./path-security";
import { minRuntimeError } from "./version";

export interface DiscoveredTweak {
  dir: string;
  entry: string;
  manifest: TweakManifest;
  loadable: boolean;
  loadError?: string;
  capabilities: string[];
}

const ENTRY_CANDIDATES = ["index.js", "index.cjs", "index.mjs"];

export function discoverTweaks(tweaksDir: string): DiscoveredTweak[] {
  if (!existsSync(tweaksDir)) return [];
  const out: DiscoveredTweak[] = [];
  for (const name of readdirSync(tweaksDir)) {
    const dir = join(tweaksDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    let manifest: TweakManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as TweakManifest;
    } catch {
      continue;
    }
    if (!isValidManifest(manifest)) continue;
    const entry = resolveEntry(dir, manifest);
    if (!entry) continue;
    const loadError = minRuntimeError(manifest.minRuntime);
    out.push({
      dir,
      entry,
      manifest,
      loadable: !loadError,
      ...(loadError ? { loadError } : {}),
      capabilities: manifestCapabilities(manifest),
    });
  }
  return out;
}

function isValidManifest(m: TweakManifest): boolean {
  if (!m.id || !m.name || !m.version || !m.githubRepo) return false;
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(m.githubRepo)) return false;
  if (m.scope && !["renderer", "main", "both"].includes(m.scope)) return false;
  return true;
}

function resolveEntry(dir: string, m: TweakManifest): string | null {
  if (m.main) {
    try {
      return resolveInside(dir, m.main, { mustExist: true, requireFile: true });
    } catch {
      return null;
    }
  }
  for (const c of ENTRY_CANDIDATES) {
    try {
      return resolveInside(dir, c, { mustExist: true, requireFile: true });
    } catch {}
  }
  return null;
}

function manifestCapabilities(manifest: TweakManifest): string[] {
  const scope = manifest.scope ?? "both";
  const caps = ["isolated storage", "scoped IPC"];
  if (scope === "main" || scope === "both") caps.unshift("main process");
  if (scope === "renderer" || scope === "both") caps.unshift("renderer UI");
  if (manifest.main) caps.push("custom entry");
  if (manifest.minRuntime) caps.push("runtime gate");
  return caps;
}
