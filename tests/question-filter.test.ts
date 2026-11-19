import { describe, expect, it } from 'vitest';
import { QuestionRow } from '../apps/web/src/types.js';

describe('Question Table Filtering Logic', () => {
  const mockQuestions: QuestionRow[] = [
    {
      question_id: 'q1',
      corpus: 'express',
      question_type: 'identifier_lookup',
      agentic_score: 1.0,
      rag_score: 1.0,
      agentic_hit_all: true,
      rag_hit_all: true,
      agentic_tokens: 1000,
      rag_tokens: 500,
      agentic_latency_ms: 1000,
      rag_latency_ms: 200,
      winner: 'tie'
    },
    {
      question_id: 'q2',
      corpus: 'express',
      question_type: 'conceptual',
      agentic_score: 1.0,
      rag_score: 0.0,
      agentic_hit_all: true,
      rag_hit_all: false,
      agentic_tokens: 2000,
      rag_tokens: 400,
      agentic_latency_ms: 2000,
      rag_latency_ms: 150,
      winner: 'agentic'
    },
    {
      question_id: 'q3',
      corpus: 'fastapi',
      question_type: 'multi_hop',
      agentic_score: 0.0,
      rag_score: 1.0,
      agentic_hit_all: false,
      rag_hit_all: true,
      agentic_tokens: 3000,
      rag_tokens: 800,
      agentic_latency_ms: 3500,
      rag_latency_ms: 300,
      winner: 'rag'
    },
    {
      question_id: 'q4',
      corpus: 'fastapi',
      question_type: 'multi_hop',
      agentic_score: 0.0,
      rag_score: 0.0,
      agentic_hit_all: false,
      rag_hit_all: false,
      agentic_tokens: 500,
      rag_tokens: 400,
      agentic_latency_ms: 500,
      rag_latency_ms: 100,
      winner: 'tie'
    }
  ];

  it('filters by both_correct outcome', () => {
    const both = mockQuestions.filter((q) => q.agentic_score === 1 && q.rag_score === 1);
    expect(both).toHaveLength(1);
    expect(both[0].question_id).toBe('q1');
  });

  it('filters by agentic_only outcome', () => {
    const agenticOnly = mockQuestions.filter((q) => q.agentic_score === 1 && q.rag_score < 1);
    expect(agenticOnly).toHaveLength(1);
    expect(agenticOnly[0].question_id).toBe('q2');
  });

  it('filters by rag_only outcome', () => {
    const ragOnly = mockQuestions.filter((q) => q.rag_score === 1 && q.agentic_score < 1);
    expect(ragOnly).toHaveLength(1);
    expect(ragOnly[0].question_id).toBe('q3');
  });

  it('filters by neither outcome', () => {
    const neither = mockQuestions.filter((q) => q.agentic_score < 1 && q.rag_score < 1);
    expect(neither).toHaveLength(1);
    expect(neither[0].question_id).toBe('q4');
  });

  it('filters by corpus and question type', () => {
    const expressQuestions = mockQuestions.filter((q) => q.corpus === 'express');
    expect(expressQuestions).toHaveLength(2);

    const multiHop = mockQuestions.filter((q) => q.question_type === 'multi_hop');
    expect(multiHop).toHaveLength(2);
  });
});
