import fs from 'node:fs/promises';
import path from 'node:path';
import { chunkFile } from '../chunking/chunker.js';
const ALLOWED_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs', '.py']);
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '__pycache__', '.pytest_cache', 'tests', 'test']);
async function walkDir(dir, baseDir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) {
                const subFiles = await walkDir(path.join(dir, entry.name), baseDir);
                files.push(...subFiles);
            }
        }
        else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ALLOWED_EXTENSIONS.has(ext)) {
                const fullPath = path.join(dir, entry.name);
                const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
                files.push(rel);
            }
        }
    }
    return files;
}
export async function scanAndChunkCorpus(corpusName, corpusRoot) {
    const relFiles = await walkDir(corpusRoot, corpusRoot);
    const allChunks = [];
    for (const relFile of relFiles) {
        const fullPath = path.join(corpusRoot, relFile);
        const content = await fs.readFile(fullPath, 'utf8');
        const chunks = chunkFile(corpusName, relFile, content);
        allChunks.push(...chunks);
    }
    return allChunks;
}
//# sourceMappingURL=scanner.js.map