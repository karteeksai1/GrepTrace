export interface SandboxCheckResult {
    allowed: boolean;
    resolvedPath?: string;
    relativePath?: string;
    error?: string;
}
export declare class CorpusSandbox {
    private corpusRoot;
    private maxOutputBytes;
    constructor(corpusRoot: string, maxOutputBytes?: number);
    getCorpusRoot(): string;
    getMaxOutputBytes(): number;
    isExcluded(relPath: string): boolean;
    checkPath(targetPath: string): Promise<SandboxCheckResult>;
    truncateOutput(text: string, omittedMessage?: string): {
        output: string;
        truncated: boolean;
    };
}
//# sourceMappingURL=sandbox.d.ts.map