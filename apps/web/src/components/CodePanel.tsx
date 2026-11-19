import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCorpusFile } from '../api/client.js';
import { computeLineHighlight, LineHighlightType } from '../utils/highlight.js';
import { GroundTruthLocation } from '../types.js';

interface CodePanelProps {
  corpus: string;
  filePath: string;
  startLine: number;
  endLine: number;
  groundTruthRanges: GroundTruthLocation[];
  citedRanges: GroundTruthLocation[];
  onClose: () => void;
}

export const CodePanel: React.FC<CodePanelProps> = ({
  corpus,
  filePath,
  startLine,
  endLine,
  groundTruthRanges,
  citedRanges,
  onClose
}) => {
  const fetchStart = Math.max(1, startLine - 10);
  const fetchEnd = endLine + 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ['corpusFile', corpus, filePath, fetchStart, fetchEnd],
    queryFn: () => fetchCorpusFile(corpus, filePath, fetchStart, fetchEnd)
  });

  const matchingGt = groundTruthRanges.filter((gt) => gt.file === filePath);
  const matchingCit = citedRanges.filter((c) => c.file === filePath);

  const getLineClass = (type: LineHighlightType): string => {
    switch (type) {
      case 'overlap':
        return 'bg-emerald-500/20 dark:bg-emerald-500/30 border-l-4 border-emerald-500 text-emerald-950 dark:text-emerald-100 font-medium';
      case 'ground_truth':
        return 'bg-amber-500/15 dark:bg-amber-500/25 border-l-4 border-amber-500 text-amber-950 dark:text-amber-100';
      case 'citation':
        return 'bg-indigo-500/15 dark:bg-indigo-500/25 border-l-4 border-indigo-500 text-indigo-950 dark:text-indigo-100';
      default:
        return 'border-l-4 border-transparent text-slate-800 dark:text-slate-300';
    }
  };

  const getTagBadge = (type: LineHighlightType) => {
    switch (type) {
      case 'overlap':
        return (
          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-1.5 py-0.2 rounded">
            Overlap
          </span>
        );
      case 'ground_truth':
        return (
          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.2 rounded">
            Ground Truth
          </span>
        );
      case 'citation':
        return (
          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950/80 px-1.5 py-0.2 rounded">
            Cited
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-slate-900 text-slate-100 rounded-xl border border-slate-700 shadow-xl overflow-hidden my-6">
      <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700 gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-indigo-300">
            {corpus} / {filePath}:{startLine}-{endLine}
          </span>
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
              Ground Truth
            </span>
            <span className="inline-flex items-center gap-1.5 text-indigo-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
              Citation
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
              Overlap
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700 text-xs font-medium"
          aria-label="Close code panel"
        >
          Close [✕]
        </button>
      </div>

      <div className="p-4 font-mono text-xs overflow-x-auto max-h-[500px] overflow-y-auto bg-slate-950">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">Loading corpus file...</div>
        ) : error ? (
          <div className="py-6 text-center text-rose-400 font-sans">
            {(error as Error).message}
          </div>
        ) : (
          <div className="space-y-0.5">
            {data?.lines.map((lineText, idx) => {
              const currentLineNumber = (data.start_line || 1) + idx;
              const type = computeLineHighlight(currentLineNumber, matchingGt, matchingCit);

              return (
                <div
                  key={currentLineNumber}
                  className={`flex items-start px-2 py-0.5 rounded transition-colors ${getLineClass(type)}`}
                >
                  <span className="select-none text-slate-500 dark:text-slate-600 w-12 text-right pr-4 shrink-0">
                    {currentLineNumber}
                  </span>
                  <pre className="font-mono text-xs whitespace-pre overflow-x-visible flex-1">
                    {lineText || ' '}
                  </pre>
                  {getTagBadge(type)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
