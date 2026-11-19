import React from 'react';
import { RunningTotals } from '../utils/replay.js';
interface ReplayScrubberProps {
    currentStep: number;
    totalSteps: number;
    onStepChange: (step: number) => void;
    runningTotals: RunningTotals;
}
export declare const ReplayScrubber: React.FC<ReplayScrubberProps>;
export {};
//# sourceMappingURL=ReplayScrubber.d.ts.map