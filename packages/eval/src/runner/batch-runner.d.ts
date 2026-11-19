import pg from 'pg';
import { BatchConfig, CorporaConfig, EnvConfig, Question, QuestionType, Run, ScoreRecord, SystemType } from '@greptrace/core';
export interface BenchOptions {
    systems: SystemType[];
    corpora: string[];
    model: string;
    limit?: number;
    types?: QuestionType[];
    repetitions: number;
    batchName?: string;
    topK?: number;
    maxSteps?: number;
    dryRun?: boolean;
}
export interface RunMatrixItem {
    system: SystemType;
    corpus: string;
    question: Question;
    repetition: number;
    model: string;
}
export interface ProgressState {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    runningCost: number;
    startTime: number;
}
export declare function getGitCommit(dir?: string): string;
export declare function loadCorporaConfig(rootDir: string): Promise<CorporaConfig>;
export declare function loadQuestions(corpus: string, rootDir: string, types?: QuestionType[], limit?: number): Promise<Question[]>;
export declare function buildRunMatrix(questionsByCorpus: Record<string, Question[]>, systems: SystemType[], model: string, repetitions: number): RunMatrixItem[];
export declare function ensureBatchRecord(pool: pg.Pool, batchName: string, config: BatchConfig): Promise<string>;
export declare function getCompletedRunKeys(pool: pg.Pool, batchId: string): Promise<Set<string>>;
export declare class Pacer {
    private lastRequestTime;
    private intervalMs;
    constructor(intervalMs: number);
    waitForSlot(): Promise<void>;
}
export declare function executeSingleBenchmarkItem(item: RunMatrixItem, batchId: string, pool: pg.Pool, env: EnvConfig, corporaConfig: CorporaConfig, rootDir: string, topK: number, maxSteps: number, pacer: Pacer): Promise<{
    run: Run;
    score: ScoreRecord;
}>;
export declare function runBenchmark(options: BenchOptions, pool: pg.Pool, env: EnvConfig, rootDir?: string): Promise<void>;
//# sourceMappingURL=batch-runner.d.ts.map