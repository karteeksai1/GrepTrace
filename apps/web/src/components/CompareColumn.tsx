import React from 'react';
import { Link } from 'react-router-dom';
import { GroundTruthLocation, RunDetailResponse, RunEventsResponse } from '../types.js';
import { parseRunAnswer } from '../utils/highlight.js';
import { deriveRunTimingMetrics } from '../utils/metrics.js';

interface CompareColumnProps {
  title: string;
  badgeColor: string;
  runDetail?: RunDetailResponse | null;
  eventsData?: RunEventsResponse | null;
  isLoading: boolean;
  onSelectRange: (file: string, start: number, end: number) => void;
}

export const CompareColumn: React.FC<CompareColumnProps> = ({
  title,
  badgeColor,
  runDetail,
  eventsData,
  isLoading,
  onSelectRange
}) => {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-6 h-6 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-xs text-slate-500">Loading {title}...</span>
      </div>
    );
  }

  if (!runDetail || !runDetail.run) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Run Record</span>
        <span className="text-xs text-slate-500 mt-1">This system has not executed this question in this batch.</span>
      </div>
    );
  }

  const { run, score } = runDetail;
  const parsed = parseRunAnswer(run.final_answer);
  const events = eventsData?.events ?? [];

  const metrics = deriveRunTimingMetrics(events, run);
  const retrievalEvent = events.find((e) => e.type === 'retrieval');
  const dbTimeMs = retrievalEvent?.db_time_ms ?? 0;
  const totalRetrievalMs = retrievalEvent?.elapsed_ms ?? 0;
  const vectorTimeMs = Math.max(0, totalRetrievalMs - dbTimeMs);
  const displayMetric = (value: number | null | undefined, suffix = '') => value === null || value === undefined ? 'n/a' : `${value}${suffix}`;

  const getVerdictBadge = () => {
    if (run.status === 'failed') {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
          FAILED
        </span>
      );
    }
    if (!score) return null;
    const v = score.judge_verdict;
    if (v === 'correct') {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
          CORRECT ({score.answer_score.toFixed(1)})
        </span>
      );
    }
    if (v === 'partial') {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
          PARTIAL ({score.answer_score.toFixed(1)})
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
        INCORRECT ({score.answer_score.toFixed(1)})
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between overflow-hidden">
      <div>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${badgeColor}`} />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">{title}</h3>
          </div>
          <span className="text-xs font-mono text-slate-500 truncate max-w-[140px]">{run.model}</span>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
          {run.status === 'failed' && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
              <div className="font-bold">Run failed: {metrics.lastErrorClass ?? 'unknown error'}</div>
              <div className="mt-1 break-words">{metrics.failureReason ?? 'No failure reason recorded.'}</div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Steps</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">
                {displayMetric(metrics.stepCount)}
              </span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block">LLM Attempts</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">
                {displayMetric(metrics.llmAttempts)}
              </span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Tokens</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">
                {run.total_tokens ?? 0}
              </span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Cost</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">
                ${run.cost_usd ? run.cost_usd.toFixed(5) : '0.00000'}
              </span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Latency</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">
                {metrics.latencyMs === null ? 'n/a' : `${(metrics.latencyMs / 1000).toFixed(2)}s`}
              </span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Active</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">
                {metrics.activeLatencyMs === null ? 'n/a' : `${(metrics.activeLatencyMs / 1000).toFixed(2)}s`}
              </span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Rate-limit Wait</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">
                {metrics.rateLimitWaitMs === null ? 'n/a' : `${(metrics.rateLimitWaitMs / 1000).toFixed(2)}s`}
              </span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Tool Failures</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-sm">
                {displayMetric(metrics.toolCallFailureCount)}
              </span>
            </div>
          </div>

          {run.system === 'rag' && retrievalEvent && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/60 flex items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Vector Search:</span>{' '}
                <span className="text-orange-600 dark:text-orange-400 font-semibold">{vectorTimeMs}ms</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Database Fetch:</span>{' '}
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{dbTimeMs}ms</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Judge Verdict</span>
            {getVerdictBadge()}
          </div>
          {score?.judge_reason && (
            <p className="text-xs text-slate-600 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
              "{score.judge_reason}"
            </p>
          )}
        </div>

        <div className="p-4 space-y-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Final Answer</h4>
            <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 max-h-[300px] overflow-y-auto font-sans">
              {parsed.answer || run.final_answer || '(No answer provided)'}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Citations ({parsed.citations.length})
            </h4>
            {parsed.citations.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No citations cited by model.</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {parsed.citations.map((c: GroundTruthLocation, i: number) => (
                  <button
                    key={`${c.file}:${c.start_line}-${c.end_line}-${i}`}
                    onClick={() => onSelectRange(c.file, c.start_line, c.end_line)}
                    className="inline-flex items-center gap-1 font-mono text-xs px-2.5 py-1 rounded-md bg-orange-50 hover:bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:hover:bg-orange-900/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800 transition-colors"
                  >
                    <span>{c.file}:{c.start_line}-{c.end_line}</span>
                    <span className="text-[10px] text-orange-400">↗</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
        <Link
          to={`/runs/${encodeURIComponent(run.id)}`}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-orange-600 hover:bg-orange-700 text-white dark:bg-orange-500 dark:hover:bg-orange-600 shadow-sm transition-colors"
        >
          <span>View Full Replay</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
};
