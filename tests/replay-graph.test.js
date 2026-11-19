import { describe, expect, it } from 'vitest';
import { buildFileMap, buildGraphNodesAndEdges, calculateRunningTotals, eventTouchesGroundTruth, isDeadEndEvent } from '../apps/web/src/utils/replay.js';
describe('Replay Graph Pure Logic', () => {
    const gtList = [
        { file: 'lib/express.js', start_line: 36, end_line: 56 }
    ];
    const mockEvents = [
        {
            id: 'e1',
            run_id: 'r1',
            step: 1,
            type: 'tool_call',
            tool: 'glob',
            args: { pattern: 'lib/*.js' },
            result_summary: 'found 5 files',
            files_touched: ['lib/express.js', 'lib/application.js'],
            tokens: 100,
            elapsed_ms: 50,
            created_at: '2026-11-18T10:00:00Z'
        },
        {
            id: 'e2',
            run_id: 'r1',
            step: 2,
            type: 'tool_call',
            tool: 'grep',
            args: { pattern: 'nonExistentPattern' },
            result_summary: 'No matches found',
            result_bytes: 0,
            files_touched: [],
            tokens: 150,
            elapsed_ms: 120,
            created_at: '2026-11-18T10:00:01Z'
        },
        {
            id: 'e3',
            run_id: 'r1',
            step: 3,
            type: 'tool_call',
            tool: 'read',
            args: { file: 'lib/express.js', start_line: 30, end_line: 60 },
            result_summary: 'read 31 lines',
            tokens: 300,
            elapsed_ms: 200,
            created_at: '2026-11-18T10:00:02Z'
        }
    ];
    it('detects dead ends on empty or zero-match results', () => {
        expect(isDeadEndEvent(mockEvents[0])).toBe(false);
        expect(isDeadEndEvent(mockEvents[1])).toBe(true);
    });
    it('detects ground truth touch and flags the first hit', () => {
        expect(eventTouchesGroundTruth(mockEvents[0], gtList)).toBe(true);
        expect(eventTouchesGroundTruth(mockEvents[1], gtList)).toBe(false);
        expect(eventTouchesGroundTruth(mockEvents[2], gtList)).toBe(true);
        const { nodes } = buildGraphNodesAndEdges(mockEvents, 'Question', gtList, 'Final answer');
        expect(nodes).toHaveLength(5);
        const firstHitNode = nodes.find((n) => n.isFirstHit);
        expect(firstHitNode).toBeDefined();
        expect(firstHitNode?.step).toBe(1);
    });
    it('builds linear edges between sequential nodes', () => {
        const { nodes, edges } = buildGraphNodesAndEdges(mockEvents, 'Test Question', gtList);
        expect(edges).toHaveLength(nodes.length - 1);
        for (let i = 0; i < edges.length; i++) {
            expect(edges[i].from).toBe(nodes[i].id);
            expect(edges[i].to).toBe(nodes[i + 1].id);
        }
    });
    it('handles runs that never found the ground truth', () => {
        const missEvents = [
            {
                id: 'm1',
                run_id: 'r2',
                step: 1,
                type: 'tool_call',
                tool: 'grep',
                args: { pattern: 'router' },
                result_summary: '3 matches',
                files_touched: ['lib/router/index.js'],
                tokens: 100,
                elapsed_ms: 50,
                created_at: '2026-11-18T10:00:00Z'
            }
        ];
        const { nodes } = buildGraphNodesAndEdges(missEvents, 'Question', gtList);
        const hits = nodes.filter((n) => n.touchesGroundTruth);
        expect(hits).toHaveLength(0);
        const firstHit = nodes.find((n) => n.isFirstHit);
        expect(firstHit).toBeUndefined();
    });
    it('handles runs with error events', () => {
        const errEvents = [
            {
                id: 'err1',
                run_id: 'r3',
                step: 1,
                type: 'error',
                result_summary: 'Tool call error: invalid regex',
                tokens: 50,
                elapsed_ms: 30,
                created_at: '2026-11-18T10:00:00Z'
            }
        ];
        expect(isDeadEndEvent(errEvents[0])).toBe(true);
        const { nodes } = buildGraphNodesAndEdges(errEvents, 'Question', gtList);
        expect(nodes[1].isDeadEnd).toBe(true);
    });
    it('builds ordered file map with ground truth markers', () => {
        const fileMap = buildFileMap(mockEvents, gtList);
        expect(fileMap).toHaveLength(2);
        expect(fileMap[0].file).toBe('lib/express.js');
        expect(fileMap[0].isGroundTruth).toBe(true);
        expect(fileMap[0].visitCount).toBe(2);
        expect(fileMap[1].file).toBe('lib/application.js');
        expect(fileMap[1].isGroundTruth).toBe(false);
    });
    it('computes running totals accurately up to a given step', () => {
        const totalsStep1 = calculateRunningTotals(mockEvents, 1);
        expect(totalsStep1.tokens).toBe(100);
        expect(totalsStep1.elapsedMs).toBe(50);
        const totalsStep3 = calculateRunningTotals(mockEvents, 3);
        expect(totalsStep3.tokens).toBe(550);
        expect(totalsStep3.elapsedMs).toBe(370);
    });
});
//# sourceMappingURL=replay-graph.test.js.map