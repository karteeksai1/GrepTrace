import { CodeChunk } from './types.js';
export declare function chunkFixedWindows(corpus: string, file: string, lines: string[], windowSize?: number, overlap?: number): CodeChunk[];
export declare function chunkPython(corpus: string, file: string, lines: string[]): CodeChunk[];
export declare function chunkJavaScript(corpus: string, file: string, lines: string[]): CodeChunk[];
export declare function chunkFile(corpus: string, relPath: string, content: string): CodeChunk[];
//# sourceMappingURL=chunker.d.ts.map