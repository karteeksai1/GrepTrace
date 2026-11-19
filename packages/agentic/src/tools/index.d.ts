import { ToolDefinition } from '@greptrace/core';
import { ReadToolResult } from './read.js';
import { CorpusSandbox } from './sandbox.js';
export * from './sandbox.js';
export * from './grep.js';
export * from './glob.js';
export * from './read.js';
export declare const AGENT_TOOLS: ToolDefinition[];
export declare function executeToolCall(sandbox: CorpusSandbox, toolName: string, args: Record<string, unknown>): Promise<ReadToolResult>;
//# sourceMappingURL=index.d.ts.map