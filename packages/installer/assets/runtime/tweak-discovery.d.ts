import type { TweakManifest } from "@codex-plusplus/sdk";
export interface DiscoveredTweak {
    dir: string;
    entry: string;
    manifest: TweakManifest;
    loadable: boolean;
    loadError?: string;
    capabilities: string[];
}
export declare function discoverTweaks(tweaksDir: string): DiscoveredTweak[];
