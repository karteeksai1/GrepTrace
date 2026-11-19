import { Router } from 'express';
import { sendError } from '../utils/errors.js';
import { findQuestion } from '../utils/questions.js';
export function createRunsRouter(pool, rootDir) {
    const router = Router();
    router.get('/:id', async (req, res) => {
        try {
            const runId = req.params.id;
            const runResult = await pool.query('SELECT * FROM runs WHERE id = $1', [runId]);
            if (runResult.rows.length === 0) {
                sendError(res, 404, `Run '${runId}' not found`, 'RUN_NOT_FOUND');
                return;
            }
            const run = runResult.rows[0];
            const scoreResult = await pool.query('SELECT * FROM scores WHERE run_id = $1', [runId]);
            const score = scoreResult.rows[0] ?? null;
            const question = await findQuestion(run.corpus, run.question_id, rootDir);
            res.json({
                run: {
                    id: run.id,
                    system: run.system,
                    corpus: run.corpus,
                    question_id: run.question_id,
                    model: run.model,
                    started_at: run.started_at,
                    finished_at: run.finished_at,
                    status: run.status,
                    final_answer: run.final_answer,
                    total_tokens: run.total_tokens,
                    cost_usd: run.cost_usd ? Number(run.cost_usd) : 0,
                    batch_id: run.batch_id,
                    repetition: run.repetition
                },
                score: score
                    ? {
                        id: score.id,
                        run_id: score.run_id,
                        retrieval_hit_any: score.retrieval_hit_any,
                        retrieval_hit_all: score.retrieval_hit_all,
                        retrieval_recall: Number(score.retrieval_recall),
                        citation_correct: score.citation_correct,
                        answer_score: Number(score.answer_score),
                        judge_verdict: score.judge_verdict,
                        judge_reason: score.judge_reason,
                        judge_model: score.judge_model,
                        judge_tokens: score.judge_tokens,
                        judge_cost_usd: score.judge_cost_usd ? Number(score.judge_cost_usd) : null,
                        scored_at: score.scored_at
                    }
                    : null,
                question
            });
        }
        catch (err) {
            sendError(res, 500, err.message, 'RUN_FETCH_FAILED');
        }
    });
    router.get('/:id/events', async (req, res) => {
        try {
            const runId = req.params.id;
            const query = `
        SELECT
          id,
          run_id,
          step,
          type,
          tool,
          args,
          result_summary,
          result_bytes,
          files_touched,
          tokens,
          elapsed_ms,
          db_time_ms,
          created_at
        FROM events
        WHERE run_id = $1
        ORDER BY step ASC, created_at ASC;
      `;
            const result = await pool.query(query, [runId]);
            res.json({
                run_id: runId,
                count: result.rows.length,
                events: result.rows
            });
        }
        catch (err) {
            sendError(res, 500, err.message, 'EVENTS_FETCH_FAILED');
        }
    });
    return router;
}
//# sourceMappingURL=runs.js.map