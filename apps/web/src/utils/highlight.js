export function computeLineHighlight(lineNumber, groundTruthRanges, citedRanges) {
    const inGt = groundTruthRanges.some((r) => lineNumber >= r.start_line && lineNumber <= r.end_line);
    const inCit = citedRanges.some((r) => lineNumber >= r.start_line && lineNumber <= r.end_line);
    if (inGt && inCit)
        return 'overlap';
    if (inGt)
        return 'ground_truth';
    if (inCit)
        return 'citation';
    return 'none';
}
export function computeFileHighlights(totalLines, startLine, groundTruthRanges, citedRanges) {
    const result = [];
    for (let l = startLine; l < startLine + totalLines; l++) {
        const type = computeLineHighlight(l, groundTruthRanges, citedRanges);
        result.push({
            lineNumber: l,
            type,
            inGroundTruth: type === 'ground_truth' || type === 'overlap',
            inCitation: type === 'citation' || type === 'overlap'
        });
    }
    return result;
}
export function parseRunAnswer(raw) {
    if (!raw)
        return { answer: '', citations: [] };
    try {
        const parsed = JSON.parse(raw);
        return {
            answer: parsed.answer || '',
            citations: parsed.citations || [],
            read_ranges: parsed.read_ranges,
            retrieved_chunks: parsed.retrieved_chunks
        };
    }
    catch {
        return { answer: raw, citations: [] };
    }
}
//# sourceMappingURL=highlight.js.map