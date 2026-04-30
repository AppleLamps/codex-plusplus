export interface ResolveInsideOptions {
    allowBase?: boolean;
    mustExist?: boolean;
    requireFile?: boolean;
    requireDirectory?: boolean;
}
export declare function isInsidePath(baseDir: string, candidate: string): boolean;
export declare function resolveInside(baseDir: string, inputPath: string, opts?: ResolveInsideOptions): string;
