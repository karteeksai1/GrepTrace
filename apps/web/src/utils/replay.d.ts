import { GroundTruthLocation, RunEvent } from '../types.js';
export interface GraphNode {
    id: string;
    step: number;
    type: 'question' | 'grep' | 'glob' | 'read' | 'model_turn' | 'final_answer';
    title: string;
    subtitle: string;
    details?: Record<string, unknown>;
    outputSummary?: string;
    isDeadEnd: boolean;
    touchesGroundTruth: boolean;
    isFirstHit: boolean;
    x: number;
    y: number;
}
export interface GraphEdge {
    from: string;
    to: string;
}
export interface FileVisit {
    file: string;
    firstStep: number;
    isGroundTruth: boolean;
    visitCount: number;
}
export interface RunningTotals {
    tokens: number;
    cost: number;
    elapsedMs: number;
}
export declare function isDeadEndEvent(event: RunEvent): boolean;
export declare function eventTouchesGroundTruth(event: RunEvent, groundTruthList: GroundTruthLocation[]): boolean;
export declare function buildGraphNodesAndEdges(events: RunEvent[], questionText: string, groundTruthList: GroundTruthLocation[], finalAnswerText?: string): {
    nodes: GraphNode[];
    edges: GraphEdge[];
};
export declare function buildFileMap(events: RunEvent[], groundTruthList: GroundTruthLocation[]): FileVisit[];
export declare function calculateRunningTotals(events: RunEvent[], upToStep: number, costPer1kTokens?: number): RunningTotals;
//# sourceMappingURL=replay.d.ts.map