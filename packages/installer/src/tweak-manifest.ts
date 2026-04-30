import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { CODEX_PLUSPLUS_VERSION, compareSemver } from "./version.js";

export interface LocalTweakInfo {
  id: string;
  name: string;
  version: string;
  dir: string;
  manifestPath: string;
  status: "ok" | "invalid" | "missing-manifest" | "missing-entry" | "incompatible";
  detail: string;
  capabilities: string[];
}

export const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  "Renderer UI": "can add renderer-side UI and settings",
  "Main Process Access": "can run code in Codex's main process",
  "Local Data Storage": "can read and write its own Codex++ data",
  "Scoped IPC": "can communicate through Codex++ scoped IPC helpers",
  "Custom Entry": "uses a custom manifest entry file",
  "Runtime Requirement": "declares a minimum Codex++ runtime version",
};

interface ManifestLike {
  id?: unknown;
  name?: unknown;
  version?: unknown;
  githubRepo?: unknown;
  main?: unknown;
  minRuntime?: unknown;
  scope?: unknown;
}

const ENTRY_CANDIDATES = ["index.js", "index.cjs", "index.mjs"];
const SEMVER_RE = /^v?\d+\.\d+\.\d+(?:[-+].*)?$/;

export function listLocalTweaks(tweaksDir: string): LocalTweakInfo[] {
  if (!existsSync(tweaksDir)) return [];
  return readdirSync(tweaksDir)
    .map((name) => join(tweaksDir, name))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory();
      } catch {
        return false;
      }
    })
    .map(readLocalTweak)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function readLocalTweak(dir: string): LocalTweakInfo {
  const manifestPath = join(dir, "manifest.json");
  const fallback = basename(dir) || dir;
  if (!existsSync(manifestPath)) {
    return {
      id: fallback,
      name: fallback,
      version: "",
      dir,
      manifestPath,
      status: "missing-manifest",
      detail: "missing manifest.json",
      capabilities: [],
    };
  }

  let manifest: ManifestLike;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestLike;
  } catch (e) {
    return invalid(dir, manifestPath, fallback, `invalid JSON: ${(e as Error).message}`);
  }

  if (
    typeof manifest.id !== "string" ||
    typeof manifest.name !== "string" ||
    typeof manifest.version !== "string" ||
    typeof manifest.githubRepo !== "string"
  ) {
    return invalid(dir, manifestPath, fallback, "missing required manifest fields");
  }
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(manifest.githubRepo)) {
    return invalid(dir, manifestPath, manifest.id, "githubRepo must be owner/repo");
  }

  if (typeof manifest.minRuntime === "string") {
    if (!SEMVER_RE.test(manifest.minRuntime)) {
      return invalid(dir, manifestPath, manifest.id, "invalid minRuntime");
    }
    if (compareSemver(CODEX_PLUSPLUS_VERSION, manifest.minRuntime) < 0) {
      return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        dir,
        manifestPath,
        status: "incompatible",
        detail: `requires Codex++ ${manifest.minRuntime} or newer`,
        capabilities: manifestCapabilities(manifest),
      };
    }
  }

  const entry = typeof manifest.main === "string" ? manifest.main : null;
  if (!entryExists(dir, entry)) {
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      dir,
      manifestPath,
      status: "missing-entry",
      detail: entry ? `missing entry ${entry}` : "missing index.js/index.cjs/index.mjs",
      capabilities: manifestCapabilities(manifest),
    };
  }

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    dir,
    manifestPath,
    status: "ok",
    detail: "ready",
    capabilities: manifestCapabilities(manifest),
  };
}

function invalid(
  dir: string,
  manifestPath: string,
  fallback: string,
  detail: string,
): LocalTweakInfo {
  return {
    id: fallback,
    name: fallback,
    version: "",
    dir,
    manifestPath,
    status: "invalid",
    detail,
    capabilities: [],
  };
}

function manifestCapabilities(manifest: ManifestLike): string[] {
  const scope = manifest.scope === "renderer" || manifest.scope === "main" || manifest.scope === "both"
    ? manifest.scope
    : "both";
  const caps = ["Local Data Storage", "Scoped IPC"];
  if (scope === "main" || scope === "both") caps.unshift("Main Process Access");
  if (scope === "renderer" || scope === "both") caps.unshift("Renderer UI");
  if (typeof manifest.main === "string") caps.push("Custom Entry");
  if (typeof manifest.minRuntime === "string") caps.push("Runtime Requirement");
  return caps;
}

function entryExists(dir: string, entry: string | null): boolean {
  const candidates = entry ? [entry] : ENTRY_CANDIDATES;
  return candidates.some((candidate) => {
    try {
      return statSync(join(dir, candidate)).isFile();
    } catch {
      return false;
    }
  });
}
