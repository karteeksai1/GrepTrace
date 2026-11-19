import React, { useEffect, useState } from 'react';
export const ReplayScrubber = ({ currentStep, totalSteps, onStepChange, runningTotals }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    useEffect(() => {
        let interval = null;
        if (isPlaying) {
            const delayMs = Math.max(250, 1000 / speed);
            interval = setInterval(() => {
                onStepChange(currentStep >= totalSteps ? 0 : currentStep + 1);
            }, delayMs);
        }
        return () => {
            if (interval)
                clearInterval(interval);
        };
    }, [isPlaying, currentStep, totalSteps, speed, onStepChange]);
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                setIsPlaying((prev) => !prev);
            }
            else if (e.key === 'ArrowRight') {
                e.preventDefault();
                onStepChange(Math.min(totalSteps, currentStep + 1));
            }
            else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                onStepChange(Math.max(0, currentStep - 1));
            }
            else if (e.key === 'Home') {
                e.preventDefault();
                onStepChange(0);
            }
            else if (e.key === 'End') {
                e.preventDefault();
                onStepChange(totalSteps);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentStep, totalSteps, onStepChange]);
    return (<div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => onStepChange(0)} disabled={currentStep === 0} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40" title="Jump to Start (Home)" aria-label="Jump to Start">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 19 2 12 11 5 11 19"/>
              <polygon points="22 19 13 12 22 5 22 19"/>
            </svg>
          </button>

          <button onClick={() => onStepChange(Math.max(0, currentStep - 1))} disabled={currentStep === 0} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40" title="Step Back (Left Arrow)" aria-label="Step Back">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <button onClick={() => setIsPlaying(!isPlaying)} className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-colors" title="Play / Pause (Space)" aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? (<>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16"/>
                  <rect x="14" y="4" width="4" height="16"/>
                </svg>
                <span>Pause</span>
              </>) : (<>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <span>Play</span>
              </>)}
          </button>

          <button onClick={() => onStepChange(Math.min(totalSteps, currentStep + 1))} disabled={currentStep >= totalSteps} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40" title="Step Forward (Right Arrow)" aria-label="Step Forward">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>

          <button onClick={() => onStepChange(totalSteps)} disabled={currentStep >= totalSteps} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40" title="Jump to End (End)" aria-label="Jump to End">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 19 22 12 13 5 13 19"/>
              <polygon points="2 19 11 12 2 5 2 19"/>
            </svg>
          </button>

          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 pl-2 ml-1">
            {[0.5, 1, 2, 4].map((s) => (<button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1 text-[11px] font-bold rounded ${speed === s ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-800'}`}>
                {s}x
              </button>))}
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs font-mono">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Tokens:</span>{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{runningTotals.tokens}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Cost:</span>{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">${runningTotals.cost.toFixed(5)}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Time:</span>{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{(runningTotals.elapsedMs / 1000).toFixed(2)}s</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap min-w-[70px]">
          Step {currentStep} / {totalSteps}
        </span>
        <input type="range" min="0" max={totalSteps} value={currentStep} onChange={(e) => onStepChange(parseInt(e.target.value, 10))} className="w-full accent-indigo-600 dark:accent-indigo-500 cursor-pointer" aria-label="Replay scrub bar"/>
      </div>
    </div>);
};
//# sourceMappingURL=ReplayScrubber.js.map