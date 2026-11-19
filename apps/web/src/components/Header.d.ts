import React from 'react';
import { BatchItem } from '../types.js';
interface HeaderProps {
    batches: BatchItem[];
    selectedBatchId: string;
    onSelectBatch: (id: string) => void;
    onToggleConfig: () => void;
    showConfig: boolean;
}
export declare const Header: React.FC<HeaderProps>;
export {};
//# sourceMappingURL=Header.d.ts.map