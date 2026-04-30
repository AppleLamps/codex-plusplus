export interface StoppableTweak {
  stop?: () => void | Promise<void>;
  disposers?: Array<() => void>;
  storage?: {
    flush(): void;
  };
}

export interface StopLogger {
  info?(message: string): void;
  warn?(message: string, error?: unknown): void;
}

export async function stopLoadedTweaks(
  loaded: Map<string, StoppableTweak>,
  logger: StopLogger = {},
): Promise<void> {
  for (const [id, tweak] of loaded) {
    try {
      await tweak.stop?.();
    } catch (e) {
      logger.warn?.(`stop failed for ${id}:`, e);
    }

    for (const dispose of tweak.disposers ?? []) {
      try {
        dispose();
      } catch (e) {
        logger.warn?.(`dispose failed for ${id}:`, e);
      }
    }
    if (tweak.disposers) tweak.disposers.length = 0;

    try {
      tweak.storage?.flush();
    } catch (e) {
      logger.warn?.(`storage flush failed for ${id}:`, e);
    }

    logger.info?.(`stopped tweak: ${id}`);
  }
  loaded.clear();
}
