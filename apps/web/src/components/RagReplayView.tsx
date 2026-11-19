import React from 'react';
import { GroundTruthLocation, RunDetailResponse, RunEventsResponse } from '../types.js';
import { parseRunAnswer } from '../utils/highlight.js';
import { deriveRunTimingMetrics } from '../utils/metrics.js';

interface RagReplayViewProps {
  runDetail: RunDetailResponse;
  eventsData?: RunEventsResponse | null;
  onInspectChunk?: (file: string, start: number, end: number) => void;
}

export const RagReplayView: React.FC<RagReplayViewProps> = ({
  runDetail,
  eventsData,
  onInspectChunk
}) => {
  const { run, question } = runDetail;
  const parsed = parseRunAnswer(run.final_answer);
  const events = eventsData?.events ?? [];

  const metrics = deriveRunTimingMetrics(events, run);
  const displayMs = (value: number | null) => value === null ? 'n/a' : `${value}ms`;

  const groundTruthList: GroundTruthLocation[] = question?.ground_truth ?? [];

  const chunks = parsed.retrieved_chunks || [];

  const checkChunkOverlapsGt = (file: string, start: number, end: number): boolean => {
    return groundTruthList.some(
      (gt) => gt.file === file && start <= gt.end_line && end >= gt.start_line
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
          Pipeline Latency Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 block">Total Latency</span>
            <span className="text-xl font-bold font-mono text-orange-600 dark:text-orange-400 mt-1 block">
              {displayMs(metrics.latencyMs)}
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 block">Embedding</span>
            <span className="text-xl font-bold font-mono text-orange-600 dark:text-orange-400 mt-1 block">
              {displayMs(metrics.embeddingMs)}
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 block">Pinecone Query</span>
            <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 block">
              {displayMs(metrics.pineconeQueryMs)}
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 block">Neon Fetch</span>
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1 block">
              {displayMs(metrics.neonFetchMs)}
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 block">Answer Generation</span>
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1 block">
              {displayMs(metrics.answerGenerationMs)}
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 block">Other</span>
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-1 block">
              {displayMs(metrics.otherLatencyMs)}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
            Ranked Retrieved Chunks ({chunks.length})
          </h3>
          <span className="text-xs text-slate-500 font-mono">Top-K = {chunks.length}</span>
        </div>

        {chunks.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No retrieved chunks recorded in run output.</p>
        ) : (
          <div className="space-y-3">
            {chunks.map((c, index) => {
              const overlaps = checkChunkOverlapsGt(c.file, c.start_line, c.end_line);

              return (
                <div
                  key={`${c.file}:${c.start_line}-${c.end_line}-${index}`}
                  className={`p-4 rounded-xl border text-sm transition-colors ${
                    overlaps
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-800 dark:text-slate-200">
                        #{index + 1}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {c.file}:{c.start_line}-{c.end_line}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {overlaps ? (
                        <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Ground Truth Overlap
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800">
                          Non-target Chunk
                        </span>
                      )}

                      {onInspectChunk && (
                        <button
                          onClick={() => onInspectChunk(c.file, c.start_line, c.end_line)}
                          className="px-2.5 py-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline"
                        >
                          View Lines ↗
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-3">
        <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Final Formulated Answer</h3>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          {parsed.answer || run.final_answer}
        </p>
      </div>
    </div>
  );
};
