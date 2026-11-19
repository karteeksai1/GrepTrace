import http from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createApp } from '../apps/api/src/app.js';
import { CorporaConfig } from '@greptrace/core';

describe('Express API Endpoints', () => {
  let server: http.Server;
  let baseUrl: string;

  const mockCorporaConfig: CorporaConfig = {
    corpora: {
      express: {
        path: 'corpora/express',
        tag: 'v5.3.0',
        commit: 'cf6722bf89a86905281d9160b6482e08166b5ef0'
      }
    }
  };

  const mockPool = {
    query: async (sql: string, params?: unknown[]) => {
      const s = sql.toLowerCase().replace(/\s+/g, ' ');
      if (s.includes('count(*)::int as total from batches')) {
        return { rows: [{ total: 1 }] };
      }
      if (s.includes('from batches b')) {
        return {
          rows: [
            {
              id: 'batch-1',
              name: 'pilot_express',
              created_at: new Date().toISOString(),
              config: { systems: ['agentic', 'rag'] },
              total_runs: 6,
              completed_runs: 4,
              failed_runs: 2
            }
          ]
        };
      }
      if (s.includes('where id::text = $1 or name = $1')) {
        if (params && (params[0] === 'batch-1' || params[0] === 'pilot_express')) {
          return {
            rows: [
              {
                id: 'batch-1',
                name: 'pilot_express',
                created_at: new Date().toISOString(),
                config: { systems: ['agentic', 'rag'] }
              }
            ]
          };
        }
        return { rows: [] };
      }
      if (s.includes('inner join batches b on r.batch_id = b.id')) {
        return {
          rows: [
            {
              run_id: 'run-1',
              system: 'agentic',
              corpus: 'express',
              question_id: 'exp-001',
              model: 'model-a',
              status: 'completed',
              total_tokens: 1000,
              cost_usd: 0.001,
              repetition: 1,
              retrieval_hit_any: true,
              retrieval_hit_all: true,
              retrieval_recall: 1.0,
              citation_correct: true,
              answer_score: 1.0,
              judge_verdict: 'correct',
              judge_reason: 'Accurate',
              judge_tokens: 50,
              judge_cost_usd: 0.0001,
              final_answer: '{"answer":"Defined in lib/express.js","citations":[{"file":"lib/express.js","start_line":36,"end_line":53}]}'
            },
            {
              run_id: 'run-2',
              system: 'rag',
              corpus: 'express',
              question_id: 'exp-001',
              model: 'model-a',
              status: 'completed',
              total_tokens: 800,
              cost_usd: 0.0008,
              repetition: 1,
              retrieval_hit_any: true,
              retrieval_hit_all: true,
              retrieval_recall: 1.0,
              citation_correct: true,
              answer_score: 1.0,
              judge_verdict: 'correct',
              judge_reason: 'Accurate',
              judge_tokens: 50,
              judge_cost_usd: 0.0001,
              final_answer: '{"answer":"Defined in lib/express.js","citations":[{"file":"lib/express.js","start_line":36,"end_line":53}]}'
            }
          ]
        };
      }
      if (s.includes('from events where run_id = $1')) {
        return {
          rows: [
            {
              id: 'event-1',
              step: 1,
              type: 'tool_call',
              tool: 'read',
              elapsed_ms: 100,
              db_time_ms: 0
            }
          ]
        };
      }
      if (s.includes('select * from runs where id = $1')) {
        if (params && params[0] === 'run-1') {
          return {
            rows: [
              {
                id: 'run-1',
                system: 'agentic',
                corpus: 'express',
                question_id: 'exp-001',
                model: 'model-a',
                status: 'completed',
                total_tokens: 1000,
                cost_usd: 0.001,
                repetition: 1,
                batch_id: 'batch-1'
              }
            ]
          };
        }
        return { rows: [] };
      }
      if (s.includes('select * from scores where run_id = $1')) {
        return {
          rows: [
            {
              id: 'score-1',
              run_id: 'run-1',
              retrieval_hit_any: true,
              retrieval_hit_all: true,
              retrieval_recall: 1.0,
              citation_correct: true,
              answer_score: 1.0,
              judge_verdict: 'correct',
              judge_reason: 'Good'
            }
          ]
        };
      }
      return { rows: [] };
    }
  } as unknown as pg.Pool;

  beforeAll(async () => {
    const rootDir = process.cwd();
    const app = createApp({
      pool: mockPool,
      corporaConfig: mockCorporaConfig,
      rootDir
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/health returns status ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('GET /api/batches lists batches with run counts', async () => {
    const res = await fetch(`${baseUrl}/api/batches?page=1&limit=10`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.batches).toHaveLength(1);
    expect(data.batches[0].name).toBe('pilot_express');
    expect(data.batches[0].run_counts.total).toBe(6);
  });

  it('GET /api/batches/:id/summary returns aggregated report numbers', async () => {
    const res = await fetch(`${baseUrl}/api/batches/batch-1/summary`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.batch.name).toBe('pilot_express');
    expect(Array.isArray(data.summaries)).toBe(true);
  });

  it('GET /api/batches/:id/questions returns head to head question rows', async () => {
    const res = await fetch(`${baseUrl}/api/batches/batch-1/questions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.batch_id).toBe('batch-1');
    expect(data.questions).toHaveLength(1);
    expect(data.questions[0].winner).toBe('tie');
  });

  it('GET /api/runs/:id returns run details, score, and question', async () => {
    const res = await fetch(`${baseUrl}/api/runs/run-1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.run.id).toBe('run-1');
    expect(data.score.answer_score).toBe(1.0);
    expect(data.question.id).toBe('exp-001');
  });

  it('GET /api/runs/:id/events returns ordered events list', async () => {
    const res = await fetch(`${baseUrl}/api/runs/run-1/events`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(data.events[0].tool).toBe('read');
  });

  it('GET /api/corpora/:corpus/file returns lines with sandbox checks', async () => {
    const res = await fetch(`${baseUrl}/api/corpora/express/file?path=package.json&start=1&end=5`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.corpus).toBe('express');
    expect(data.path).toBe('package.json');
    expect(data.lines).toHaveLength(5);
  });

  it('GET /api/corpora/:corpus/file rejects path traversal', async () => {
    const res = await fetch(`${baseUrl}/api/corpora/express/file?path=../../etc/passwd`);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('PATH_TRAVERSAL_DETECTED');
  });

  it('GET /api/corpora/:corpus/file rejects ranges over 400 lines', async () => {
    const res = await fetch(`${baseUrl}/api/corpora/express/file?path=package.json&start=1&end=450`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('RANGE_EXCEEDS_CAP');
  });
});
