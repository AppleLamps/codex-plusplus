"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CODEX_PLUSPLUS_VERSION = void 0;
exports.normalizeVersion = normalizeVersion;
exports.compareVersions = compareVersions;
exports.minRuntimeError = minRuntimeError;
exports.CODEX_PLUSPLUS_VERSION = "0.1.0";
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
function normalizeVersion(v) {
    return v.trim().replace(/^v/i, "");
}
function compareVersions(a, b) {
    const av = VERSION_RE.exec(normalizeVersion(a));
    const bv = VERSION_RE.exec(normalizeVersion(b));
    if (!av || !bv)
        return null;
    for (let i = 1; i <= 3; i++) {
        const diff = Number(av[i]) - Number(bv[i]);
        if (diff !== 0)
            return diff;
    }
    return 0;
}
function minRuntimeError(minRuntime, currentVersion = exports.CODEX_PLUSPLUS_VERSION) {
    if (!minRuntime)
        return undefined;
    const comparison = compareVersions(currentVersion, minRuntime);
    if (comparison === null) {
        return `Invalid minRuntime "${minRuntime}"`;
    }
    if (comparison < 0) {
        return `Requires Codex++ ${normalizeVersion(minRuntime)} or newer`;
    }
    return undefined;
}
//# sourceMappingURL=version.js.map