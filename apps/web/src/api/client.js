async function handleResponse(res) {
    if (!res.ok) {
        let errMessage = `HTTP ${res.status}: ${res.statusText}`;
        try {
            const body = await res.json();
            if (body.error) {
                errMessage = body.error;
            }
        }
        catch {
        }
        throw new Error(errMessage);
    }
    return res.json();
}
export async function fetchBatches(page = 1, limit = 50) {
    const res = await fetch(`/api/batches?page=${page}&limit=${limit}`);
    return handleResponse(res);
}
export async function fetchBatchSummary(batchId) {
    const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}/summary`);
    return handleResponse(res);
}
export async function fetchBatchQuestions(batchId) {
    const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}/questions`);
    return handleResponse(res);
}
export async function fetchRun(runId) {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
    return handleResponse(res);
}
export async function fetchRunEvents(runId) {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/events`);
    return handleResponse(res);
}
export async function fetchCorpusFile(corpus, path, start, end) {
    const params = new URLSearchParams({ path });
    if (start !== undefined)
        params.set('start', String(start));
    if (end !== undefined)
        params.set('end', String(end));
    const res = await fetch(`/api/corpora/${encodeURIComponent(corpus)}/file?${params.toString()}`);
    return handleResponse(res);
}
//# sourceMappingURL=client.js.map