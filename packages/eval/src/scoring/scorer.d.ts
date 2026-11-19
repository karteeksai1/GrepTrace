import pg from 'pg';
import { GroundTruthLocation, LLMClient, Question, Run, ScoreRecord } from '@greptrace/core';
export interface ParsedFinalPayload {
    answer: string;
    citations: GroundTruthLocation[];
    read_ranges?: GroundTruthLocation[];
    retrieved_chunks?: Array<{
        file: string;
        start_line: number;
        end_line: number;
    }>;
}
export declare function parseRunFinalAnswer(raw: string | null | undefined): ParsedFinalPayload;
export declare function extractSystemRanges(payload: ParsedFinalPayload): GroundTruthLocation[];
export declare function scoreRun(pool: pg.Pool, run: Run, question: Question, judgeClient: LLMClient, judgeModel: string, rejudge?: boolean): Promise<ScoreRecord>;
export declare function scoreBatch(pool: pg.Pool, batchName: string, rejudge: boolean, judgeClient: LLMClient, judgeModel: string, rootDir: string): Promise<{
    scored: number;
    total: number;
}>;
//# sourceMappingURL=scorer.d.ts.map