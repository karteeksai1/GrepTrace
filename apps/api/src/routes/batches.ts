import { Router, Request, Response } from 'express';
import pg from 'pg';
import { aggregateRows, buildHeadToHead, fetchBatchRunRows } from '@greptrace/eval';
import { sendError } from '../utils/errors.js';

export function createBatchesRouter(pool: pg.Pool, rootDir: string): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
      const offset = (page - 1) * limit;

      const countResult = await pool.query('SELECT COUNT(*)::int as total FROM batches');
      const total = countResult.rows[0]?.total ?? 0;

      const query = `
        SELECT
          b.id,
          b.name,
          b.created_at,
          b.config,
          COUNT(r.id)::int as total_runs,
          COUNT(CASE WHEN r.status = 'completed' THEN 1 END)::int as completed_runs,
          COUNT(CASE WHEN r.status = 'failed' THEN 1 END)::int as failed_runs
          , COUNT(CASE WHEN r.status = 'pending' THEN 1 END)::int as pending_runs
        FROM batches b
        LEFT JOIN runs r ON b.id = r.batch_id
        GROUP BY b.id
        ORDER BY b.created_at DESC
        LIMIT $1 OFFSET $2;
      `;
      const result = await pool.query(query, [limit, offset]);

      res.json({
        total,
        page,
        limit,
        batches: result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          created_at: row.created_at,
          config: row.config,
          run_counts: {
            total: row.total_runs,
            completed: row.completed_runs,
            failed: row.failed_runs
            , pending: row.pending_runs
          }
        }))
      });
    } catch (err) {
      sendError(res, 500, (err as Error).message, 'BATCHES_FETCH_FAILED');
    }
  });

  router.get('/:id/summary', async (req: Request, res: Response) => {
    try {
      const batchId = req.params.id;
      const batchResult = await pool.query(
        'SELECT id, name, created_at, config FROM batches WHERE id::text = $1 OR name = $1',
        [batchId]
      );
      if (batchResult.rows.length === 0) {
        sendError(res, 404, `Batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
        return;
      }
      const batch = batchResult.rows[0];
      const rows = await fetchBatchRunRows(pool, batch.id, rootDir);
      const summaries = aggregateRows(rows);

      res.json({
        batch: {
          id: batch.id,
          name: batch.name,
          created_at: batch.created_at,
          config: batch.config
        },
        summaries
      });
    } catch (err) {
      sendError(res, 500, (err as Error).message, 'SUMMARY_FETCH_FAILED');
    }
  });

  router.get('/:id/questions', async (req: Request, res: Response) => {
    try {
      const batchId = req.params.id;
      const batchResult = await pool.query(
        'SELECT id, name, created_at, config FROM batches WHERE id::text = $1 OR name = $1',
        [batchId]
      );
      if (batchResult.rows.length === 0) {
        sendError(res, 404, `Batch '${batchId}' not found`, 'BATCH_NOT_FOUND');
        return;
      }
      const batch = batchResult.rows[0];
      const rows = await fetchBatchRunRows(pool, batch.id, rootDir);
      const questions = buildHeadToHead(rows);

      res.json({
        batch_id: batch.id,
        batch_name: batch.name,
        total: questions.length,
        questions
      });
    } catch (err) {
      sendError(res, 500, (err as Error).message, 'QUESTIONS_FETCH_FAILED');
    }
  });

  return router;
}
