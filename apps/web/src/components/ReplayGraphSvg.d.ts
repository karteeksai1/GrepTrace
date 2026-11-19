import React from 'react';
import { GraphEdge, GraphNode } from '../utils/replay.js';
interface ReplayGraphSvgProps {
    nodes: GraphNode[];
    edges: GraphEdge[];
    currentStep: number;
    selectedNodeId: string;
    onSelectNode: (nodeId: string, step: number) => void;
}
export declare const ReplayGraphSvg: React.FC<ReplayGraphSvgProps>;
export {};
//# sourceMappingURL=ReplayGraphSvg.d.ts.map