import { ToolResult } from './grep.js';
import { CorpusSandbox } from './sandbox.js';
export interface ReadParams {
    file: string;
    start_line?: number;
    end_line?: number;
}
export interface ReadToolResult extends ToolResult {
    readRange?: {
        file: string;
        start_line: number;
        end_line: number;
    };
}
export declare function runRead(sandbox: CorpusSandbox, params: ReadParams): Promise<ReadToolResult>;
//# sourceMappingURL=read.d.ts.map