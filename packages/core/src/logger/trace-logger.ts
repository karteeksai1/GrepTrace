import crypto from 'node:crypto';
import pg from 'pg';
import { EventInput, EventRecord, Run, RunStatus, SystemType } from '../types.js';

export interface StartRunParams {
  id?: string;
  system: SystemType;
  corpus: string;
  question_id: string;
  model: string;
}

export interface FinishRunParams {
  status: RunStatus;
  final_answer?: string | null;
  total_tokens?: number;
  cost_usd?: number;
}

export class TraceLogger {
  private runId: string;
  private pool: pg.Pool;

  constructor(pool: pg.Pool, runId?: string) {
    this.pool = pool;
    this.runId = runId ?? crypto.randomUUID();
  }

  getRunId(): string {
    return this.runId;
  }

  async startRun(params: StartRunParams): Promise<string> {
    if (params.id) {
      this.runId = params.id;
    }
    const query = `
      INSERT INTO runs (id, system, corpus, question_id, model, started_at, status, total_tokens, cost_usd)
      VALUES ($1, $2, $3, $4, $5, NOW(), 'running', 0, 0)
      RETURNING id;
    `;
    const values = [this.runId, params.system, params.corpus, params.question_id, params.model];
    await this.pool.query(query, values);
    return this.runId;
  }

  async logEvent(input: Omit<EventInput, 'run_id'>): Promise<EventRecord> {
    const id = crypto.randomUUID();
    const query = `
      INSERT INTO events (
        id, run_id, step, type, tool, args, result_summary,
        result_bytes, files_touched, tokens, elapsed_ms, db_time_ms, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *;
    `;
    const values = [
      id,
      this.runId,
      input.step,
      input.type,
      input.tool ?? null,
      input.args ? JSON.stringify(input.args) : null,
      input.result_summary ?? null,
      input.result_bytes ?? null,
      input.files_touched ?? [],
      input.tokens ?? 0,
      input.elapsed_ms ?? 0,
      input.db_time_ms ?? 0
    ];

    const result = await this.pool.query(query, values);
    const row = result.rows[0];
    return {
      id: row.id,
      run_id: row.run_id,
      step: row.step,
      type: row.type,
      tool: row.tool,
      args: row.args,
      result_summary: row.result_summary,
      result_bytes: row.result_bytes,
      files_touched: row.files_touched,
      tokens: row.tokens,
      elapsed_ms: row.elapsed_ms,
      db_time_ms: row.db_time_ms,
      created_at: row.created_at
    };
  }

  async finishRun(params: FinishRunParams): Promise<void> {
    const query = `
      UPDATE runs
      SET finished_at = NOW(),
          status = $2,
          final_answer = $3,
          total_tokens = COALESCE($4, total_tokens),
          cost_usd = COALESCE($5, cost_usd)
      WHERE id = $1;
    `;
    const values = [
      this.runId,
      params.status,
      params.final_answer ?? null,
      params.total_tokens ?? 0,
      params.cost_usd ?? 0
    ];
    await this.pool.query(query, values);
  }

  async getEvents(): Promise<EventRecord[]> {
    const query = `
      SELECT * FROM events
      WHERE run_id = $1
      ORDER BY step ASC, created_at ASC;
    `;
    const result = await this.pool.query(query, [this.runId]);
    return result.rows;
  }

  async getRun(): Promise<Run | null> {
    const query = `SELECT * FROM runs WHERE id = $1;`;
    const result = await this.pool.query(query, [this.runId]);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0];
  }
}
