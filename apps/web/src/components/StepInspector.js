import React from 'react';
export const StepInspector = ({ node, onInspectFile }) => {
    if (!node) {
        return (<div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center text-slate-500 text-sm">
        Select a step from the graph or scrub bar to inspect details.
      </div>);
    }
    return (<div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden text-sm">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 dark:text-slate-100">{node.title}</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            Step {node.step}
          </span>
        </div>
        {node.touchesGroundTruth && (<span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Ground Truth Hit
          </span>)}
      </div>

      <div className="p-4 space-y-4">
        {node.details && Object.keys(node.details).length > 0 && (<div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Arguments
            </h4>
            <pre className="font-mono text-xs bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 overflow-x-auto">
              {JSON.stringify(node.details, null, 2)}
            </pre>
          </div>)}

        {node.outputSummary && (<div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Output / Result
            </h4>
            <div className="font-mono text-xs bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 max-h-60 overflow-y-auto whitespace-pre-wrap">
              {node.outputSummary}
            </div>
          </div>)}

        {Boolean(node.type === 'read' && node.details?.file && onInspectFile) && (<div className="pt-2">
            <button onClick={() => {
                if (onInspectFile) {
                    onInspectFile(String(node.details?.file || node.details?.path), Number(node.details?.start_line || 1), Number(node.details?.end_line || 50));
                }
            }} className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold transition-colors">
              Inspect Source Lines in Code Panel ↗
            </button>
          </div>)}
      </div>
    </div>);
};
//# sourceMappingURL=StepInspector.js.map