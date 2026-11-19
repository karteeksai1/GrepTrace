import { GroundTruthLocation } from '@greptrace/core';
export declare function normalizeFilePath(file: string): string;
export declare function rangesOverlap(a: GroundTruthLocation, b: GroundTruthLocation): boolean;
export declare function isGroundTruthOverlapped(gt: GroundTruthLocation, systemRanges: GroundTruthLocation[]): boolean;
export interface RetrievalMetrics {
    retrieval_hit_any: boolean;
    retrieval_hit_all: boolean;
    retrieval_recall: number;
    citation_correct: boolean;
}
export declare function computeRetrievalMetrics(groundTruth: GroundTruthLocation[], retrievedOrReadRanges: GroundTruthLocation[], citedRanges: GroundTruthLocation[]): RetrievalMetrics;
//# sourceMappingURL=overlap.d.ts.map