import { CorpusSandbox } from './sandbox.js';
export interface GrepParams {
    pattern: string;
    path_glob?: string;
    max_results?: number;
    context_lines?: number;
}
export interface ToolResult {
    output: string;
    filesTouched: string[];
    bytes: number;
}
export declare function runGrep(sandbox: CorpusSandbox, params: GrepParams): Promise<ToolResult>;
//# sourceMappingURL=grep.d.ts.map