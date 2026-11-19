import {
  BatchItem,
  BatchQuestionsResponse,
  BatchSummaryResponse,
  CorpusFileResponse,
  RunDetailResponse,
  RunEventsResponse
} from '../types.js';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMessage = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) {
        errMessage = body.error;
      }
    } catch {
    }
    throw new Error(errMessage);
  }
  return res.json();
}

export async function fetchBatches(page = 1, limit = 50): Promise<{ batches: BatchItem[]; total: number }> {
  const res = await fetch(`/api/batches?page=${page}&limit=${limit}`);
  return handleResponse(res);
}

export async function fetchBatchSummary(batchId: string): Promise<BatchSummaryResponse> {
  const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}/summary`);
  return handleResponse(res);
}

export async function fetchBatchQuestions(batchId: string): Promise<BatchQuestionsResponse> {
  const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}/questions`);
  return handleResponse(res);
}

export async function fetchRun(runId: string): Promise<RunDetailResponse> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
  return handleResponse(res);
}

export async function fetchRunEvents(runId: string): Promise<RunEventsResponse> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/events`);
  return handleResponse(res);
}

export async function fetchCorpusFile(
  corpus: string,
  path: string,
  start?: number,
  end?: number
): Promise<CorpusFileResponse> {
  const params = new URLSearchParams({ path });
  if (start !== undefined) params.set('start', String(start));
  if (end !== undefined) params.set('end', String(end));
  const res = await fetch(`/api/corpora/${encodeURIComponent(corpus)}/file?${params.toString()}`);
  return handleResponse(res);
}
