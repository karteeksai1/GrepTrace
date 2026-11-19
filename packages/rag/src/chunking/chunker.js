import path from 'node:path';
function createChunkId(corpus, file, startLine, endLine) {
    const sanitizedFile = file.replace(/[\/\\]/g, '_');
    return `${corpus}_${sanitizedFile}_${startLine}_${endLine}`;
}
export function chunkFixedWindows(corpus, file, lines, windowSize = 60, overlap = 15) {
    const chunks = [];
    const totalLines = lines.length;
    if (totalLines === 0) {
        return chunks;
    }
    if (totalLines <= windowSize) {
        const content = lines.join('\n');
        return [
            {
                id: createChunkId(corpus, file, 1, totalLines),
                corpus,
                file,
                start_line: 1,
                end_line: totalLines,
                content
            }
        ];
    }
    let start = 0;
    const step = Math.max(1, windowSize - overlap);
    while (start < totalLines) {
        const end = Math.min(start + windowSize, totalLines);
        const chunkLines = lines.slice(start, end);
        const content = chunkLines.join('\n');
        chunks.push({
            id: createChunkId(corpus, file, start + 1, end),
            corpus,
            file,
            start_line: start + 1,
            end_line: end,
            content
        });
        if (end >= totalLines) {
            break;
        }
        start += step;
    }
    return chunks;
}
export function chunkPython(corpus, file, lines) {
    const totalLines = lines.length;
    if (totalLines <= 60) {
        return chunkFixedWindows(corpus, file, lines);
    }
    const boundaryRegex = /^(?:async\s+)?def\s+([A-Za-z0-9_]+)|class\s+([A-Za-z0-9_]+)/;
    const boundaries = [];
    for (let i = 0; i < lines.length; i++) {
        if (boundaryRegex.test(lines[i])) {
            boundaries.push(i);
        }
    }
    if (boundaries.length <= 1) {
        return chunkFixedWindows(corpus, file, lines);
    }
    const chunks = [];
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
                    id: createChunkId(corpus, file, startIdx + sc.start_line, startIdx + sc.end_line),
                    corpus,
                    file,
                    start_line: startIdx + sc.start_line,
                    end_line: startIdx + sc.end_line,
                    content: sc.content
                });
            }
        }
        else {
            chunks.push({
                id: createChunkId(corpus, file, startIdx + 1, endIdx),
                corpus,
                file,
                start_line: startIdx + 1,
                end_line: endIdx,
                content: blockLines.join('\n')
            });
        }
    }
    return chunks;
}
export function chunkJavaScript(corpus, file, lines) {
    const totalLines = lines.length;
    if (totalLines <= 60) {
        return chunkFixedWindows(corpus, file, lines);
    }
    const boundaryRegex = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function(?:\s+([A-Za-z0-9_$]+))?|^class\s+([A-Za-z0-9_$]+)|^[A-Za-z0-9_$.]+\.(?:prototype\.)?[A-Za-z0-9_$]+\s*=\s*(?:async\s*)?function/;
    const boundaries = [];
    for (let i = 0; i < lines.length; i++) {
        if (boundaryRegex.test(lines[i].trimStart())) {
            boundaries.push(i);
        }
    }
    if (boundaries.length <= 1) {
        return chunkFixedWindows(corpus, file, lines);
    }
    const chunks = [];
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
                    id: createChunkId(corpus, file, startIdx + sc.start_line, startIdx + sc.end_line),
                    corpus,
                    file,
                    start_line: startIdx + sc.start_line,
                    end_line: startIdx + sc.end_line,
                    content: sc.content
                });
            }
        }
        else {
            chunks.push({
                id: createChunkId(corpus, file, startIdx + 1, endIdx),
                corpus,
                file,
                start_line: startIdx + 1,
                end_line: endIdx,
                content: blockLines.join('\n')
            });
        }
    }
    return chunks;
}
export function chunkFile(corpus, relPath, content) {
    const normalized = relPath.replace(/\\/g, '/');
    const lines = content.split(/\r?\n/);
    const ext = path.extname(normalized).toLowerCase();
    if (ext === '.py') {
        return chunkPython(corpus, normalized, lines);
    }
    if (['.js', '.ts', '.mjs', '.cjs'].includes(ext)) {
        return chunkJavaScript(corpus, normalized, lines);
    }
    return chunkFixedWindows(corpus, normalized, lines);
}
//# sourceMappingURL=chunker.js.map