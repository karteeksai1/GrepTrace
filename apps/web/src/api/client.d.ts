import { BatchItem, BatchQuestionsResponse, BatchSummaryResponse, CorpusFileResponse, RunDetailResponse, RunEventsResponse } from '../types.js';
export declare function fetchBatches(page?: number, limit?: number): Promise<{
    batches: BatchItem[];
    total: number;
}>;
export declare function fetchBatchSummary(batchId: string): Promise<BatchSummaryResponse>;
export declare function fetchBatchQuestions(batchId: string): Promise<BatchQuestionsResponse>;
export declare function fetchRun(runId: string): Promise<RunDetailResponse>;
export declare function fetchRunEvents(runId: string): Promise<RunEventsResponse>;
export declare function fetchCorpusFile(corpus: string, path: string, start?: number, end?: number): Promise<CorpusFileResponse>;
//# sourceMappingURL=client.d.ts.map