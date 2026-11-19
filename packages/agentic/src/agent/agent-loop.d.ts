import { GroundTruthLocation, LLMClient, TraceLogger } from '@greptrace/core';
export interface AgentRunOptions {
    question: string;
    corpus: string;
    corpusRoot: string;
    questionId?: string;
    model?: string;
    maxSteps?: number;
    llmClient: LLMClient;
    logger: TraceLogger;
    maxOutputBytes?: number;
    batchId?: string | null;
    repetition?: number | null;
}
export interface AgentRunResult {
    runId: string;
    answer: string;
    citations: GroundTruthLocation[];
    readRanges: GroundTruthLocation[];
    stepCount: number;
    totalTokens: number;
    totalCostUsd: number;
    status: 'completed' | 'failed';
}
export declare function runAgentLoop(options: AgentRunOptions): Promise<AgentRunResult>;
//# sourceMappingURL=agent-loop.d.ts.map