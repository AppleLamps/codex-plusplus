import kleur from "kleur";
import { rmSync } from "node:fs";
import { locateCodex } from "../platform.js";
import { ensureUserPaths } from "../paths.js";
import { readState } from "../state.js";
import { adHocSign } from "../codesign.js";
import { uninstallWatcher } from "../watcher.js";
import { restoreFromBackup } from "../installer-core.js";
import { assertWindowsCodexNotRunning } from "../windows.js";

interface Opts {
  app?: string;
}

export async function uninstall(opts: Opts = {}): Promise<void> {
  const paths = ensureUserPaths();
  const state = readState(paths.stateFile);
  const codex = locateCodex(resolveUninstallAppRoot(opts.app, state?.appRoot));
  assertWindowsCodexNotRunning(codex.platform);

  restoreFromBackup(codex, paths.backup);
  console.log(kleur.green("Restored Codex.app from backup."));

  if (codex.platform === "darwin") {
    adHocSign(codex.appRoot);
    console.log(kleur.green("Re-signed restored bundle."));
  }

  uninstallWatcher();
  console.log(kleur.green("Removed watcher."));

  // Don't delete user tweaks/config — only installer state + runtime.
  rmSync(paths.runtime, { recursive: true, force: true });
  rmSync(paths.stateFile, { force: true });
  console.log(kleur.green("Cleaned up runtime + state."));
  console.log(
    kleur.dim(`Your tweaks remain at ${paths.tweaks} (delete manually if you want).`),
  );
}

export function resolveUninstallAppRoot(appOverride?: string, stateAppRoot?: string): string {
  const appRoot = appOverride ?? stateAppRoot;
  if (!appRoot) {
    throw new Error(
      "Cannot uninstall without installer state. Re-run with `--app <path-to-Codex-app>`.",
    );
  }
  return appRoot;
}
