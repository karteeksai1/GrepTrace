import fs from 'node:fs/promises';
import path from 'node:path';

export interface SandboxCheckResult {
  allowed: boolean;
  resolvedPath?: string;
  relativePath?: string;
  error?: string;
}

const EXCLUDED_PATTERNS = [
  /(?:^|\/)\.git(?:\/|$)/,
  /(?:^|\/)node_modules(?:\/|$)/,
  /\.lock$/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf',
  '.zip', '.tar', '.gz', '.tgz', '.wasm', '.bin',
  '.exe', '.dylib', '.so', '.pyc', '.pyd'
]);

export class CorpusSandbox {
  private corpusRoot: string;
  private maxOutputBytes: number;

  constructor(corpusRoot: string, maxOutputBytes: number = 12000) {
    this.corpusRoot = path.resolve(corpusRoot);
    this.maxOutputBytes = maxOutputBytes;
  }

  getCorpusRoot(): string {
    return this.corpusRoot;
  }

  getMaxOutputBytes(): number {
    return this.maxOutputBytes;
  }

  isExcluded(relPath: string): boolean {
    const normalized = relPath.replace(/\\/g, '/');
    if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return true;
    }
    const ext = path.extname(normalized).toLowerCase();
    return BINARY_EXTENSIONS.has(ext);
  }

  async checkPath(targetPath: string): Promise<SandboxCheckResult> {
    if (!targetPath || typeof targetPath !== 'string') {
      return { allowed: false, error: 'Path must be a non-empty string.' };
    }

    const resolved = path.resolve(this.corpusRoot, targetPath);
    const rel = path.relative(this.corpusRoot, resolved);

    if (rel.startsWith('..') || (path.isAbsolute(targetPath) && !resolved.startsWith(this.corpusRoot))) {
      return {
        allowed: false,
        error: `Access denied: path '${targetPath}' escapes the corpus root directory.`
      };
    }

    if (this.isExcluded(rel)) {
      return {
        allowed: false,
        error: `Access denied: '${targetPath}' is in an excluded or binary file pattern.`
      };
    }

    try {
      const real = await fs.realpath(resolved);
      const realRel = path.relative(this.corpusRoot, real);
      if (realRel.startsWith('..')) {
        return {
          allowed: false,
          error: `Access denied: symlink '${targetPath}' resolves outside the corpus root.`
        };
      }
      return {
        allowed: true,
        resolvedPath: real,
        relativePath: rel.replace(/\\/g, '/')
      };
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        return {
          allowed: true,
          resolvedPath: resolved,
          relativePath: rel.replace(/\\/g, '/')
        };
      }
      return {
        allowed: false,
        error: `Cannot resolve path '${targetPath}': ${nodeErr.message}`
      };
    }
  }

  truncateOutput(text: string, omittedMessage?: string): { output: string; truncated: boolean } {
    const totalBytes = Buffer.byteLength(text, 'utf8');
    if (totalBytes <= this.maxOutputBytes) {
      return { output: text, truncated: false };
    }

    const buf = Buffer.from(text, 'utf8');
    let endIdx = Math.min(this.maxOutputBytes - 256, buf.length);
    while (endIdx > 0 && (buf[endIdx] & 0xc0) === 0x80) {
      endIdx--;
    }

    const truncatedSlice = buf.subarray(0, endIdx).toString('utf8');
    const note = omittedMessage
      ? `\n\n[TRUNCATED: Output exceeded budget of ${this.maxOutputBytes} bytes. ${omittedMessage} Please narrow your query.]`
      : `\n\n[TRUNCATED: Output exceeded budget of ${this.maxOutputBytes} bytes. Please narrow your query.]`;

    return {
      output: truncatedSlice + note,
      truncated: true
    };
  }
}
