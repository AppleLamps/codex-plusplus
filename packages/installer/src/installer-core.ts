import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchAsar, readHeaderHash } from "./asar.js";
import type { CodexInstall } from "./platform.js";

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, "..", "assets");

/**
 * Replace app.asar's package.json `main` with our loader, copying the
 * loader.cjs into the asar so it can resolve. Returns the original entry path.
 */
export async function injectLoader(asarPath: string, userRoot: string): Promise<string> {
  let originalMain = "";
  await patchAsar(asarPath, (dir) => {
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) {
      throw new Error("app.asar has no package.json - Codex layout changed?");
    }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      main?: unknown;
      __codexpp?: { originalMain?: unknown; userRoot?: unknown; loader?: unknown };
    };
    originalMain = String(pkg.main ?? "");
    if (!originalMain) throw new Error("app.asar package.json has no `main` field");

    if (pkg.__codexpp) {
      originalMain = String(pkg.__codexpp.originalMain);
    } else {
      pkg.__codexpp = {
        originalMain,
        userRoot,
        loader: "codex-plusplus-loader.cjs",
      };
      pkg.main = "codex-plusplus-loader.cjs";
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    }

    cpSync(resolveLoaderPath(), join(dir, "codex-plusplus-loader.cjs"));
  });
  return originalMain;
}

export function restoreFromBackup(
  codex: Pick<CodexInstall, "asarPath" | "metaPath" | "electronBinary">,
  backupDir: string,
): void {
  const backupAsar = join(backupDir, "app.asar");
  const backupAsarUnpacked = join(backupDir, "app.asar.unpacked");
  const backupPlist = codex.metaPath ? join(backupDir, "Info.plist") : null;
  const backupFramework = join(backupDir, "Electron Framework");

  if (!existsSync(backupAsar)) {
    throw new Error(`No backup found at ${backupAsar}. Cannot safely uninstall.`);
  }

  try {
    cpSync(backupAsar, codex.asarPath);
    readHeaderHash(codex.asarPath);
  } catch (e) {
    throw annotateRestoreError(e, codex.asarPath);
  }
  if (existsSync(backupAsarUnpacked)) {
    try {
      cpSync(backupAsarUnpacked, `${codex.asarPath}.unpacked`, { recursive: true });
    } catch (e) {
      throw annotateRestoreError(e, `${codex.asarPath}.unpacked`);
    }
  }
  if (codex.metaPath && backupPlist && existsSync(backupPlist)) {
    try {
      cpSync(backupPlist, codex.metaPath);
    } catch (e) {
      throw annotateRestoreError(e, codex.metaPath);
    }
  }
  if (existsSync(backupFramework)) {
    try {
      cpSync(backupFramework, codex.electronBinary);
    } catch (e) {
      throw annotateRestoreError(e, codex.electronBinary);
    }
  }
}

export function requiredRuntimeAssetPaths(runtimeAssetsDir = join(assetsDir, "runtime")): string[] {
  return [
    join(runtimeAssetsDir, "main.js"),
    join(runtimeAssetsDir, "preload.js"),
    join(runtimeAssetsDir, "path-security.js"),
    join(runtimeAssetsDir, "health.js"),
    join(runtimeAssetsDir, "main-ipc.js"),
    join(runtimeAssetsDir, "support-bundle.js"),
  ];
}

function resolveLoaderPath(): string {
  const loaderSrc = join(assetsDir, "loader.cjs");
  if (existsSync(loaderSrc)) return loaderSrc;

  for (const devLoader of [
    resolve(here, "..", "..", "loader", "loader.cjs"),
    resolve(here, "..", "..", "..", "loader", "loader.cjs"),
  ]) {
    if (existsSync(devLoader)) return devLoader;
  }

  throw new Error(`loader.cjs not found at ${loaderSrc} or development fallback paths`);
}

function annotateRestoreError(e: unknown, target: string): Error {
  const err = e as NodeJS.ErrnoException;
  if (err && (err.code === "EPERM" || err.code === "EACCES") && process.platform === "win32") {
    return new Error(
      `Permission denied restoring ${target}.\n\n` +
        `Quit Codex completely, then re-run uninstall from PowerShell. ` +
        `If Codex is installed in a protected directory, run PowerShell as Administrator.\n\n` +
        `Original error: ${err.message}`,
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}
