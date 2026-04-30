export interface RuntimeHealthInput {
  version: string;
  userRoot: string;
  runtimeDir: string;
  tweaksDir: string;
  logDir: string;
  discoveredTweaks: number;
  loadedMainTweaks: number;
  loadedRendererTweaks?: number | null;
  startedAt: string;
  lastReload: RuntimeReloadStatus | null;
  recentErrors: RuntimeHealthEvent[];
}

export interface RuntimeReloadStatus {
  at: string;
  reason: string;
  ok: boolean;
  error?: string;
}

export interface RuntimeHealthEvent {
  at: string;
  level: "warn" | "error";
  message: string;
}

export interface RuntimeHealth {
  version: string;
  paths: {
    userRoot: string;
    runtimeDir: string;
    tweaksDir: string;
    logDir: string;
  };
  tweaks: {
    discovered: number;
    loadedMain: number;
    loadedRenderer: number | null;
  };
  startedAt: string;
  lastReload: RuntimeReloadStatus | null;
  recentErrors: RuntimeHealthEvent[];
}

export function createRuntimeHealth(input: RuntimeHealthInput): RuntimeHealth {
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
