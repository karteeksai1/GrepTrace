import { describe, expect, it } from 'vitest';
import {
  computeFileHighlights,
  computeLineHighlight,
  parseRunAnswer
} from '../apps/web/src/utils/highlight.js';

describe('Overlap Highlight Logic', () => {
  const gtRanges = [{ start_line: 10, end_line: 25 }];
  const citRanges = [{ start_line: 20, end_line: 35 }];

  it('marks line in ground truth only as ground_truth', () => {
    expect(computeLineHighlight(15, gtRanges, citRanges)).toBe('ground_truth');
  });

  it('marks line in citation only as citation', () => {
    expect(computeLineHighlight(30, gtRanges, citRanges)).toBe('citation');
  });

  it('marks line in both as overlap', () => {
    expect(computeLineHighlight(22, gtRanges, citRanges)).toBe('overlap');
    expect(computeLineHighlight(20, gtRanges, citRanges)).toBe('overlap');
    expect(computeLineHighlight(25, gtRanges, citRanges)).toBe('overlap');
  });

  it('marks line outside both as none', () => {
    expect(computeLineHighlight(5, gtRanges, citRanges)).toBe('none');
    expect(computeLineHighlight(40, gtRanges, citRanges)).toBe('none');
  });

  it('computes highlight list for a file segment', () => {
    const list = computeFileHighlights(5, 18, gtRanges, citRanges);
    expect(list).toHaveLength(5);
    expect(list[0].lineNumber).toBe(18);
    expect(list[0].type).toBe('ground_truth');
    expect(list[1].lineNumber).toBe(19);
    expect(list[1].type).toBe('ground_truth');
    expect(list[2].lineNumber).toBe(20);
    expect(list[2].type).toBe('overlap');
  });

  it('parses valid JSON run answer correctly', () => {
    const raw = JSON.stringify({
      answer: 'test answer',
      citations: [{ file: 'lib/app.js', start_line: 1, end_line: 10 }]
    });
    const parsed = parseRunAnswer(raw);
    expect(parsed.answer).toBe('test answer');
    expect(parsed.citations).toHaveLength(1);
    expect(parsed.citations[0].file).toBe('lib/app.js');
  });

  it('handles non-JSON raw strings gracefully', () => {
    const parsed = parseRunAnswer('Plain text answer');
    expect(parsed.answer).toBe('Plain text answer');
    expect(parsed.citations).toEqual([]);
  });

  it('handles empty or undefined inputs', () => {
    expect(parseRunAnswer(undefined).answer).toBe('');
    expect(parseRunAnswer('').citations).toEqual([]);
  });
});
