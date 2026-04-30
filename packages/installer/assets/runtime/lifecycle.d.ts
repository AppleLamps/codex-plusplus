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
export declare function stopLoadedTweaks(loaded: Map<string, StoppableTweak>, logger?: StopLogger): Promise<void>;
