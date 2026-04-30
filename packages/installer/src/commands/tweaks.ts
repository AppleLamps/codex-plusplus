import kleur from "kleur";
import { ensureUserPaths } from "../paths.js";
import { CAPABILITY_DESCRIPTIONS, listLocalTweaks, type LocalTweakInfo } from "../tweak-manifest.js";
import { openPath } from "../open-path.js";

interface TweaksListOpts {
  json?: boolean;
  verbose?: boolean;
}

export async function tweaksList(opts: TweaksListOpts = {}): Promise<void> {
  const paths = ensureUserPaths();
  const tweaks = listLocalTweaks(paths.tweaks);

  if (opts.json) {
    console.log(JSON.stringify({
      dir: paths.tweaks,
      tweaks,
      capabilityDescriptions: CAPABILITY_DESCRIPTIONS,
    }, null, 2));
    return;
  }

  console.log(kleur.bold("codex-plusplus tweaks"));
  console.log(`  dir: ${paths.tweaks}`);
  console.log();

  if (tweaks.length === 0) {
    console.log(kleur.dim("No local tweaks found."));
    return;
  }

  for (const group of groupedTweaks(tweaks)) {
    if (group.tweaks.length === 0) continue;
    console.log(kleur.bold(group.title));
    for (const tweak of group.tweaks) {
      printTweak(tweak, opts.verbose === true);
    }
    console.log();
  }
}

function printTweak(tweak: LocalTweakInfo, verbose: boolean): void {
    const mark =
      tweak.status === "ok" ? kleur.green("ok")
      : tweak.status === "incompatible" ? kleur.yellow("incompatible")
      : kleur.red(tweak.status);
    const version = tweak.version ? ` v${tweak.version}` : "";
    console.log(`${mark} ${tweak.id}${version}`);
    console.log(`  ${kleur.dim(tweak.detail)}`);
    if (tweak.capabilities.length > 0) {
      console.log(`  ${kleur.dim(`capabilities: ${tweak.capabilities.join(", ")}`)}`);
      if (verbose) {
        for (const capability of tweak.capabilities) {
          console.log(`    ${kleur.dim(`${capability}: ${CAPABILITY_DESCRIPTIONS[capability] ?? "reported by the tweak manifest"}`)}`);
        }
      }
    }
}

function groupedTweaks(tweaks: LocalTweakInfo[]): Array<{ title: string; tweaks: LocalTweakInfo[] }> {
  return [
    { title: "Needs Attention", tweaks: tweaks.filter((t) => t.status !== "ok") },
    { title: "Ready", tweaks: tweaks.filter((t) => t.status === "ok") },
  ];
}

export async function tweaksOpen(): Promise<void> {
  const paths = ensureUserPaths();
  openPath(paths.tweaks);
  console.log(kleur.green(`Opened tweaks directory: ${paths.tweaks}`));
}
