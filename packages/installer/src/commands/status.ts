import kleur from "kleur";
import { ensureUserPaths } from "../paths.js";
import { readState } from "../state.js";
import { locateCodexForState } from "../platform.js";
import { readHeaderHash } from "../asar.js";
import { getIntegrity } from "../integrity.js";
import { describeIntegritySupport } from "../integrity.js";
import { readFuses, FuseV1 } from "../fuses.js";
import { existsSync } from "node:fs";
import type { UserPaths } from "../paths.js";
import type { InstallerState } from "../state.js";
import type { CodexInstall } from "../platform.js";
import { windowsDiagnostics, type WindowsDiagnostics } from "../windows.js";

interface Opts {
  json?: boolean;
}

export interface StatusSnapshot {
  paths: {
    root: string;
    tweaks: string;
    logDir: string;
  };
  installed: boolean;
  install: InstallerState | null;
  codex: {
    found: boolean;
    error?: string;
    appRoot?: string;
    platform?: string;
  };
  integrity: {
    supported: boolean;
    detail: string;
    currentAsarHash?: string;
    asarMatchesPatched?: boolean;
    plistHash?: string | null;
    plistMatchesAsar?: boolean;
    asarFuse?: string;
    fuseError?: string;
  } | null;
  windows: WindowsDiagnostics | null;
}

export async function status(opts: Opts = {}): Promise<void> {
  const paths = ensureUserPaths();
  const state = readState(paths.stateFile);
  const snapshot = collectStatus(paths, state);

  if (opts.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  console.log(kleur.bold("codex-plusplus status"));
  console.log(`  user dir:     ${paths.root}`);
  console.log(`  tweaks dir:   ${paths.tweaks}`);
  console.log(`  log dir:      ${paths.logDir}`);
  console.log();

  if (!snapshot.installed || !state) {
    console.log(kleur.yellow("Not installed. Run `codex-plusplus install`."));
    return;
  }

  console.log(kleur.bold("install"));
  console.log(`  installed:    ${state.installedAt}`);
  console.log(`  version:      ${state.version}`);
  console.log(`  app root:     ${state.appRoot}`);
  console.log(`  codex ver:    ${state.codexVersion ?? "(unknown)"}`);
  console.log(`  fuse flipped: ${state.fuseFlipped}`);
  console.log(`  resigned:     ${state.resigned}`);
  console.log(`  watcher:      ${state.watcher}`);
  if (state.windows) {
    console.log(`  win app ver:  ${state.windows.appVersion ?? "(unknown)"}`);
  }
  console.log();

  if (!snapshot.codex.found) {
    console.log(kleur.red(`Codex not found at recorded path: ${snapshot.codex.error}`));
    return;
  }

  console.log(kleur.bold("integrity"));
  const integrity = snapshot.integrity!;
  console.log(`  platform:     ${integrity.supported ? kleur.green("checked") : kleur.yellow("skipped")}`);
  console.log(`  detail:       ${integrity.detail}`);
  if (integrity.currentAsarHash) {
    console.log(
      `  current asar: ${integrity.currentAsarHash.slice(0, 16)}…  ${
        integrity.asarMatchesPatched ? kleur.green("(matches patched)") : kleur.red("(drift!)")
      }`,
    );
    if (integrity.supported) {
      console.log(
        `  plist hash:   ${integrity.plistHash?.slice(0, 16) ?? "(none)"}…  ${
          integrity.plistMatchesAsar ? kleur.green("OK") : kleur.red("mismatch")
        }`,
      );
    }
  }
  if (integrity.asarFuse) {
    console.log(`  asar fuse:    ${integrity.asarFuse}`);
  } else if (integrity.fuseError) {
    console.log(kleur.dim(`  fuses:        unreadable (${integrity.fuseError})`));
  }
  if (snapshot.windows) {
    console.log();
    console.log(kleur.bold("windows"));
    console.log(`  active app:   ${snapshot.windows.activeAppRoot ?? "(not found)"}`);
    console.log(`  stale state:  ${
      snapshot.windows.stateAppRootStale ? kleur.yellow("yes") : "no"
    }`);
    console.log(`  codex open:   ${snapshot.windows.runningCodex.detail}`);
    console.log(`  scheduler:    ${snapshot.windows.scheduledTasks.detail}`);
  }
}

export function collectStatus(
  paths: UserPaths,
  state: InstallerState | null,
): StatusSnapshot {
  const base: StatusSnapshot = {
    paths: {
      root: paths.root,
      tweaks: paths.tweaks,
      logDir: paths.logDir,
    },
    installed: !!state,
    install: state,
    codex: { found: false },
    integrity: null,
    windows: windowsDiagnostics(state?.appRoot),
  };
  if (!state) return base;

  let codex: CodexInstall;
  try {
    codex = locateCodexForState(state.appRoot);
  } catch (e) {
    return {
      ...base,
      codex: {
        found: false,
        error: (e as Error).message,
      },
    };
  }

  const support = describeIntegritySupport(codex.platform, !!codex.metaPath);
  const integrity: StatusSnapshot["integrity"] = {
    supported: support.supported,
    detail: support.detail,
  };
  if (existsSync(codex.asarPath)) {
    const { headerHash } = readHeaderHash(codex.asarPath);
    integrity.currentAsarHash = headerHash;
    integrity.asarMatchesPatched = headerHash === state.patchedAsarHash;
    if (support.supported && codex.metaPath) {
      const plistEntry = getIntegrity(codex);
      integrity.plistHash = plistEntry?.hash ?? null;
      integrity.plistMatchesAsar = plistEntry?.hash === headerHash;
    }
  }
  if (existsSync(codex.electronBinary)) {
    try {
      const fuses = readFuses(codex.electronBinary);
      integrity.asarFuse = String(fuses.fuses[FuseV1.EnableEmbeddedAsarIntegrityValidation]);
    } catch (e) {
      integrity.fuseError = (e as Error).message;
    }
  }

  return {
    ...base,
    codex: {
      found: true,
      appRoot: codex.appRoot,
      platform: codex.platform,
    },
    integrity,
  };
}
