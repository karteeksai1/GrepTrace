import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchBatchQuestions } from '../api/client.js';
import { QuestionTable } from '../components/QuestionTable.js';
import { BatchItem } from '../types.js';

interface HomePageProps {
  selectedBatch: BatchItem | null;
  isLoadingBatches: boolean;
  batchesError: Error | null;
}

export const HomePage: React.FC<HomePageProps> = ({
  selectedBatch,
  isLoadingBatches,
  batchesError
}) => {
  const batchId = selectedBatch?.id || '';

  const {
    data: questionsData,
    isLoading: isLoadingQuestions,
    error: questionsError,
    refetch
  } = useQuery({
    queryKey: ['batchQuestions', batchId],
    queryFn: () => fetchBatchQuestions(batchId),
    enabled: Boolean(batchId)
  });

  const questions = questionsData?.questions ?? [];

  const metrics = useMemo(() => {
    let agenticWins = 0;
    let ragWins = 0;
    let ties = 0;
    let bothCorrect = 0;

    for (const q of questions) {
      if (q.winner === 'agentic') agenticWins++;
      else if (q.winner === 'rag') ragWins++;
      else ties++;

      if (q.agentic_score === 1 && q.rag_score === 1) {
        bothCorrect++;
      }
    }

    return {
      total: questions.length,
      agenticWins,
      ragWins,
      ties,
      bothCorrect
    };
  }, [questions]);

  if (isLoadingBatches) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading benchmark batches...</p>
      </div>
    );
  }

  if (batchesError) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="inline-flex p-3 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Unable to Connect to API</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          {batchesError.message}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Make sure the backend API is running on port 3001.
        </p>
      </div>
    );
  }

  if (!selectedBatch) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">No Batches Found</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Run a benchmark first using <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">npm run bench</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Total Questions</span>
          <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">
            {metrics.total}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 block">Agentic Wins</span>
          <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1 block">
            {metrics.agenticWins}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 block">RAG Wins</span>
          <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
            {metrics.ragWins}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Ties</span>
          <span className="text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1 block">
            {metrics.ties}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 block">Both Correct</span>
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1 block">
            {metrics.bothCorrect}
          </span>
        </div>
      </div>

      {isLoadingQuestions ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading benchmark questions...</p>
        </div>
      ) : questionsError ? (
        <div className="p-6 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-center">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
            Failed to load questions: {(questionsError as Error).message}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-3 py-1.5 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <QuestionTable batchId={batchId} questions={questions} />
      )}
    </div>
  );
};
