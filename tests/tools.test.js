import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CorpusSandbox, runGlob, runGrep, runRead } from '@greptrace/agentic';
describe('Agentic Search Tools', () => {
    const rootDir = process.cwd();
    const corpusRoot = path.join(rootDir, 'corpora', 'express');
    const sandbox = new CorpusSandbox(corpusRoot, 1000);
    it('grep returns descriptive error on invalid regular expressions', async () => {
        const res = await runGrep(sandbox, { pattern: '[unclosed-regex' });
        expect(res.output).toContain('Error running grep:');
        expect(res.output.toLowerCase()).toContain('regex');
    });
    it('grep returns descriptive message when no matches are found', async () => {
        const res = await runGrep(sandbox, { pattern: 'ThisPatternWillNeverMatchAnythingEverInExpress12345' });
        expect(res.output).toContain('No matches found for pattern');
    });
    it('grep finds matches and tracks files touched', async () => {
        const res = await runGrep(sandbox, { pattern: 'createApplication', max_results: 5 });
        expect(res.output).toContain('lib/express.js');
        expect(res.filesTouched).toContain('lib/express.js');
    });
    it('glob returns matching file paths and handles empty results', async () => {
        const res = await runGlob(sandbox, { pattern: '*.nonexistentext' });
        expect(res.output).toContain('No files matching glob pattern');
        const validRes = await runGlob(sandbox, { pattern: 'lib/*.js' });
        expect(validRes.output).toContain('lib/express.js');
        expect(validRes.filesTouched.length).toBeGreaterThan(0);
    });
    it('read enforces 300 line cap when range exceeds 300 lines', async () => {
        const res = await runRead(sandbox, {
            file: 'lib/response.js',
            start_line: 1,
            end_line: 600
        });
        expect(res.output).toContain('Requested range exceeded 300 lines');
        expect(res.readRange?.start_line).toBe(1);
        expect(res.readRange?.end_line).toBe(300);
    });
    it('read returns error string for missing file instead of throwing', async () => {
        const res = await runRead(sandbox, {
            file: 'lib/nonexistent-file.js',
            start_line: 1,
            end_line: 10
        });
        expect(res.output).toContain("Error reading file 'lib/nonexistent-file.js'");
    });
});
//# sourceMappingURL=tools.test.js.map