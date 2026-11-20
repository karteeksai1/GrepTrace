import path from 'node:path';
import { createHash } from 'node:crypto';
import { estimateEmbeddingTokens } from '@greptrace/core';
import { CodeChunk } from './types.js';

export interface ChunkingOptions {
  maxTokens: number;
  overlapLines: number;
}

export interface ChunkingResult {
  chunks: CodeChunk[];
  oversizedLineCount: number;
}

function createChunkId(corpus: string, file: string, startLine: number, endLine: number, content: string): string {
  const sanitizedFile = file.replace(/[\/\\]/g, '_');
  const hash = createHash('sha256').update(content).digest('hex');
  return `${corpus}_${sanitizedFile}_${startLine}_${endLine}_${hash}`;
}

function makeChunk(corpus: string, file: string, startLine: number, endLine: number, content: string): CodeChunk {
  return { id: createChunkId(corpus, file, startLine, endLine, content), corpus, file, start_line: startLine, end_line: endLine, content };
}

export function chunkFixedWindows(
  corpus: string,
  file: string,
  lines: string[],
  windowSize = 60,
  overlap = 15
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const totalLines = lines.length;

  if (totalLines === 0) {
    return chunks;
  }

  if (totalLines <= windowSize) {
    const content = lines.join('\n');
    return [
      {
        ...makeChunk(corpus, file, 1, totalLines, content)
      }
    ];
  }

  let start = 0;
  const step = Math.max(1, windowSize - overlap);

  while (start < totalLines) {
    const end = Math.min(start + windowSize, totalLines);
    const chunkLines = lines.slice(start, end);
    const content = chunkLines.join('\n');

    chunks.push(makeChunk(corpus, file, start + 1, end, content));

    if (end >= totalLines) {
      break;
    }
    start += step;
  }

  return chunks;
}

export function chunkPython(corpus: string, file: string, lines: string[]): CodeChunk[] {
  const totalLines = lines.length;
  if (totalLines <= 60) {
    return chunkFixedWindows(corpus, file, lines);
  }

  const boundaryRegex = /^(?:async\s+)?def\s+([A-Za-z0-9_]+)|class\s+([A-Za-z0-9_]+)/;
  const boundaries: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (boundaryRegex.test(lines[i])) {
      boundaries.push(i);
    }
  }

  if (boundaries.length <= 1) {
    return chunkFixedWindows(corpus, file, lines);
  }

  const chunks: CodeChunk[] = [];

  if (boundaries[0] > 0) {
    const preludeLines = lines.slice(0, boundaries[0]);
    if (preludeLines.length > 5) {
      chunks.push(...chunkFixedWindows(corpus, file, preludeLines));
    }
  }

  for (let b = 0; b < boundaries.length; b++) {
    const startIdx = boundaries[b];
    const endIdx = b + 1 < boundaries.length ? boundaries[b + 1] : totalLines;
    const blockLines = lines.slice(startIdx, endIdx);

    if (blockLines.length > 120) {
      const subChunks = chunkFixedWindows(corpus, file, blockLines);
      for (const sc of subChunks) {
        chunks.push({
          ...makeChunk(corpus, file, startIdx + sc.start_line, startIdx + sc.end_line, sc.content)
        });
      }
    } else {
      chunks.push(makeChunk(corpus, file, startIdx + 1, endIdx, blockLines.join('\n')));
    }
  }

  return chunks;
}

export function chunkJavaScript(corpus: string, file: string, lines: string[]): CodeChunk[] {
  const totalLines = lines.length;
  if (totalLines <= 60) {
    return chunkFixedWindows(corpus, file, lines);
  }

  const boundaryRegex = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function(?:\s+([A-Za-z0-9_$]+))?|^class\s+([A-Za-z0-9_$]+)|^[A-Za-z0-9_$.]+\.(?:prototype\.)?[A-Za-z0-9_$]+\s*=\s*(?:async\s*)?function/;
  const boundaries: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (boundaryRegex.test(lines[i].trimStart())) {
      boundaries.push(i);
    }
  }

  if (boundaries.length <= 1) {
    return chunkFixedWindows(corpus, file, lines);
  }

  const chunks: CodeChunk[] = [];

  if (boundaries[0] > 0) {
    const prelude = lines.slice(0, boundaries[0]);
    if (prelude.length > 5) {
      chunks.push(...chunkFixedWindows(corpus, file, prelude));
    }
  }

  for (let b = 0; b < boundaries.length; b++) {
    const startIdx = boundaries[b];
    const endIdx = b + 1 < boundaries.length ? boundaries[b + 1] : totalLines;
    const blockLines = lines.slice(startIdx, endIdx);

    if (blockLines.length > 120) {
      const subChunks = chunkFixedWindows(corpus, file, blockLines);
      for (const sc of subChunks) {
        chunks.push({
          ...makeChunk(corpus, file, startIdx + sc.start_line, startIdx + sc.end_line, sc.content)
        });
      }
    } else {
      chunks.push(makeChunk(corpus, file, startIdx + 1, endIdx, blockLines.join('\n')));
    }
  }

  return chunks;
}

function embeddedText(file: string, start: number, end: number, content: string): string {
  return `File: ${file} (lines ${start}-${end})\n${content}`;
}

function splitOversizedChunk(chunk: CodeChunk, options: ChunkingOptions): ChunkingResult {
  const lines = chunk.content.split('\n');
  const output: CodeChunk[] = [];
  let oversizedLineCount = 0;
  let start = 0;
  while (start < lines.length) {
    let end = start;
    let lastPreferred = -1;
    while (end < lines.length) {
      const candidate = lines.slice(start, end + 1).join('\n');
      const startLine = chunk.start_line + start;
      const endLine = chunk.start_line + end;
      if (estimateEmbeddingTokens(embeddedText(chunk.file, startLine, endLine, candidate)) <= options.maxTokens) {
        if (lines[end].trim() === '' || /[;{}:]\s*$/.test(lines[end])) lastPreferred = end;
        end++;
        continue;
      }
      break;
    }
    if (end === start) {
      oversizedLineCount++;
      const prefix = embeddedText(chunk.file, chunk.start_line + start, chunk.start_line + start, '');
      const size = Math.max(1, options.maxTokens * 4 - prefix.length);
      for (let offset = 0; offset < lines[start].length; offset += size) {
        const part = lines[start].slice(offset, offset + size);
        output.push(makeChunk(chunk.corpus, chunk.file, chunk.start_line + start, chunk.start_line + start, part));
      }
      start++;
      continue;
    }
    const chosenEnd = lastPreferred >= start ? lastPreferred : end - 1;
    const contentPart = lines.slice(start, chosenEnd + 1).join('\n');
    output.push(makeChunk(chunk.corpus, chunk.file, chunk.start_line + start, chunk.start_line + chosenEnd, contentPart));
    if (chosenEnd >= lines.length - 1) break;
    start = Math.max(start + 1, chosenEnd + 1 - options.overlapLines);
  }
  return { chunks: output, oversizedLineCount };
}

export function chunkFileWithSummary(corpus: string, relPath: string, content: string, options: ChunkingOptions): ChunkingResult {
  const normalized = relPath.replace(/\\/g, '/');
  const lines = content.split(/\r?\n/);
  const ext = path.extname(normalized).toLowerCase();
  const base = ext === '.py' ? chunkPython(corpus, normalized, lines) : ['.js', '.ts', '.mjs', '.cjs'].includes(ext) ? chunkJavaScript(corpus, normalized, lines) : chunkFixedWindows(corpus, normalized, lines);
  const chunks: CodeChunk[] = [];
  let oversizedLineCount = 0;
  for (const chunk of base) {
    if (estimateEmbeddingTokens(embeddedText(normalized, chunk.start_line, chunk.end_line, chunk.content)) <= options.maxTokens) chunks.push(chunk);
    else {
      const split = splitOversizedChunk(chunk, options);
      chunks.push(...split.chunks);
      oversizedLineCount += split.oversizedLineCount;
    }
  }
  return { chunks, oversizedLineCount };
}

export function chunkFile(corpus: string, relPath: string, content: string, options?: ChunkingOptions): CodeChunk[] {
  if (options) return chunkFileWithSummary(corpus, relPath, content, options).chunks;
  const normalized = relPath.replace(/\\/g, '/');
  const lines = content.split(/\r?\n/);
  const ext = path.extname(normalized).toLowerCase();
  if (ext === '.py') return chunkPython(corpus, normalized, lines);
  if (['.js', '.ts', '.mjs', '.cjs'].includes(ext)) return chunkJavaScript(corpus, normalized, lines);
  return chunkFixedWindows(corpus, normalized, lines);
}
