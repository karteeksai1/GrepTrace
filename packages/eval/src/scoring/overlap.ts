import { GroundTruthLocation } from '@greptrace/core';

export function normalizeFilePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

export function rangesOverlap(a: GroundTruthLocation, b: GroundTruthLocation): boolean {
  if (normalizeFilePath(a.file) !== normalizeFilePath(b.file)) {
    return false;
  }
  return a.start_line <= b.end_line && a.end_line >= b.start_line;
}

export function isGroundTruthOverlapped(
  gt: GroundTruthLocation,
  systemRanges: GroundTruthLocation[]
): boolean {
  return systemRanges.some((sr) => rangesOverlap(gt, sr));
}

export interface RetrievalMetrics {
  retrieval_hit_any: boolean;
  retrieval_hit_all: boolean;
  retrieval_recall: number;
  citation_correct: boolean;
}

export function computeRetrievalMetrics(
  groundTruth: GroundTruthLocation[],
  retrievedOrReadRanges: GroundTruthLocation[],
  citedRanges: GroundTruthLocation[]
): RetrievalMetrics {
  if (groundTruth.length === 0) {
    return {
      retrieval_hit_any: false,
      retrieval_hit_all: false,
      retrieval_recall: 0,
      citation_correct: false
    };
  }

  let overlappedCount = 0;
  for (const gt of groundTruth) {
    if (isGroundTruthOverlapped(gt, retrievedOrReadRanges)) {
      overlappedCount++;
    }
  }

  const retrieval_hit_any = overlappedCount > 0;
  const retrieval_hit_all = overlappedCount === groundTruth.length;
  const retrieval_recall = Number((overlappedCount / groundTruth.length).toFixed(4));

  const citation_correct = groundTruth.some((gt) =>
    isGroundTruthOverlapped(gt, citedRanges)
  );

  return {
    retrieval_hit_any,
    retrieval_hit_all,
    retrieval_recall,
    citation_correct
  };
}
