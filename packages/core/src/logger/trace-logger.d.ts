import pg from 'pg';
import { EventInput, EventRecord, Run, RunStatus, SystemType } from '../types.js';
export interface StartRunParams {
    id?: string;
    system: SystemType;
    corpus: string;
    question_id: string;
    model: string;
    batch_id?: string | null;
    repetition?: number | null;
}
export interface FinishRunParams {
    status: RunStatus;
    final_answer?: string | null;
    total_tokens?: number;
    cost_usd?: number;
}
export declare class TraceLogger {
    private runId;
    private pool;
    constructor(pool: pg.Pool, runId?: string);
    getRunId(): string;
    startRun(params: StartRunParams): Promise<string>;
    logEvent(input: Omit<EventInput, 'run_id'>): Promise<EventRecord>;
    finishRun(params: FinishRunParams): Promise<void>;
    getEvents(): Promise<EventRecord[]>;
    getRun(): Promise<Run | null>;
}
//# sourceMappingURL=trace-logger.d.ts.map