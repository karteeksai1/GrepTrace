import fs from 'node:fs/promises';
import { ToolResult } from './grep.js';
import { CorpusSandbox } from './sandbox.js';

export interface ReadParams {
  file: string;
  start_line?: number;
  end_line?: number;
}

export interface ReadToolResult extends ToolResult {
  readRange?: {
    file: string;
    start_line: number;
    end_line: number;
  };
}

export async function runRead(
  sandbox: CorpusSandbox,
  params: ReadParams
): Promise<ReadToolResult> {
  const filePath = params.file;
  if (!filePath || typeof filePath !== 'string') {
    return {
      output: 'Error: file parameter must be a non-empty string.',
      filesTouched: [],
      bytes: 47
    };
  }

  const check = await sandbox.checkPath(filePath);
  if (!check.allowed || !check.resolvedPath || !check.relativePath) {
    const errorMsg = check.error || 'Access to file is not allowed.';
    return {
      output: `Error: ${errorMsg}`,
      filesTouched: [],
      bytes: Buffer.byteLength(errorMsg, 'utf8')
    };
  }

  let content = '';
  try {
    content = await fs.readFile(check.resolvedPath, 'utf8');
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    const msg = `Error reading file '${filePath}': ${nodeErr.message}`;
    return {
      output: msg,
      filesTouched: [],
      bytes: Buffer.byteLength(msg, 'utf8')
    };
  }

  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;
  const rawStart = Math.max(1, params.start_line ?? 1);
  const rawEnd = Math.max(rawStart, params.end_line ?? rawStart + 299);

  let effectiveEnd = rawEnd;
  let cappedNote = '';

  if (effectiveEnd - rawStart + 1 > 300) {
    effectiveEnd = rawStart + 299;
    cappedNote = `[Note: Requested range exceeded 300 lines. Showing lines ${rawStart}-${effectiveEnd} of ${totalLines}.]`;
  }

  const actualStart = Math.min(rawStart, totalLines);
  const actualEnd = Math.min(effectiveEnd, totalLines);

  const selectedLines: string[] = [];
  for (let i = actualStart; i <= actualEnd; i++) {
    const lineText = lines[i - 1] ?? '';
    selectedLines.push(`${i} | ${lineText}`);
  }

  let formattedOutput = selectedLines.join('\n');
  if (cappedNote) {
    formattedOutput = `${cappedNote}\n\n${formattedOutput}`;
  }

  const omittedMessage = actualEnd < rawEnd ? `Lines ${actualEnd + 1}-${rawEnd} omitted.` : undefined;
  const truncatedResult = sandbox.truncateOutput(formattedOutput, omittedMessage);

  return {
    output: truncatedResult.output,
    filesTouched: [check.relativePath],
    bytes: Buffer.byteLength(truncatedResult.output, 'utf8'),
    readRange: {
      file: check.relativePath,
      start_line: actualStart,
      end_line: actualEnd
    }
  };
}
