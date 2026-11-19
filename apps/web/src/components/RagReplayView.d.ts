import React from 'react';
import { RunDetailResponse, RunEventsResponse } from '../types.js';
interface RagReplayViewProps {
    runDetail: RunDetailResponse;
    eventsData?: RunEventsResponse | null;
    onInspectChunk?: (file: string, start: number, end: number) => void;
}
export declare const RagReplayView: React.FC<RagReplayViewProps>;
export {};
//# sourceMappingURL=RagReplayView.d.ts.map