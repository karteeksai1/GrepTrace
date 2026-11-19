import { describe, expect, it } from 'vitest';
import {
  computeLineHighlight,
  parseRunAnswer
} from '../apps/web/src/utils/highlight.js';
import { RunDetailResponse, RunEventsResponse } from '../apps/web/src/types.js';

describe('Compare View Fixture Data Processing', () => {
  const mockAgenticFixture: RunDetailResponse = {
    run: {
      id: 'agentic-run-123',
      system: 'agentic',
      corpus: 'express',
      question_id: 'exp-001',
      model: 'openai/gpt-oss-120b',
      started_at: '2026-11-18T10:00:00Z',
      status: 'completed',
      final_answer: JSON.stringify({
        answer: 'createApplication is in lib/express.js lines 36-53.',
        citations: [{ file: 'lib/express.js', start_line: 36, end_line: 53 }]
      }),
      total_tokens: 45000,
      cost_usd: 0.0084,
      batch_id: 'batch-test'
    },
    score: {
      id: 'score-1',
      run_id: 'agentic-run-123',
      retrieval_hit_any: true,
      retrieval_hit_all: true,
      retrieval_recall: 1.0,
      citation_correct: true,
      answer_score: 1.0,
      judge_verdict: 'correct',
      judge_reason: 'Accurately located createApplication function.',
      judge_model: 'qwen/qwen3.8-27b',
      judge_tokens: 65,
      judge_cost_usd: 0.0001,
      scored_at: '2026-11-18T10:02:00Z'
    },
    question: {
      id: 'exp-001',
      corpus: 'express',
      type: 'identifier_lookup',
      question: 'Which function creates an Express application, and where inside it is app.init() called?',
      reference_answer: 'createApplication in lib/express.js builds the app function...',
      ground_truth: [{ file: 'lib/express.js', start_line: 36, end_line: 56 }]
    }
  };

  const mockRagFixture: RunDetailResponse = {
    run: {
      id: 'rag-run-456',
      system: 'rag',
      corpus: 'express',
      question_id: 'exp-001',
      model: 'openai/gpt-oss-120b',
      started_at: '2026-11-18T10:01:00Z',
      status: 'completed',
      final_answer: JSON.stringify({
        answer: 'The createApplication function is defined in lib/express.js.',
        citations: [{ file: 'lib/express.js', start_line: 36, end_line: 55 }]
      }),
      total_tokens: 2500,
      cost_usd: 0.0006,
      batch_id: 'batch-test'
    },
    score: {
      id: 'score-2',
      run_id: 'rag-run-456',
      retrieval_hit_any: true,
      retrieval_hit_all: true,
      retrieval_recall: 1.0,
      citation_correct: true,
      answer_score: 1.0,
      judge_verdict: 'correct',
      judge_reason: 'Found in chunk retrieval.',
      judge_model: 'qwen/qwen3.8-27b',
      judge_tokens: 50,
      judge_cost_usd: 0.00008,
      scored_at: '2026-11-18T10:02:30Z'
    },
    question: {
      id: 'exp-001',
      corpus: 'express',
      type: 'identifier_lookup',
      question: 'Which function creates an Express application, and where inside it is app.init() called?',
      reference_answer: 'createApplication in lib/express.js builds the app function...',
      ground_truth: [{ file: 'lib/express.js', start_line: 36, end_line: 56 }]
    }
  };

  const mockRagEvents: RunEventsResponse = {
    run_id: 'rag-run-456',
    count: 2,
    events: [
      {
        id: 'ev-1',
        run_id: 'rag-run-456',
        step: 1,
        type: 'retrieval',
        elapsed_ms: 3200,
        db_time_ms: 2100,
        created_at: '2026-11-18T10:01:05Z'
      },
      {
        id: 'ev-2',
        run_id: 'rag-run-456',
        step: 2,
        type: 'answer_turn',
        elapsed_ms: 12000,
        db_time_ms: 0,
        created_at: '2026-11-18T10:01:20Z'
      }
    ]
  };

  it('parses answers and citations from agentic fixture', () => {
    const parsed = parseRunAnswer(mockAgenticFixture.run.final_answer);
    expect(parsed.answer).toContain('createApplication is in lib/express.js');
    expect(parsed.citations).toHaveLength(1);
    expect(parsed.citations[0].file).toBe('lib/express.js');
    expect(parsed.citations[0].start_line).toBe(36);
    expect(parsed.citations[0].end_line).toBe(53);
  });

  it('computes RAG vector time and database time accurately from events fixture', () => {
    const retrievalEvent = mockRagEvents.events.find((e) => e.type === 'retrieval');
    expect(retrievalEvent).toBeDefined();

    const dbTimeMs = retrievalEvent!.db_time_ms!;
    const totalRetrievalMs = retrievalEvent!.elapsed_ms!;
    const vectorTimeMs = totalRetrievalMs - dbTimeMs;

    expect(dbTimeMs).toBe(2100);
    expect(vectorTimeMs).toBe(1100);
  });

  it('computes line overlap between ground truth and citations', () => {
    const gt = mockAgenticFixture.question!.ground_truth[0];
    const cit = parseRunAnswer(mockAgenticFixture.run.final_answer).citations[0];

    const gtRange = [{ start_line: gt.start_line, end_line: gt.end_line }];
    const citRange = [{ start_line: cit.start_line, end_line: cit.end_line }];

    expect(computeLineHighlight(35, gtRange, citRange)).toBe('none');
    expect(computeLineHighlight(36, gtRange, citRange)).toBe('overlap');
    expect(computeLineHighlight(53, gtRange, citRange)).toBe('overlap');
    expect(computeLineHighlight(54, gtRange, citRange)).toBe('ground_truth');
    expect(computeLineHighlight(57, gtRange, citRange)).toBe('none');
  });

  it('handles missing or failed run fixture gracefully', () => {
    const emptyParsed = parseRunAnswer(undefined);
    expect(emptyParsed.answer).toBe('');
    expect(emptyParsed.citations).toEqual([]);
  });
});
