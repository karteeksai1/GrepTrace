import { describe, expect, it, vi } from 'vitest';
import { formatBlindJudgeUserPrompt, getBlindJudgeSystemPrompt, judgeAnswer } from '../packages/eval/src/scoring/judge.js';
describe('Eval Judge Blindness and Scoring', () => {
    it('guarantees judge prompts do not leak system type, model names, or tools', () => {
        const sysPrompt = getBlindJudgeSystemPrompt();
        const userPrompt = formatBlindJudgeUserPrompt('Where is express defined?', 'In lib/express.js', 'Defined in lib/express.js exports', [{ file: 'lib/express.js', start_line: 1, end_line: 10 }]);
        const forbiddenTerms = [
            'agentic',
            'rag',
            'vector',
            'grep',
            'pinecone',
            'step_limit',
            'openai/gpt-oss-120b',
            'qwen',
            'groq'
        ];
        for (const term of forbiddenTerms) {
            expect(sysPrompt.toLowerCase().includes(term)).toBe(false);
            expect(userPrompt.toLowerCase().includes(term)).toBe(false);
        }
    });
    it('parses valid judge response and maps verdicts to scores', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            text: JSON.stringify({
                verdict: 'correct',
                reason: 'Matches reference answer accurately.'
            }),
            usage: { promptTokens: 100, completionTokens: 25, totalTokens: 125 }
        });
        const mockClient = { chat: mockChat };
        const res = await judgeAnswer(mockClient, 'judge-model', 'Question', 'Reference', 'Candidate', []);
        expect(res.verdict).toBe('correct');
        expect(res.score).toBe(1.0);
        expect(res.reason).toBe('Matches reference answer accurately.');
        expect(res.tokens).toBe(125);
    });
    it('triggers repair prompt when first response is invalid JSON', async () => {
        const mockChat = vi
            .fn()
            .mockResolvedValueOnce({
            text: 'I think this is partially correct because...',
            usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
        })
            .mockResolvedValueOnce({
            text: JSON.stringify({
                verdict: 'partial',
                reason: 'Partially correct explanation.'
            }),
            usage: { promptTokens: 150, completionTokens: 20, totalTokens: 170 }
        });
        const mockClient = { chat: mockChat };
        const res = await judgeAnswer(mockClient, 'judge-model', 'Question', 'Reference', 'Candidate', []);
        expect(mockChat).toHaveBeenCalledTimes(2);
        expect(res.verdict).toBe('partial');
        expect(res.score).toBe(0.5);
        expect(res.reason).toBe('Partially correct explanation.');
    });
    it('falls back to incorrect when repair also fails', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            text: 'invalid response non-json',
            usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 }
        });
        const mockClient = { chat: mockChat };
        const res = await judgeAnswer(mockClient, 'judge-model', 'Question', 'Reference', 'Candidate', []);
        expect(mockChat).toHaveBeenCalledTimes(2);
        expect(res.verdict).toBe('incorrect');
        expect(res.score).toBe(0.0);
    });
});
//# sourceMappingURL=eval-judge.test.js.map