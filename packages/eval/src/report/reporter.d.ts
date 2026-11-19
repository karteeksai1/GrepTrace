import pg from 'pg';
export interface RunDetailRow {
    run_id: string;
    system: string;
    corpus: string;
    question_id: string;
    question_type: string;
    model: string;
    status: string;
    total_tokens: number;
    cost_usd: number;
    repetition: number;
    latency_ms: number;
    step_count: number;
    db_time_ms: number;
    retrieval_hit_any: boolean;
    retrieval_hit_all: boolean;
    retrieval_recall: number;
    citation_correct: boolean;
    answer_score: number;
    judge_verdict: string;
    judge_reason: string;
    judge_tokens: number;
    judge_cost_usd: number;
    final_answer: string;
}
export declare function mean(arr: number[]): number;
export declare function median(arr: number[]): number;
export declare function p95(arr: number[]): number;
export declare function stdDev(arr: number[]): number;
export declare function escapeCsv(val: unknown): string;
export declare function fetchBatchRunRows(pool: pg.Pool, batchName: string, rootDir: string): Promise<RunDetailRow[]>;
export interface GroupSummary {
    system: string;
    corpus: string;
    question_type: string;
    total_runs: number;
    failures: number;
    hit_any_rate: number;
    hit_all_rate: number;
    mean_recall: number;
    citation_correct_rate: number;
    mean_score: number;
    score_std_dev: number;
    mean_tokens: number;
    median_tokens: number;
    mean_cost: number;
    mean_latency_ms: number;
    p95_latency_ms: number;
    mean_step_count: number;
    mean_db_time_ms: number;
}
export declare function aggregateRows(rows: RunDetailRow[]): GroupSummary[];
export declare function formatAggregateMarkdownTable(summaries: GroupSummary[]): string;
export interface HeadToHeadRow {
    question_id: string;
    corpus?: string;
    question_type?: string;
    agentic_run_id?: string;
    rag_run_id?: string;
    agentic_score: number;
    rag_score: number;
    agentic_hit_all: boolean;
    rag_hit_all: boolean;
    agentic_tokens: number;
    rag_tokens: number;
    agentic_cost_usd?: number;
    rag_cost_usd?: number;
    agentic_latency_ms: number;
    rag_latency_ms: number;
    winner: 'agentic' | 'rag' | 'tie';
}
export declare function buildHeadToHead(rows: RunDetailRow[]): HeadToHeadRow[];
export declare function formatHeadToHeadMarkdown(h2h: HeadToHeadRow[]): string;
export declare function generateFailuresMarkdown(rows: RunDetailRow[], rootDir: string): Promise<string>;
export declare function exportRunsCsv(rows: RunDetailRow[]): string;
export declare function formatAsciiTable(headers: string[], rows: string[][]): string;
export declare function generateAsciiSummary(summaries: GroupSummary[], h2h: HeadToHeadRow[]): string;
export declare function sampleRunsForJudging(pool: pg.Pool, batchName: string, n: number, rootDir: string): Promise<string>;
export interface AgreementReport {
    total: number;
    agreed: number;
    agreementRate: number;
    confusionMatrix: Record<string, Record<string, number>>;
}
export declare function computeJudgeAgreement(csvContent: string): AgreementReport;
//# sourceMappingURL=reporter.d.ts.map