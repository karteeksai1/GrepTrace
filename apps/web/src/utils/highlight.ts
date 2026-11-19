import { GroundTruthLocation } from '../types.js';

export type LineHighlightType = 'none' | 'ground_truth' | 'citation' | 'overlap';

export interface LineHighlight {
  lineNumber: number;
  type: LineHighlightType;
  inGroundTruth: boolean;
  inCitation: boolean;
}

export function computeLineHighlight(
  lineNumber: number,
  groundTruthRanges: Array<{ start_line: number; end_line: number }>,
  citedRanges: Array<{ start_line: number; end_line: number }>
): LineHighlightType {
  const inGt = groundTruthRanges.some(
    (r) => lineNumber >= r.start_line && lineNumber <= r.end_line
  );
  const inCit = citedRanges.some(
    (r) => lineNumber >= r.start_line && lineNumber <= r.end_line
  );

  if (inGt && inCit) return 'overlap';
  if (inGt) return 'ground_truth';
  if (inCit) return 'citation';
  return 'none';
}

export function computeFileHighlights(
  totalLines: number,
  startLine: number,
  groundTruthRanges: Array<{ start_line: number; end_line: number }>,
  citedRanges: Array<{ start_line: number; end_line: number }>
): LineHighlight[] {
  const result: LineHighlight[] = [];
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

export function parseRunAnswer(raw?: string): {
  answer: string;
  citations: GroundTruthLocation[];
  read_ranges?: GroundTruthLocation[];
  retrieved_chunks?: Array<{ file: string; start_line: number; end_line: number }>;
} {
  if (!raw) return { answer: '', citations: [] };
  try {
    const parsed = JSON.parse(raw);
    return {
      answer: parsed.answer || '',
      citations: parsed.citations || [],
      read_ranges: parsed.read_ranges,
      retrieved_chunks: parsed.retrieved_chunks
    };
  } catch {
    return { answer: raw, citations: [] };
  }
}
