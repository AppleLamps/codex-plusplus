import { rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
for (const rel of [
  "packages/installer/dist",
  "packages/loader/dist",
  "packages/runtime/dist",
  "packages/sdk/dist",
  "packages/installer/assets/runtime",
]) {
  rmSync(join(root, rel), { recursive: true, force: true });
}
