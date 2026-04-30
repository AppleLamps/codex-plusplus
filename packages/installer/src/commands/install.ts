import kleur from "kleur";
import { cpSync, existsSync, readFileSync, mkdirSync, openSync, closeSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locateCodex, type CodexInstall } from "../platform.js";
import { ensureUserPaths } from "../paths.js";
import { backupOnce, readHeaderHash } from "../asar.js";
import { setIntegrity, describeIntegritySupport } from "../integrity.js";
import { writeFuse } from "../fuses.js";
import { adHocSign, clearQuarantine } from "../codesign.js";
import { readPlist } from "../plist.js";
import { writeState } from "../state.js";
import { installWatcher, type WatcherKind } from "../watcher.js";
import { CODEX_PLUSPLUS_VERSION } from "../version.js";
import { installDefaultTweaks } from "../default-tweaks.js";
import { injectLoader } from "../installer-core.js";
import { assertWindowsCodexNotRunning, windowsMetadataForInstall } from "../windows.js";

interface Opts {
  app?: string;
  fuse?: boolean; // sade --no-fuse → fuse: false
  resign?: boolean;
  watcher?: boolean;
  watcherKind?: WatcherKind;
  quiet?: boolean;
  defaultTweaks?: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, "..", "..", "assets");

export async function install(opts: Opts = {}): Promise<void> {
  const fuseFlip = opts.fuse !== false;
  const resign = opts.resign !== false;
  const wantWatcher = opts.watcher !== false;
  const wantDefaultTweaks = opts.defaultTweaks !== false;

  const step = makeStepper(opts.quiet === true);
  const codex = locateCodex(opts.app);
  step(`Located Codex at ${kleur.cyan(codex.appRoot)}`);
  assertWindowsCodexNotRunning(codex.platform);

  // Pre-flight: try to create+remove a probe file inside the app bundle. This
  // surfaces macOS App Management TCC denials BEFORE we touch anything, and
  // also tickles the system into showing the permission prompt on first run.
  preflightWritable(codex);
  step("Bundle is writable");

  const codexVersion = readCodexVersion(codex.metaPath);
  if (codexVersion) step(`Codex version: ${kleur.cyan(codexVersion)}`);

  const paths = ensureUserPaths();
  step(`User dir: ${kleur.cyan(paths.root)}`);

  // 1. Backup originals.
  const backupAsar = join(paths.backup, "app.asar");
  const backupAsarUnpacked = join(paths.backup, "app.asar.unpacked");
  const backupPlist = codex.metaPath ? join(paths.backup, "Info.plist") : null;
  const backupFramework = join(paths.backup, "Electron Framework");
  backupOnce(codex.asarPath, backupAsar);
  if (existsSync(`${codex.asarPath}.unpacked`)) {
    backupOnce(`${codex.asarPath}.unpacked`, backupAsarUnpacked);
  }
  if (codex.metaPath && backupPlist) backupOnce(codex.metaPath, backupPlist);
  if (fuseFlip) backupOnce(codex.electronBinary, backupFramework);
  step("Backed up originals");

  const { headerHash: originalAsarHash } = readHeaderHash(codex.asarPath);

  // 2. Stage runtime + loader into the user dir.
  stageAssets(paths.runtime);
  step(`Staged runtime to ${kleur.cyan(paths.runtime)}`);

  // 3. Patch app.asar entry point to require our loader.
  const originalEntry = await injectLoader(codex.asarPath, paths.root);
  const { headerHash: patchedAsarHash } = readHeaderHash(codex.asarPath);
  step(`Patched app.asar (entry was ${kleur.dim(originalEntry)})`);

  // 4. Update Info.plist hash so Electron's integrity check passes.
  const integritySupport = describeIntegritySupport(codex.platform, !!codex.metaPath);
  if (codex.metaPath) {
    setIntegrity(codex, patchedAsarHash);
    step(`Updated ElectronAsarIntegrity → ${kleur.dim(patchedAsarHash.slice(0, 12))}…`);
  } else {
    step(`Skipped ElectronAsarIntegrity update: ${integritySupport.detail}`);
  }

  // 5. Belt-and-suspenders: flip the integrity validation fuse off.
  let fuseFlipped = false;
  if (fuseFlip) {
    try {
      const r = writeFuse(
        codex.electronBinary,
        "EnableEmbeddedAsarIntegrityValidation",
        "off",
      );
      step(`Fuse EnableEmbeddedAsarIntegrityValidation: ${r.from} → ${r.to}`);
      fuseFlipped = true;
    } catch (e) {
      console.warn(kleur.yellow(`Fuse flip failed: ${(e as Error).message}`));
    }
  }

  // 6. Re-sign on macOS.
  let resigned = false;
  if (resign && codex.platform === "darwin") {
    clearQuarantine(codex.appRoot);
    adHocSign(codex.appRoot);
    resigned = true;
    step("Re-signed ad-hoc");
  }

  // 7. Auto-repair watcher.
  let watcher: WatcherKind = opts.watcherKind ?? "none";
  if (wantWatcher) {
    try {
      watcher = installWatcher(codex.appRoot);
      step(`Installed watcher (${watcher})`);
    } catch (e) {
      console.warn(kleur.yellow(`Watcher install failed: ${(e as Error).message}`));
    }
  }

  // 8. Seed default tweaks from their release channels.
  if (wantDefaultTweaks) {
    await installDefaultTweaks(paths.tweaks, step);
  }

  // 9. Persist state.
  writeState(paths.stateFile, {
    version: CODEX_PLUSPLUS_VERSION,
    installedAt: new Date().toISOString(),
    appRoot: codex.appRoot,
    originalAsarHash,
    patchedAsarHash,
    codexVersion,
    fuseFlipped,
    resigned,
    originalEntryPoint: originalEntry,
    watcher,
    windows: windowsMetadataForInstall(codex, opts.app ? "explicit" : "squirrel"),
  });

  if (!opts.quiet) {
    console.log();
    console.log(kleur.green().bold("✓ codex-plusplus installed."));
    console.log(`  Tweaks dir: ${kleur.cyan(paths.tweaks)}`);
    console.log(`  Logs:       ${kleur.cyan(paths.logDir)}`);
    console.log(`  Launch Codex normally; the Tweaks tab will appear in Settings.`);
  }
}

function readCodexVersion(metaPath: string | null): string | null {
  if (!metaPath || !existsSync(metaPath)) return null;
  try {
    const pl = readPlist(metaPath);
    return (pl["CFBundleShortVersionString"] as string) ?? null;
  } catch {
    return null;
  }
}

export function stageAssets(runtimeDir: string): void {
  mkdirSync(runtimeDir, { recursive: true });
  const src = join(assetsDir, "runtime");
  if (existsSync(src)) {
    cpSync(src, runtimeDir, { recursive: true });
    return;
  }
  // Dev fallback: copy from the in-tree built runtime.
  const devSrc = resolve(here, "..", "..", "..", "..", "runtime", "dist");
  if (existsSync(devSrc)) {
    cpSync(devSrc, runtimeDir, { recursive: true });
    return;
  }
  throw new Error(
    `Runtime assets not found. Expected at ${src} (built package) or ${devSrc} (dev).\n` +
      `Run \`npm run build\` from the workspace root.`,
  );
}

function makeStepper(quiet = false) {
  let n = 1;
  return (msg: string) => {
    if (!quiet) console.log(`${kleur.dim(`[${n++}]`)} ${msg}`);
  };
}

/**
 * Touch a probe file inside the app bundle to surface (and trigger) macOS
 * App Management TCC denials before we begin destructive work.
 */
export function preflightProbePath(codex: Pick<CodexInstall, "appRoot" | "resourcesDir" | "platform">): string {
  if (codex.platform === "darwin") return join(codex.appRoot, "Contents", ".codexpp-write-probe");
  return join(codex.resourcesDir, ".codexpp-write-probe");
}

export function preflightWritable(codex: Pick<CodexInstall, "appRoot" | "resourcesDir" | "platform">): void {
  const probe = preflightProbePath(codex);
  try {
    const fd = openSync(probe, "w");
    closeSync(fd);
    unlinkSync(probe);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EPERM" || err.code === "EACCES") {
      const inApps = codex.platform === "darwin" && codex.appRoot.startsWith("/Applications/");
      const msg =
        `Cannot write to ${probe}.\n\n` +
        (inApps
          ? `macOS App Management is blocking modification of /Applications/Codex.app.\n` +
            `Fix:\n` +
            `  1. Open System Settings → Privacy & Security → App Management\n` +
            `  2. Enable the toggle for your terminal app (Terminal, iTerm2, etc.)\n` +
            `  3. Re-run this command.\n\n` +
            `(If macOS just showed a permission dialog, click Allow and re-run.)\n`
          : codex.platform === "win32"
            ? `Windows could not write to the Codex install.\n` +
              `Fix:\n` +
              `  1. Quit Codex completely from the tray/taskbar if it is running\n` +
              `  2. Re-run this command from PowerShell\n` +
              `  3. If Codex is installed in a protected directory, re-run PowerShell as Administrator\n`
            : `Check filesystem permissions on the Codex install.\n`) +
        `\nOriginal error: ${err.message}`;
      throw new Error(msg);
    }
    throw e;
  }
}
