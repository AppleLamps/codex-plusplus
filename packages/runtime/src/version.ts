export const CODEX_PLUSPLUS_VERSION = "0.1.0";

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/i, "");
}

export function compareVersions(a: string, b: string): number | null {
  const av = VERSION_RE.exec(normalizeVersion(a));
  const bv = VERSION_RE.exec(normalizeVersion(b));
  if (!av || !bv) return null;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(av[i]) - Number(bv[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function minRuntimeError(
  minRuntime: string | undefined,
  currentVersion = CODEX_PLUSPLUS_VERSION,
): string | undefined {
  if (!minRuntime) return undefined;
  const comparison = compareVersions(currentVersion, minRuntime);
  if (comparison === null) {
    return `Invalid minRuntime "${minRuntime}"`;
  }
  if (comparison < 0) {
    return `Requires Codex++ ${normalizeVersion(minRuntime)} or newer`;
  }
  return undefined;
}
