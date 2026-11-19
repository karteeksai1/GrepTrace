import { GroundTruthLocation } from '../types.js';
export type LineHighlightType = 'none' | 'ground_truth' | 'citation' | 'overlap';
export interface LineHighlight {
    lineNumber: number;
    type: LineHighlightType;
    inGroundTruth: boolean;
    inCitation: boolean;
}
export declare function computeLineHighlight(lineNumber: number, groundTruthRanges: Array<{
    start_line: number;
    end_line: number;
}>, citedRanges: Array<{
    start_line: number;
    end_line: number;
}>): LineHighlightType;
export declare function computeFileHighlights(totalLines: number, startLine: number, groundTruthRanges: Array<{
    start_line: number;
    end_line: number;
}>, citedRanges: Array<{
    start_line: number;
    end_line: number;
}>): LineHighlight[];
export declare function parseRunAnswer(raw?: string): {
    answer: string;
    citations: GroundTruthLocation[];
    read_ranges?: GroundTruthLocation[];
    retrieved_chunks?: Array<{
        file: string;
        start_line: number;
        end_line: number;
    }>;
};
//# sourceMappingURL=highlight.d.ts.map