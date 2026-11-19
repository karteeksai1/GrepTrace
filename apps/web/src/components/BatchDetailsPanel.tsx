import React from 'react';
import { BatchConfig } from '../types.js';

interface BatchDetailsPanelProps {
  batchName: string;
  createdAt: string;
  config?: BatchConfig;
  onClose: () => void;
}

export const BatchDetailsPanel: React.FC<BatchDetailsPanelProps> = ({
  batchName,
  createdAt,
  config,
  onClose
}) => {
  if (!config) return null;

  return (
    <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-100">{batchName}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Created: {new Date(createdAt).toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Systems:</span>{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {config.systems?.join(', ') || 'n/a'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Corpora:</span>{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {config.corpora?.join(', ') || 'n/a'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Models:</span>{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300 font-mono">
                {config.models?.join(', ') || 'n/a'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Repetitions:</span>{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {config.repetitions ?? 1}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Top-K:</span>{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{config.top_k ?? 8}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Max Steps:</span>{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {config.max_steps ?? 15}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 min-w-[280px]">
          <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
            <span>Pinned Commit Hashes</span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Close details panel"
            >
              ✕
            </button>
          </div>
          <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
            <div className="truncate">
              <span className="text-orange-600 dark:text-orange-400 font-semibold">benchmark:</span>{' '}
              {config.git_commit_benchmark ? config.git_commit_benchmark.slice(0, 10) : 'unknown'}
            </div>
            {config.git_commits_corpora &&
              Object.entries(config.git_commits_corpora).map(([corp, hash]) => (
                <div key={corp} className="truncate">
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{corp}:</span>{' '}
                  {hash.slice(0, 10)}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
