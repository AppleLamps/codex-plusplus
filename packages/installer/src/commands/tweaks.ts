import kleur from "kleur";
import { ensureUserPaths } from "../paths.js";
import { listLocalTweaks } from "../tweak-manifest.js";
import { openPath } from "../open-path.js";

export async function tweaksList(): Promise<void> {
  const paths = ensureUserPaths();
  const tweaks = listLocalTweaks(paths.tweaks);

  console.log(kleur.bold("codex-plusplus tweaks"));
  console.log(`  dir: ${paths.tweaks}`);
  console.log();

  if (tweaks.length === 0) {
    console.log(kleur.dim("No local tweaks found."));
    return;
  }

  for (const tweak of tweaks) {
    const mark =
      tweak.status === "ok" ? kleur.green("ok")
      : tweak.status === "incompatible" ? kleur.yellow("incompatible")
      : kleur.red(tweak.status);
    const version = tweak.version ? ` v${tweak.version}` : "";
    console.log(`${mark} ${tweak.id}${version}`);
    console.log(`  ${kleur.dim(tweak.detail)}`);
    if (tweak.capabilities.length > 0) {
      console.log(`  ${kleur.dim(`capabilities: ${tweak.capabilities.join(", ")}`)}`);
    }
  }
}

export async function tweaksOpen(): Promise<void> {
  const paths = ensureUserPaths();
  openPath(paths.tweaks);
  console.log(kleur.green(`Opened tweaks directory: ${paths.tweaks}`));
}
