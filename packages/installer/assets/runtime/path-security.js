"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInsidePath = isInsidePath;
exports.resolveInside = resolveInside;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
function isInsidePath(baseDir, candidate) {
    const rel = (0, node_path_1.relative)(baseDir, candidate);
    return rel === "" || (!!rel && !rel.startsWith("..") && !(0, node_path_1.isAbsolute)(rel));
}
function resolveInside(baseDir, inputPath, opts = {}) {
    if (typeof inputPath !== "string" || inputPath.trim() === "") {
        throw new Error("empty path");
    }
    const base = canonicalExistingPath((0, node_path_1.resolve)(baseDir));
    const raw = (0, node_path_1.resolve)(base, inputPath);
    if (!opts.allowBase && raw === base) {
        throw new Error("path must be inside base directory");
    }
    if (!isInsidePath(base, raw)) {
        throw new Error("path outside base directory");
    }
    if ((0, node_fs_1.existsSync)(raw)) {
        const canonical = canonicalExistingPath(raw);
        if (!isInsidePath(base, canonical)) {
            throw new Error("path outside base directory");
        }
        const stat = (0, node_fs_1.statSync)(canonical);
        if (opts.requireFile && !stat.isFile())
            throw new Error("path is not a file");
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
function canonicalExistingPath(path) {
    return node_fs_1.realpathSync.native(path);
}
function nearestExistingParent(path) {
    let current = path;
    while (!(0, node_fs_1.existsSync)(current)) {
        const next = (0, node_path_1.dirname)(current);
        if (next === current)
            return current;
        current = next;
    }
    return current;
}
//# sourceMappingURL=path-security.js.map