import { describe, expect, it } from 'vitest';
import {
  computeRetrievalMetrics,
  normalizeFilePath,
  rangesOverlap
} from '../packages/eval/src/scoring/overlap.js';

describe('Eval Overlap Scoring', () => {
  it('normalizes corpus relative paths', () => {
    expect(normalizeFilePath('lib/express.js')).toBe('lib/express.js');
    expect(normalizeFilePath('./lib/express.js')).toBe('lib/express.js');
    expect(normalizeFilePath('lib\\express.js')).toBe('lib/express.js');
  });

  it('detects intersecting and touching line ranges correctly', () => {
    const f = 'lib/application.js';
    expect(rangesOverlap({ file: f, start_line: 10, end_line: 20 }, { file: f, start_line: 15, end_line: 25 })).toBe(true);
    expect(rangesOverlap({ file: f, start_line: 10, end_line: 20 }, { file: f, start_line: 20, end_line: 30 })).toBe(true);
    expect(rangesOverlap({ file: f, start_line: 10, end_line: 20 }, { file: f, start_line: 1, end_line: 10 })).toBe(true);
    expect(rangesOverlap({ file: f, start_line: 10, end_line: 20 }, { file: f, start_line: 12, end_line: 18 })).toBe(true);
    expect(rangesOverlap({ file: f, start_line: 12, end_line: 18 }, { file: f, start_line: 10, end_line: 20 })).toBe(true);
  });

  it('detects disjoint line ranges correctly', () => {
    const f = 'lib/application.js';
    expect(rangesOverlap({ file: f, start_line: 10, end_line: 20 }, { file: f, start_line: 21, end_line: 30 })).toBe(false);
    expect(rangesOverlap({ file: f, start_line: 10, end_line: 20 }, { file: f, start_line: 1, end_line: 9 })).toBe(false);
    expect(rangesOverlap({ file: 'lib/app.js', start_line: 10, end_line: 20 }, { file: 'lib/other.js', start_line: 10, end_line: 20 })).toBe(false);
  });

  it('computes retrieval metrics with single ground truth', () => {
    const groundTruth = [{ file: 'lib/application.js', start_line: 50, end_line: 75 }];
    const retrieved = [{ file: 'lib/application.js', start_line: 60, end_line: 90 }];
    const citations = [{ file: 'lib/application.js', start_line: 55, end_line: 70 }];

    const metrics = computeRetrievalMetrics(groundTruth, retrieved, citations);

    expect(metrics.retrieval_hit_any).toBe(true);
    expect(metrics.retrieval_hit_all).toBe(true);
    expect(metrics.retrieval_recall).toBe(1.0);
    expect(metrics.citation_correct).toBe(true);
  });

  it('computes metrics with multi-hop multi-range ground truth', () => {
    const groundTruth = [
      { file: 'lib/router/index.js', start_line: 10, end_line: 30 },
      { file: 'lib/router/layer.js', start_line: 100, end_line: 120 }
    ];

    const retrievedOne = [{ file: 'lib/router/index.js', start_line: 25, end_line: 50 }];
    const metricsPartial = computeRetrievalMetrics(groundTruth, retrievedOne, []);

    expect(metricsPartial.retrieval_hit_any).toBe(true);
    expect(metricsPartial.retrieval_hit_all).toBe(false);
    expect(metricsPartial.retrieval_recall).toBe(0.5);
    expect(metricsPartial.citation_correct).toBe(false);

    const retrievedBoth = [
      { file: 'lib/router/index.js', start_line: 15, end_line: 20 },
      { file: 'lib/router/layer.js', start_line: 110, end_line: 115 }
    ];
    const citations = [{ file: 'lib/router/layer.js', start_line: 112, end_line: 118 }];
    const metricsAll = computeRetrievalMetrics(groundTruth, retrievedBoth, citations);

    expect(metricsAll.retrieval_hit_any).toBe(true);
    expect(metricsAll.retrieval_hit_all).toBe(true);
    expect(metricsAll.retrieval_recall).toBe(1.0);
    expect(metricsAll.citation_correct).toBe(true);
  });

  it('handles disjoint files and empty retrieval', () => {
    const groundTruth = [{ file: 'lib/response.js', start_line: 1, end_line: 10 }];
    const retrieved = [{ file: 'lib/request.js', start_line: 1, end_line: 10 }];

    const metrics = computeRetrievalMetrics(groundTruth, retrieved, []);

    expect(metrics.retrieval_hit_any).toBe(false);
    expect(metrics.retrieval_hit_all).toBe(false);
    expect(metrics.retrieval_recall).toBe(0);
    expect(metrics.citation_correct).toBe(false);
  });
});
