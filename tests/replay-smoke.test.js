import { describe, expect, it } from 'vitest';
import { buildFileMap, buildGraphNodesAndEdges, calculateRunningTotals } from '../apps/web/src/utils/replay.js';
import { computeLineHighlight, parseRunAnswer } from '../apps/web/src/utils/highlight.js';
describe('Replay and Compare Views Smoke Fixtures', () => {
    const seededRunDetail = {
        run: {
            id: 'seeded-agentic-run-1',
            system: 'agentic',
            corpus: 'express',
            question_id: 'exp-001',
            model: 'openai/gpt-oss-120b',
            started_at: '2026-11-18T10:00:00Z',
            status: 'completed',
            final_answer: JSON.stringify({
                answer: 'createApplication constructs and initializes app in lib/express.js.',
                citations: [{ file: 'lib/express.js', start_line: 36, end_line: 56 }]
            }),
            total_tokens: 28000,
            cost_usd: 0.005,
            batch_id: 'pilot-batch'
        },
        score: {
            id: 'score-seeded',
            run_id: 'seeded-agentic-run-1',
            retrieval_hit_any: true,
            retrieval_hit_all: true,
            retrieval_recall: 1.0,
            citation_correct: true,
            answer_score: 1.0,
            judge_verdict: 'correct',
            judge_reason: 'Fully matches reference.',
            judge_model: 'qwen/qwen3.8-27b',
            judge_tokens: 70,
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
    const seededEvents = {
        run_id: 'seeded-agentic-run-1',
        count: 3,
        events: [
            {
                id: 'ev-1',
                run_id: 'seeded-agentic-run-1',
                step: 1,
                type: 'tool_call',
                tool: 'glob',
                args: { pattern: 'lib/*.js' },
                result_summary: 'found 5 files',
                files_touched: ['lib/express.js'],
                tokens: 300,
                elapsed_ms: 120,
                created_at: '2026-11-18T10:00:05Z'
            },
            {
                id: 'ev-2',
                run_id: 'seeded-agentic-run-1',
                step: 2,
                type: 'tool_call',
                tool: 'read',
                args: { file: 'lib/express.js', start_line: 36, end_line: 56 },
                result_summary: 'read 21 lines',
                files_touched: ['lib/express.js'],
                tokens: 1500,
                elapsed_ms: 400,
                created_at: '2026-11-18T10:00:15Z'
            },
            {
                id: 'ev-3',
                run_id: 'seeded-agentic-run-1',
                step: 3,
                type: 'model_turn',
                result_summary: 'final answer formulated',
                tokens: 800,
                elapsed_ms: 1500,
                created_at: '2026-11-18T10:00:20Z'
            }
        ]
    };
    it('smokes test replay view graph data construction', () => {
        const { nodes, edges } = buildGraphNodesAndEdges(seededEvents.events, seededRunDetail.question.question, seededRunDetail.question.ground_truth, seededRunDetail.run.final_answer);
        expect(nodes.length).toBeGreaterThanOrEqual(4);
        expect(edges.length).toBe(nodes.length - 1);
        const hitNode = nodes.find((n) => n.isFirstHit);
        expect(hitNode).toBeDefined();
        const fileMap = buildFileMap(seededEvents.events, seededRunDetail.question.ground_truth);
        expect(fileMap).toHaveLength(1);
        expect(fileMap[0].isGroundTruth).toBe(true);
        const totals = calculateRunningTotals(seededEvents.events, 3);
        expect(totals.tokens).toBe(2600);
        expect(totals.elapsedMs).toBe(2020);
    });
    it('smokes test compare view overlap computation', () => {
        const parsed = parseRunAnswer(seededRunDetail.run.final_answer);
        expect(parsed.citations).toHaveLength(1);
        const gt = seededRunDetail.question.ground_truth[0];
        const cit = parsed.citations[0];
        const highlight = computeLineHighlight(36, [{ start_line: gt.start_line, end_line: gt.end_line }], [{ start_line: cit.start_line, end_line: cit.end_line }]);
        expect(highlight).toBe('overlap');
    });
});
//# sourceMappingURL=replay-smoke.test.js.map