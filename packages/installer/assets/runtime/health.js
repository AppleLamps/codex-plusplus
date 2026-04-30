"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRuntimeHealth = createRuntimeHealth;
function createRuntimeHealth(input) {
    return {
        version: input.version,
        paths: {
            userRoot: input.userRoot,
            runtimeDir: input.runtimeDir,
            tweaksDir: input.tweaksDir,
            logDir: input.logDir,
        },
        tweaks: {
            discovered: input.discoveredTweaks,
            loadedMain: input.loadedMainTweaks,
            loadedRenderer: input.loadedRendererTweaks ?? null,
        },
        startedAt: input.startedAt,
        lastReload: input.lastReload,
        recentErrors: input.recentErrors.slice(-10),
    };
}
//# sourceMappingURL=health.js.map