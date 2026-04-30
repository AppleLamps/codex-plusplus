import type { RuntimeHealth } from "./health";
export interface RuntimeSupportBundleInput {
    userRoot: string;
    runtimeDir: string;
    tweaksDir: string;
    logDir: string;
    configFile: string;
    stateFile?: string;
    runtimeHealth: RuntimeHealth;
}
export interface RuntimeSupportBundleResult {
    dir: string;
}
export declare function createRuntimeSupportBundle(input: RuntimeSupportBundleInput): RuntimeSupportBundleResult;
export declare function diagnosticsJson(input: RuntimeSupportBundleInput): string;
