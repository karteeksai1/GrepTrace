import React from 'react';
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
export declare const CodePanel: React.FC<CodePanelProps>;
export {};
//# sourceMappingURL=CodePanel.d.ts.map