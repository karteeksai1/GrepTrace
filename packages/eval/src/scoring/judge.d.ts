import { GroundTruthLocation, LLMClient } from '@greptrace/core';
export type JudgeVerdict = 'correct' | 'partial' | 'incorrect';
export interface JudgeResult {
    verdict: JudgeVerdict;
    reason: string;
    score: number;
    tokens: number;
    costUsd: number;
}
export declare function getBlindJudgeSystemPrompt(): string;
export declare function formatBlindJudgeUserPrompt(question: string, referenceAnswer: string, candidateAnswer: string, citations: GroundTruthLocation[]): string;
export declare function getJudgeRepairPrompt(): string;
export declare function parseJudgeOutput(rawText: string): {
    ok: true;
    data: {
        verdict: JudgeVerdict;
        reason: string;
    };
} | {
    ok: false;
    error: string;
};
export declare function verdictToScore(verdict: JudgeVerdict): number;
export declare function judgeAnswer(llmClient: LLMClient, judgeModel: string, question: string, referenceAnswer: string, candidateAnswer: string, citations: GroundTruthLocation[]): Promise<JudgeResult>;
//# sourceMappingURL=judge.d.ts.map