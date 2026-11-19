export function normalizeFilePath(file) {
    return file.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
export function rangesOverlap(a, b) {
    if (normalizeFilePath(a.file) !== normalizeFilePath(b.file)) {
        return false;
    }
    return a.start_line <= b.end_line && a.end_line >= b.start_line;
}
export function isGroundTruthOverlapped(gt, systemRanges) {
    return systemRanges.some((sr) => rangesOverlap(gt, sr));
}
export function computeRetrievalMetrics(groundTruth, retrievedOrReadRanges, citedRanges) {
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
    const citation_correct = groundTruth.some((gt) => isGroundTruthOverlapped(gt, citedRanges));
    return {
        retrieval_hit_any,
        retrieval_hit_all,
        retrieval_recall,
        citation_correct
    };
}
//# sourceMappingURL=overlap.js.map