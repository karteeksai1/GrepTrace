import { describe, expect, it } from 'vitest';
import {
  assertRagCorpusCommits,
  buildRunMatrix,
  getCompletedRunKeys
} from '../packages/eval/src/runner/batch-runner.js';
import { Question } from '@greptrace/core';
import pg from 'pg';

describe('Eval Resumability and Matrix Generation', () => {
  const dummyQuestions: Question[] = [
    {
      id: 'express-q1',
      corpus: 'express',
      type: 'identifier_lookup',
      question: 'Where is express defined?',
      reference_answer: 'In lib/express.js',
      ground_truth: [{ file: 'lib/express.js', start_line: 1, end_line: 10 }]
    },
    {
      id: 'express-q2',
      corpus: 'express',
      type: 'conceptual',
      question: 'How is routing handled?',
      reference_answer: 'Using Router prototype',
      ground_truth: [{ file: 'lib/router/index.js', start_line: 1, end_line: 20 }]
    }
  ];

  it('builds interleaved run matrix across systems and repetitions', () => {
    const matrix = buildRunMatrix(
      { express: dummyQuestions },
      ['agentic', 'rag'],
      'test-model',
      2
    );

    expect(matrix).toHaveLength(8);
    expect(matrix[0].system).toBe('agentic');
    expect(matrix[0].question.id).toBe('express-q1');
    expect(matrix[0].repetition).toBe(1);

    expect(matrix[1].system).toBe('rag');
    expect(matrix[1].question.id).toBe('express-q1');
    expect(matrix[1].repetition).toBe(1);

    expect(matrix[2].system).toBe('agentic');
    expect(matrix[2].question.id).toBe('express-q2');

    expect(matrix[4].repetition).toBe(2);
  });

  it('retrieves completed run keys from scores and runs to skip completed items', async () => {
    const mockQuery = async () => ({
      rows: [
        {
          system: 'agentic',
          corpus: 'express',
          question_id: 'express-q1',
          model: 'test-model',
          repetition: 1
        }
      ]
    });
    const mockPool = { query: mockQuery } as unknown as pg.Pool;

    const completed = await getCompletedRunKeys(mockPool, 'batch-123');
    expect(completed.has('agentic_express_express-q1_test-model_1')).toBe(true);
    expect(completed.has('rag_express_express-q1_test-model_1')).toBe(false);
  });

  it('refuses RAG benchmarking without a recorded corpus ingestion', async () => {
    const mockPool = { query: async () => ({ rows: [] }) } as unknown as pg.Pool;
    await expect(assertRagCorpusCommits(
      mockPool,
      ['express'],
      { corpora: { express: { path: 'corpora/express', commit: 'unused' } } },
      process.cwd()
    )).rejects.toThrow(/no corpus_ingestions row exists/);
  });
});
