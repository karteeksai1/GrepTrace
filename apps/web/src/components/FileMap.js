import React from 'react';
export const FileMap = ({ files, onSelectFile }) => {
    if (files.length === 0) {
        return (<div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center text-slate-400 text-xs italic">
        No files touched yet in this trajectory.
      </div>);
    }
    return (<div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
          Repository File Map ({files.length} visited)
        </h3>
        <span className="text-xs text-slate-500">Ordered by first visit</span>
      </div>

      <div className="space-y-2">
        {files.map((fv, idx) => (<div key={fv.file} onClick={() => onSelectFile && onSelectFile(fv.file)} className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-mono transition-colors ${fv.isGroundTruth
                ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'} ${onSelectFile ? 'cursor-pointer hover:border-indigo-400' : ''}`}>
            <div className="flex items-center gap-2.5 truncate">
              <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
                {idx + 1}
              </span>
              <span className="truncate font-medium">{fv.file}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {fv.isGroundTruth && (<span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                  Target
                </span>)}
              <span className="text-[11px] text-slate-500">
                {fv.visitCount} {fv.visitCount === 1 ? 'visit' : 'visits'}
              </span>
            </div>
          </div>))}
      </div>
    </div>);
};
//# sourceMappingURL=FileMap.js.map