import kleur from "kleur";
import { existsSync, readFileSync } from "node:fs";
import { install, stageAssets } from "./install.js";
import { ensureUserPaths } from "../paths.js";
import { readState, writeState } from "../state.js";
import { locateCodexForState } from "../platform.js";
import { readHeaderHash } from "../asar.js";
import { CODEX_PLUSPLUS_VERSION, compareSemver } from "../version.js";
import { installWatcher } from "../watcher.js";
import { assertWindowsCodexNotRunning, windowsMetadataForInstall } from "../windows.js";

interface Opts {
  app?: string;
  quiet?: boolean;
  force?: boolean;
}

/**
 * `repair` is essentially `install` rerun, but it preserves the user's
 * config + tweaks (which `install` already does) and refreshes the watcher
 * unless the prior install explicitly had no watcher. We re-derive everything from the
 * current Codex.app on disk; the new asar/plist/framework hashes will
 * differ from those in `state.json` after a Sparkle update, so we just
 * overwrite state.
 */
export async function repair(opts: Opts = {}): Promise<void> {
  const paths = ensureUserPaths();
  const state = readState(paths.stateFile);
  if (!state) {
    if (!opts.quiet) {
      console.warn(
        kleur.yellow("No prior install state found. Running fresh install instead."),
      );
    }
  }

  if (state && !opts.force) {
    const codex = locateCodexForState(state.appRoot, opts.app);
    assertWindowsCodexNotRunning(codex.platform);
    const { headerHash } = readHeaderHash(codex.asarPath);
    const windows = windowsMetadataForInstall(codex, opts.app ? "explicit" : "squirrel");
    if (headerHash === state.patchedAsarHash) {
      const watcher = refreshWatcher(state.watcher, codex.appRoot, opts.quiet);
      if (compareSemver(CODEX_PLUSPLUS_VERSION, state.version) > 0) {
        if (!isAutoUpdateEnabled(paths.configFile)) {
          if (!opts.quiet) console.log(kleur.yellow("Codex++ auto-update is disabled."));
          return;
        }
        stageAssets(paths.runtime);
        writeState(paths.stateFile, {
          ...state,
          appRoot: codex.appRoot,
          watcher,
          version: CODEX_PLUSPLUS_VERSION,
          runtimeUpdatedAt: new Date().toISOString(),
          windows,
        });
        if (!opts.quiet) {
          console.log(
            kleur.green(`Updated Codex++ runtime ${state.version} → ${CODEX_PLUSPLUS_VERSION}.`),
          );
        }
        return;
      }
      writeState(paths.stateFile, { ...state, appRoot: codex.appRoot, watcher, windows });
      if (!opts.quiet) console.log(kleur.green("Patch already intact."));
      return;
    }
  }

  await install({
    app: opts.app,
    fuse: state?.fuseFlipped ?? true,
    resign: state?.resigned ?? true,
    watcher: state?.watcher === "none" ? false : true,
    watcherKind: state?.watcher,
    quiet: opts.quiet,
  });
  if (!opts.quiet) console.log(kleur.green("✓ Repair complete."));
}

function isAutoUpdateEnabled(configFile: string): boolean {
  if (!existsSync(configFile)) return true;
  try {
    const config = JSON.parse(readFileSync(configFile, "utf8")) as {
      codexPlusPlus?: { autoUpdate?: boolean };
    };
    return config.codexPlusPlus?.autoUpdate !== false;
  } catch {
    return true;
  }
}

function refreshWatcher(
  previous: NonNullable<ReturnType<typeof readState>>["watcher"],
  appRoot: string,
  quiet?: boolean,
): NonNullable<ReturnType<typeof readState>>["watcher"] {
  if (previous === "none") return previous;
  try {
    return installWatcher(appRoot);
  } catch (e) {
    if (!quiet) console.warn(kleur.yellow(`Watcher refresh failed: ${(e as Error).message}`));
    return previous;
  }
}
