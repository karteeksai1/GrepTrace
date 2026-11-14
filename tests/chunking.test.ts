import { describe, expect, it } from 'vitest';
import { chunkFile, chunkFixedWindows, chunkJavaScript, chunkPython } from '@greptrace/rag';

describe('RAG Chunking', () => {
  it('creates fixed windows with overlap for generic text', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    const chunks = chunkFixedWindows('test_corpus', 'file.txt', lines, 40, 10);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].start_line).toBe(1);
    expect(chunks[0].end_line).toBe(40);
    expect(chunks[1].start_line).toBe(31);
    expect(chunks[1].end_line).toBe(70);
  });

  it('keeps files shorter than window size as single chunk', () => {
    const lines = ['line 1', 'line 2', 'line 3'];
    const chunks = chunkFixedWindows('test_corpus', 'small.txt', lines, 50, 10);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].start_line).toBe(1);
    expect(chunks[0].end_line).toBe(3);
  });

  it('splits JavaScript files by function definitions', () => {
    const jsCode = `
const x = 1;

function firstFunction() {
  const a = 10;
  return a;
}

function secondFunction() {
  const b = 20;
  return b;
}
    `.trim().split('\n');

    const chunks = chunkJavaScript('express', 'lib/test.js', jsCode);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.every((c) => c.start_line <= c.end_line)).toBe(true);
  });

  it('splits Python files by def and class blocks', () => {
    const pyCode = Array.from({ length: 80 }, (_, i) => {
      if (i === 10) return 'def first_helper():';
      if (i === 40) return 'class MyService:';
      return `    pass_${i} = ${i}`;
    });

    const chunks = chunkPython('fastapi', 'app/main.py', pyCode);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].corpus).toBe('fastapi');
    expect(chunks[0].file).toBe('app/main.py');
  });

  it('chunkFile dispatches according to file extension', () => {
    const pyContent = 'def hello():\n    return "world"\n';
    const pyChunks = chunkFile('fastapi', 'test.py', pyContent);
    expect(pyChunks).toHaveLength(1);
    expect(pyChunks[0].file).toBe('test.py');

    const jsContent = 'function hello() {\n  return "world";\n}\n';
    const jsChunks = chunkFile('express', 'test.js', jsContent);
    expect(jsChunks).toHaveLength(1);
    expect(jsChunks[0].file).toBe('test.js');
  });
});
