import React, { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchBatchQuestions, fetchRun, fetchRunEvents } from '../api/client.js';
import { CompareColumn } from '../components/CompareColumn.js';
import { CodePanel } from '../components/CodePanel.js';
import { parseRunAnswer } from '../utils/highlight.js';
export const ComparePage = () => {
    const { questionId } = useParams();
    const [searchParams] = useSearchParams();
    const batchParam = searchParams.get('batch') || '';
    const [activeCodeSelection, setActiveCodeSelection] = useState(null);
    const { data: batchData, isLoading: isLoadingBatch } = useQuery({
        queryKey: ['batchQuestions', batchParam],
        queryFn: () => fetchBatchQuestions(batchParam),
        enabled: Boolean(batchParam)
    });
    const questionRow = batchData?.questions.find((q) => q.question_id === questionId);
    const { data: agenticRunDetail, isLoading: isLoadingAgentic } = useQuery({
        queryKey: ['run', questionRow?.agentic_run_id],
        queryFn: () => fetchRun(questionRow.agentic_run_id),
        enabled: Boolean(questionRow?.agentic_run_id)
    });
    const { data: agenticEvents } = useQuery({
        queryKey: ['runEvents', questionRow?.agentic_run_id],
        queryFn: () => fetchRunEvents(questionRow.agentic_run_id),
        enabled: Boolean(questionRow?.agentic_run_id)
    });
    const { data: ragRunDetail, isLoading: isLoadingRag } = useQuery({
        queryKey: ['run', questionRow?.rag_run_id],
        queryFn: () => fetchRun(questionRow.rag_run_id),
        enabled: Boolean(questionRow?.rag_run_id)
    });
    const { data: ragEvents } = useQuery({
        queryKey: ['runEvents', questionRow?.rag_run_id],
        queryFn: () => fetchRunEvents(questionRow.rag_run_id),
        enabled: Boolean(questionRow?.rag_run_id)
    });
    const question = agenticRunDetail?.question || ragRunDetail?.question;
    const corpus = questionRow?.corpus || question?.corpus || 'express';
    const groundTruthList = question?.ground_truth ?? [];
    const agenticCitations = parseRunAnswer(agenticRunDetail?.run?.final_answer).citations;
    const ragCitations = parseRunAnswer(ragRunDetail?.run?.final_answer).citations;
    const allCitedRanges = [...agenticCitations, ...ragCitations];
    const handleSelectRange = (file, start, end) => {
        setActiveCodeSelection({
            corpus,
            file,
            start,
            end
        });
    };
    if (isLoadingBatch) {
        return (<div className="max-w-7xl mx-auto px-4 py-16 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"/>
        <p className="text-sm text-slate-500">Loading comparison data...</p>
      </div>);
    }
    if (!questionRow) {
        return (<div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Question Not Found</h2>
        <p className="text-sm text-slate-500 mt-1">
          Question <code className="font-mono text-xs">{questionId}</code> could not be found in batch <code className="font-mono text-xs">{batchParam}</code>.
        </p>
        <Link to={`/?batch=${encodeURIComponent(batchParam)}`} className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          ← Return to Question List
        </Link>
      </div>);
    }
    return (<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <Link to={`/?batch=${encodeURIComponent(batchParam)}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mb-3">
          <span>←</span>
          <span>Back to Question List</span>
        </Link>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {questionRow.question_id}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-medium">
              Corpus: {corpus}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
              Type: {questionRow.question_type || question?.type || 'standard'}
            </span>
          </div>

          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
            {question?.question || questionRow.question_id}
          </h1>

          {question?.reference_answer && (<div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3.5 border border-slate-200 dark:border-slate-800 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Reference Answer:
              </span>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                {question.reference_answer}
              </p>
            </div>)}

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Ground Truth Locations ({groundTruthList.length})
            </span>
            {groundTruthList.length === 0 ? (<span className="text-xs text-slate-400 italic">No ground truth locations specified.</span>) : (<div className="flex flex-wrap gap-2">
                {groundTruthList.map((gt, i) => (<button key={`${gt.file}:${gt.start_line}-${gt.end_line}-${i}`} onClick={() => handleSelectRange(gt.file, gt.start_line, gt.end_line)} className="inline-flex items-center gap-1 font-mono text-xs px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition-colors">
                    <span>{gt.file}:{gt.start_line}-{gt.end_line}</span>
                    <span className="text-[10px] text-amber-500">↗ Inspect</span>
                  </button>))}
              </div>)}
          </div>
        </div>
      </div>

      {activeCodeSelection && (<CodePanel corpus={activeCodeSelection.corpus} filePath={activeCodeSelection.file} startLine={activeCodeSelection.start} endLine={activeCodeSelection.end} groundTruthRanges={groundTruthList} citedRanges={allCitedRanges} onClose={() => setActiveCodeSelection(null)}/>)}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <CompareColumn title="Agentic Search (Grep + Glob + Read)" badgeColor="bg-indigo-600 dark:bg-indigo-400" runDetail={agenticRunDetail} eventsData={agenticEvents} isLoading={isLoadingAgentic} onSelectRange={handleSelectRange}/>

        <CompareColumn title="Vector RAG (Pinecone + Multilingual-E5)" badgeColor="bg-emerald-600 dark:bg-emerald-400" runDetail={ragRunDetail} eventsData={ragEvents} isLoading={isLoadingRag} onSelectRange={handleSelectRange}/>
      </div>
    </div>);
};
//# sourceMappingURL=ComparePage.js.map