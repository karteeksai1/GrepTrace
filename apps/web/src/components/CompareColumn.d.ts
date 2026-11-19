import React from 'react';
import { RunDetailResponse, RunEventsResponse } from '../types.js';
interface CompareColumnProps {
    title: string;
    badgeColor: string;
    runDetail?: RunDetailResponse | null;
    eventsData?: RunEventsResponse | null;
    isLoading: boolean;
    onSelectRange: (file: string, start: number, end: number) => void;
}
export declare const CompareColumn: React.FC<CompareColumnProps>;
export {};
//# sourceMappingURL=CompareColumn.d.ts.map