import { ToolResult } from './grep.js';
import { CorpusSandbox } from './sandbox.js';
export interface GlobParams {
    pattern?: string;
}
export declare function runGlob(sandbox: CorpusSandbox, params: GlobParams): Promise<ToolResult>;
//# sourceMappingURL=glob.d.ts.map