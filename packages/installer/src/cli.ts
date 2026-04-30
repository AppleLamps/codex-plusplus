#!/usr/bin/env node
import sade from "sade";
import kleur from "kleur";
import { install } from "./commands/install.js";
import { uninstall } from "./commands/uninstall.js";
import { repair } from "./commands/repair.js";
import { status } from "./commands/status.js";
import { doctor } from "./commands/doctor.js";
import { supportBundle } from "./commands/support.js";
import { tweaksList, tweaksOpen } from "./commands/tweaks.js";
import { CODEX_PLUSPLUS_VERSION } from "./version.js";

function wrap<T extends (...args: never[]) => unknown | Promise<unknown>>(fn: T): T {
  return ((...args: Parameters<T>) => {
    Promise.resolve()
      .then(() => fn(...args))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("\n" + kleur.red().bold("✗ codex-plusplus failed"));
        console.error(msg);
        process.exit(1);
      });
  }) as unknown as T;
}

const prog = sade("codex-plusplus")
  .version(CODEX_PLUSPLUS_VERSION)
  .describe("Tweak system for the Codex desktop app");

prog
  .command("install")
  .describe("Patch Codex.app to load the tweak runtime")
  .option("--app", "Path to Codex.app / install dir (auto-detected if omitted)")
  .option("--no-fuse", "Skip Electron fuse flip (only patch asar+plist)")
  .option("--no-resign", "Skip ad-hoc code signing on macOS")
  .option("--no-watcher", "Skip installing the auto-repair watcher")
  .option("--no-default-tweaks", "Skip installing the default bundled tweak set")
  .action(wrap(install));

prog
  .command("uninstall")
  .describe("Restore Codex.app from backup and remove the watcher")
  .option("--app", "Path to Codex.app / install dir")
  .action(wrap(uninstall));

prog
  .command("repair")
  .describe("Re-apply the patch (use after a Sparkle auto-update)")
  .option("--app", "Path to Codex.app / install dir")
  .option("--quiet", "Suppress non-error output")
  .option("--force", "Re-apply even if the patch appears intact")
  .action(wrap(repair));

prog
  .command("status")
  .describe("Show patch status, paths, version")
  .option("--json", "Emit machine-readable JSON")
  .action(wrap(status));

prog
  .command("doctor")
  .describe("Diagnose common issues (signature, fuses, asar integrity, perms)")
  .option("--json", "Emit machine-readable JSON")
  .action(wrap(doctor));

prog
  .command("support bundle")
  .describe("Create a redacted support diagnostics directory")
  .option("--out", "Directory where the bundle directory should be created")
  .action(wrap(supportBundle));

prog
  .command("tweaks list")
  .describe("List local tweaks and manifest status")
  .action(wrap(tweaksList));

prog
  .command("tweaks open")
  .describe("Open the local tweaks directory")
  .action(wrap(tweaksOpen));

prog.parse(process.argv, {
  unknown: (flag) => {
    console.error(kleur.red(`Unknown flag: ${flag}`));
    process.exit(1);
  },
});
