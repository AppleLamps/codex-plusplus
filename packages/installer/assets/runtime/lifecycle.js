"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopLoadedTweaks = stopLoadedTweaks;
async function stopLoadedTweaks(loaded, logger = {}) {
    for (const [id, tweak] of loaded) {
        try {
            await tweak.stop?.();
        }
        catch (e) {
            logger.warn?.(`stop failed for ${id}:`, e);
        }
        for (const dispose of tweak.disposers ?? []) {
            try {
                dispose();
            }
            catch (e) {
                logger.warn?.(`dispose failed for ${id}:`, e);
            }
        }
        if (tweak.disposers)
            tweak.disposers.length = 0;
        try {
            tweak.storage?.flush();
        }
        catch (e) {
            logger.warn?.(`storage flush failed for ${id}:`, e);
        }
        logger.info?.(`stopped tweak: ${id}`);
    }
    loaded.clear();
}
//# sourceMappingURL=lifecycle.js.map