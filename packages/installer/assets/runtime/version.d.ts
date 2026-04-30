export declare const CODEX_PLUSPLUS_VERSION = "0.1.0";
export declare function normalizeVersion(v: string): string;
export declare function compareVersions(a: string, b: string): number | null;
export declare function minRuntimeError(minRuntime: string | undefined, currentVersion?: string): string | undefined;
