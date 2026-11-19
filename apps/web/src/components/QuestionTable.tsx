import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuestionRow } from '../types.js';

interface QuestionTableProps {
  batchId: string;
  questions: QuestionRow[];
}

type OutcomeFilter = 'all' | 'both_correct' | 'agentic_only' | 'rag_only' | 'neither';

export const QuestionTable: React.FC<QuestionTableProps> = ({ batchId, questions }) => {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [corpusFilter, setCorpusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (corpusFilter !== 'all' && q.corpus !== corpusFilter) {
        return false;
      }
      if (typeFilter !== 'all' && q.question_type !== typeFilter) {
        return false;
      }
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesId = q.question_id.toLowerCase().includes(query);
        if (!matchesId) return false;
      }
      if (outcomeFilter === 'both_correct') {
        return q.agentic_score === 1 && q.rag_score === 1;
      }
      if (outcomeFilter === 'agentic_only') {
        return q.agentic_score === 1 && q.rag_score < 1;
      }
      if (outcomeFilter === 'rag_only') {
        return q.rag_score === 1 && q.agentic_score < 1;
      }
      if (outcomeFilter === 'neither') {
        return q.agentic_score < 1 && q.rag_score < 1;
      }
      return true;
    });
  }, [questions, corpusFilter, typeFilter, outcomeFilter, search]);

  const corpora = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => {
      if (q.corpus) set.add(q.corpus);
    });
    return Array.from(set);
  }, [questions]);

  const questionTypes = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => {
      if (q.question_type) set.add(q.question_type);
    });
    return Array.from(set);
  }, [questions]);

  const handleRowClick = (questionId: string) => {
    navigate(`/compare/${encodeURIComponent(questionId)}?batch=${encodeURIComponent(batchId)}`);
  };

  const getScoreBadge = (score: number) => {
    if (score === 1) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
          1.0
        </span>
      );
    }
    if (score === 0.5) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
          0.5
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
        0.0
      </span>
    );
  };

  const getHitBadge = (hitAll: boolean) => {
    return hitAll ? (
      <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" title="Retrieved all ground truth ranges">
        HitAll
      </span>
    ) : (
      <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="Missed some or all ground truth ranges">
        Miss
      </span>
    );
  };

  const getWinnerBadge = (winner: 'agentic' | 'rag' | 'tie') => {
    if (winner === 'agentic') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300">
          AGENTIC
        </span>
      );
    }
    if (winner === 'rag') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">
          RAG
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        TIE
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search questions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-60 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <select
            value={corpusFilter}
            onChange={(e) => setCorpusFilter(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Filter by corpus"
          >
            <option value="all">All Corpora</option>
            {corpora.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Filter by question type"
          >
            <option value="all">All Types</option>
            {questionTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value as OutcomeFilter)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Filter by outcome"
          >
            <option value="all">All Outcomes</option>
            <option value="both_correct">Both Correct</option>
            <option value="agentic_only">Only Agentic Correct</option>
            <option value="rag_only">Only RAG Correct</option>
            <option value="neither">Neither Correct</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Showing {filteredQuestions.length} of {questions.length} questions
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th scope="col" className="py-3 px-4">Question</th>
                <th scope="col" className="py-3 px-3">Type</th>
                <th scope="col" className="py-3 px-3">Agentic (Score / Hit)</th>
                <th scope="col" className="py-3 px-3">RAG (Score / Hit)</th>
                <th scope="col" className="py-3 px-3">Tokens (A / R)</th>
                <th scope="col" className="py-3 px-3">Cost (A / R)</th>
                <th scope="col" className="py-3 px-3">Latency (A / R)</th>
                <th scope="col" className="py-3 px-4">Winner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                    No questions match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredQuestions.map((q) => (
                  <tr
                    key={q.question_id}
                    onClick={() => handleRowClick(q.question_id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleRowClick(q.question_id);
                      }
                    }}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors focus:outline-none focus:bg-indigo-50/50 dark:focus:bg-indigo-950/30"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-indigo-600 dark:text-indigo-400">#</span>
                        <span>{q.question_id}</span>
                      </div>
                      {q.corpus && (
                        <span className="text-[11px] text-slate-400 font-sans block mt-0.5">
                          {q.corpus}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {q.question_type || 'default'}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        {getScoreBadge(q.agentic_score)}
                        {getHitBadge(q.agentic_hit_all)}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        {getScoreBadge(q.rag_score)}
                        {getHitBadge(q.rag_hit_all)}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                      <span className="text-slate-900 dark:text-slate-200">{q.agentic_tokens}</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span>{q.rag_tokens}</span>
                    </td>

                    <td className="py-3 px-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                      <span className="text-slate-900 dark:text-slate-200">
                        ${q.agentic_cost_usd?.toFixed(4) ?? '0.0000'}
                      </span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span>${q.rag_cost_usd?.toFixed(4) ?? '0.0000'}</span>
                    </td>

                    <td className="py-3 px-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                      <span className="text-slate-900 dark:text-slate-200">
                        {(q.agentic_latency_ms / 1000).toFixed(1)}s
                      </span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span>{(q.rag_latency_ms / 1000).toFixed(1)}s</span>
                    </td>

                    <td className="py-3 px-4">
                      {getWinnerBadge(q.winner)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
