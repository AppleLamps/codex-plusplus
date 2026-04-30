import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { discoverWindowsInstalls, windowsCandidateFromPath } from "./windows.js";

export type Platform = "darwin" | "win32" | "linux";

export interface CodexInstall {
  /** Path to Codex.app (mac), Codex install dir (win), or AppImage (linux). */
  appRoot: string;
  /** Resources/ dir inside the app. */
  resourcesDir: string;
  /** Path to app.asar. */
  asarPath: string;
  /** Path to Info.plist (mac) or equivalent metadata file. */
  metaPath: string | null;
  /** Path to the Electron Framework binary (for fuse flipping). */
  electronBinary: string;
  /** Original-name executable used when launching. */
  executable: string;
  platform: Platform;
}

const MAC_DEFAULT = "/Applications/Codex.app";

export function detectPlatform(): Platform {
  const p = platform();
  if (p === "darwin" || p === "win32" || p === "linux") return p;
  throw new Error(`Unsupported platform: ${p}`);
}

export function locateCodex(override?: string): CodexInstall {
  const plat = detectPlatform();
  if (plat === "darwin") return locateMac(override);
  if (plat === "win32") return locateWin(override);
  return locateLinux(override);
}

export function locateCodexForState(
  stateAppRoot?: string | null,
  explicitOverride?: string,
): CodexInstall {
  const plat = detectPlatform();
  if (explicitOverride) return locateCodex(explicitOverride);
  if (plat !== "win32") return locateCodex(stateAppRoot ?? undefined);
  try {
    return locateWin();
  } catch {
    if (stateAppRoot) return locateWin(stateAppRoot);
    throw new Error("Could not find Codex install. Pass --app to override.");
  }
}

function locateMac(override?: string): CodexInstall {
  const candidates = [
    override,
    MAC_DEFAULT,
    join(homedir(), "Applications", "Codex.app"),
  ].filter(Boolean) as string[];

  const appRoot = candidates.find((p) => existsSync(join(p, "Contents", "Info.plist")));
  if (!appRoot) {
    throw new Error(
      `Could not find Codex.app. Tried:\n  ${candidates.join("\n  ")}\n` +
        `Pass --app /path/to/Codex.app to override.`,
    );
  }
  const resourcesDir = join(appRoot, "Contents", "Resources");
  return {
    appRoot,
    resourcesDir,
    asarPath: join(resourcesDir, "app.asar"),
    metaPath: join(appRoot, "Contents", "Info.plist"),
    electronBinary: join(
      appRoot,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Versions",
      "A",
      "Electron Framework",
    ),
    executable: join(appRoot, "Contents", "MacOS", "Codex"),
    platform: "darwin",
  };
}

function locateWin(override?: string): CodexInstall {
  const candidates: string[] = [];
  if (override) {
    const explicit = windowsCandidateFromPath(override);
    if (explicit.valid) {
      candidates.push(explicit.appRoot);
    } else {
      const selected = discoverWindowsInstalls(override).selected;
      candidates.push(selected?.appRoot ?? explicit.appRoot);
    }
  } else {
    const selected = discoverWindowsInstalls().selected;
    if (selected) candidates.push(selected.appRoot);
    const local = process.env.LOCALAPPDATA;
    if (local) {
      const legacyRoot = join(local, "codex");
      if (existsSync(legacyRoot) && candidates.length === 0) {
        try {
          const entries = readdirSync(legacyRoot)
            .filter((d) => d.startsWith("app-"))
            .map((d) => join(legacyRoot, d))
            .filter((p) => statSync(p).isDirectory());
          candidates.push(...entries);
        } catch {}
      }
    }
  }
  const appRoot = candidates.find((p) => existsSync(join(p, "resources", "app.asar")));
  if (!appRoot) {
    throw new Error(
      `Could not find Codex install. Tried:\n  ${candidates.join("\n  ")}\n` +
        `Pass --app to override.`,
    );
  }
  const resourcesDir = join(appRoot, "resources");
  return {
    appRoot,
    resourcesDir,
    asarPath: join(resourcesDir, "app.asar"),
    metaPath: null,
    electronBinary: join(appRoot, "Codex.exe"),
    executable: join(appRoot, "Codex.exe"),
    platform: "win32",
  };
}

function locateLinux(override?: string): CodexInstall {
  // Codex isn't yet shipped on Linux at time of writing; assume an Electron-style
  // unpacked install or a deb/rpm in /opt.
  const candidates = [
    override,
    "/opt/Codex",
    "/opt/codex",
    join(homedir(), ".local", "share", "Codex"),
  ].filter(Boolean) as string[];
  const appRoot = candidates.find((p) => existsSync(join(p, "resources", "app.asar")));
  if (!appRoot) {
    throw new Error(
      `Could not find Codex install. Tried:\n  ${candidates.join("\n  ")}\n` +
        `Pass --app to override.`,
    );
  }
  const resourcesDir = join(appRoot, "resources");
  return {
    appRoot,
    resourcesDir,
    asarPath: join(resourcesDir, "app.asar"),
    metaPath: null,
    electronBinary: join(appRoot, "codex"),
    executable: join(appRoot, "codex"),
    platform: "linux",
  };
}
