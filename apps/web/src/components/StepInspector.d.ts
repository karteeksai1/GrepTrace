import React from 'react';
import { GraphNode } from '../utils/replay.js';
interface StepInspectorProps {
    node: GraphNode | null;
    onInspectFile?: (file: string, start?: number, end?: number) => void;
}
export declare const StepInspector: React.FC<StepInspectorProps>;
export {};
//# sourceMappingURL=StepInspector.d.ts.map