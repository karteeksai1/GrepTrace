import { spawn } from 'node:child_process';
import { rgPath } from '@vscode/ripgrep';
function normalizePath(line) {
    if (line.startsWith('./')) {
        return line.slice(2);
    }
    return line;
}
export async function runGlob(sandbox, params) {
    const pattern = params.pattern || '**/*';
    if (pattern.includes('..')) {
        return {
            output: 'Error: glob pattern cannot contain path traversal ("..").',
            filesTouched: [],
            bytes: 56
        };
    }
    const args = [
        '--no-config',
        '--files',
        '-g', '!.git/**',
        '-g', '!node_modules/**',
        '-g', '!*.lock',
        '-g', '!package-lock.json',
        '-g', '!pnpm-lock.yaml',
        '-g', '!yarn.lock',
        '-g', pattern
    ];
    return new Promise((resolve) => {
        const proc = spawn(rgPath, args, { cwd: sandbox.getCorpusRoot() });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => {
            stdout += d.toString('utf8');
        });
        proc.stderr.on('data', (d) => {
            stderr += d.toString('utf8');
        });
        proc.on('close', (code) => {
            if (code === 2) {
                const errorMsg = stderr.trim() || 'Invalid glob pattern.';
                const output = `Error running glob: ${errorMsg}`;
                resolve({
                    output,
                    filesTouched: [],
                    bytes: Buffer.byteLength(output, 'utf8')
                });
                return;
            }
            const rawLines = stdout.trim().split('\n').filter((l) => l.length > 0);
            const filtered = rawLines
                .map(normalizePath)
                .filter((file) => !sandbox.isExcluded(file));
            if (filtered.length === 0) {
                const output = `No files matching glob pattern '${pattern}'.`;
                resolve({
                    output,
                    filesTouched: [],
                    bytes: Buffer.byteLength(output, 'utf8')
                });
                return;
            }
            const totalFiles = filtered.length;
            const maxLimit = 200;
            const sliced = filtered.slice(0, maxLimit);
            let formattedOutput = sliced.join('\n');
            let omittedNote = '';
            if (totalFiles > maxLimit) {
                omittedNote = `${totalFiles - maxLimit} matching files were omitted.`;
                formattedOutput += `\n\n[Showing ${maxLimit} of ${totalFiles} files. ${omittedNote}]`;
            }
            const truncatedResult = sandbox.truncateOutput(formattedOutput, omittedNote);
            resolve({
                output: truncatedResult.output,
                filesTouched: sliced,
                bytes: Buffer.byteLength(truncatedResult.output, 'utf8')
            });
        });
        proc.on('error', (err) => {
            const output = `Failed to spawn ripgrep for glob: ${err.message}`;
            resolve({
                output,
                filesTouched: [],
                bytes: Buffer.byteLength(output, 'utf8')
            });
        });
    });
}
//# sourceMappingURL=glob.js.map