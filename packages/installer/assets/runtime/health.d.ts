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
export declare function createRuntimeHealth(input: RuntimeHealthInput): RuntimeHealth;
