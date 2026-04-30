import {
  existsSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";

export interface ResolveInsideOptions {
  allowBase?: boolean;
  mustExist?: boolean;
  requireFile?: boolean;
  requireDirectory?: boolean;
}

export function isInsidePath(baseDir: string, candidate: string): boolean {
  const rel = relative(baseDir, candidate);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveInside(
  baseDir: string,
  inputPath: string,
  opts: ResolveInsideOptions = {},
): string {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new Error("empty path");
  }

  const base = canonicalExistingPath(resolve(baseDir));
  const raw = resolve(base, inputPath);
  if (!opts.allowBase && raw === base) {
    throw new Error("path must be inside base directory");
  }
  if (!isInsidePath(base, raw)) {
    throw new Error("path outside base directory");
  }

  if (existsSync(raw)) {
    const canonical = canonicalExistingPath(raw);
    if (!isInsidePath(base, canonical)) {
      throw new Error("path outside base directory");
    }
    const stat = statSync(canonical);
    if (opts.requireFile && !stat.isFile()) throw new Error("path is not a file");
    if (opts.requireDirectory && !stat.isDirectory()) {
      throw new Error("path is not a directory");
    }
    return canonical;
  }

  if (opts.mustExist) {
    throw new Error("path does not exist");
  }

  const parent = nearestExistingParent(raw);
  const canonicalParent = canonicalExistingPath(parent);
  if (!isInsidePath(base, canonicalParent)) {
    throw new Error("path outside base directory");
  }
  return raw;
}

function canonicalExistingPath(path: string): string {
  return realpathSync.native(path);
}

function nearestExistingParent(path: string): string {
  let current = path;
  while (!existsSync(current)) {
    const next = dirname(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}
