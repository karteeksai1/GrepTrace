import { spawn } from 'node:child_process';
import { rgPath } from '@vscode/ripgrep';
import { CorpusSandbox } from './sandbox.js';

export interface GrepParams {
  pattern: string;
  path_glob?: string;
  max_results?: number;
  context_lines?: number;
}

export interface ToolResult {
  output: string;
  filesTouched: string[];
  bytes: number;
}

function normalizeLine(line: string): string {
  if (line.startsWith('./')) {
    return line.slice(2);
  }
  return line;
}

function extractFileFromGrepLine(line: string): string | null {
  const match = line.match(/^([^:\-]+)[:\-]/);
  return match ? normalizeLine(match[1]) : null;
}

export async function runGrep(
  sandbox: CorpusSandbox,
  params: GrepParams
): Promise<ToolResult> {
  const pattern = params.pattern;
  if (!pattern || typeof pattern !== 'string') {
    return {
      output: 'Error: pattern must be a non-empty string.',
      filesTouched: [],
      bytes: 42
    };
  }

  const maxResults = Math.min(Math.max(1, params.max_results ?? 50), 200);
  const contextLines = Math.max(0, Math.min(params.context_lines ?? 0, 10));

  const args: string[] = [
    '--no-config',
    '--color=never',
    '--line-number',
    '-g', '!.git/**',
    '-g', '!node_modules/**',
    '-g', '!*.lock',
    '-g', '!package-lock.json',
    '-g', '!pnpm-lock.yaml',
    '-g', '!yarn.lock'
  ];

  if (params.path_glob) {
    if (params.path_glob.includes('..')) {
      return {
        output: 'Error: path_glob cannot contain path traversal ("..").',
        filesTouched: [],
        bytes: 52
      };
    }
    args.push('-g', params.path_glob);
  }

  if (contextLines > 0) {
    args.push('-C', String(contextLines));
  }

  args.push('--', pattern, '.');

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
        const errorMsg = stderr.trim() || 'Invalid regular expression.';
        const output = `Error running grep: ${errorMsg}`;
        resolve({
          output,
          filesTouched: [],
          bytes: Buffer.byteLength(output, 'utf8')
        });
        return;
      }

      const rawLines = stdout.trim().split('\n').filter((l) => l.length > 0);
      if (rawLines.length === 0) {
        const output = `No matches found for pattern '${pattern}'.`;
        resolve({
          output,
          filesTouched: [],
          bytes: Buffer.byteLength(output, 'utf8')
        });
        return;
      }

      const totalMatches = rawLines.length;
      const slicedLines = rawLines.slice(0, maxResults).map(normalizeLine);
      const filesSet = new Set<string>();

      for (const line of slicedLines) {
        const file = extractFileFromGrepLine(line);
        if (file && !sandbox.isExcluded(file)) {
          filesSet.add(file);
        }
      }

      let formattedOutput = slicedLines.join('\n');
      let omittedNote = '';
      if (totalMatches > maxResults) {
        omittedNote = `${totalMatches - maxResults} matching lines were omitted.`;
        formattedOutput += `\n\n[Showing ${maxResults} of ${totalMatches} matches. ${omittedNote}]`;
      }

      const truncatedResult = sandbox.truncateOutput(formattedOutput, omittedNote);
      resolve({
        output: truncatedResult.output,
        filesTouched: Array.from(filesSet),
        bytes: Buffer.byteLength(truncatedResult.output, 'utf8')
      });
    });

    proc.on('error', (err) => {
      const output = `Failed to spawn ripgrep: ${err.message}`;
      resolve({
        output,
        filesTouched: [],
        bytes: Buffer.byteLength(output, 'utf8')
      });
    });
  });
}
