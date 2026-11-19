import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CorpusSandbox } from '@greptrace/agentic';
describe('Corpus Sandbox', () => {
    const rootDir = process.cwd();
    const corpusRoot = path.join(rootDir, 'corpora', 'express');
    const sandbox = new CorpusSandbox(corpusRoot, 500);
    it('rejects relative path traversal with parent directories', async () => {
        const result = await sandbox.checkPath('../../../package.json');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('escapes the corpus root');
    });
    it('rejects absolute paths outside the corpus root', async () => {
        const result = await sandbox.checkPath('/etc/passwd');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('escapes the corpus root');
    });
    it('rejects excluded and lock files', async () => {
        const result = await sandbox.checkPath('.git/config');
        expect(result.allowed).toBe(false);
        expect(result.error).toContain('excluded or binary file');
    });
    it('detects symlink escapes resolving outside the corpus root', async () => {
        const tmpDir = path.join(rootDir, 'corpora', 'express', 'test-symlink-dir');
        const symlinkPath = path.join(tmpDir, 'escape-link');
        try {
            await fs.mkdir(tmpDir, { recursive: true });
            await fs.symlink(path.join(rootDir, 'package.json'), symlinkPath);
            const result = await sandbox.checkPath('test-symlink-dir/escape-link');
            expect(result.allowed).toBe(false);
            expect(result.error).toContain('symlink');
        }
        finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });
    it('applies output budget truncation note when byte budget exceeded', () => {
        const largeText = 'A'.repeat(1000);
        const res = sandbox.truncateOutput(largeText, '500 items omitted.');
        expect(res.truncated).toBe(true);
        expect(res.output).toContain('[TRUNCATED: Output exceeded budget of 500 bytes.');
        expect(res.output).toContain('500 items omitted.');
    });
});
//# sourceMappingURL=sandbox.test.js.map