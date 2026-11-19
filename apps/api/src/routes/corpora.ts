import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, Request, Response } from 'express';
import { CorporaConfig } from '@greptrace/core';
import { sendError } from '../utils/errors.js';

export function createCorporaRouter(corporaConfig: CorporaConfig, rootDir: string): Router {
  const router = Router();

  router.get('/:corpus/file', async (req: Request, res: Response) => {
    try {
      const corpusName = req.params.corpus;
      const corpusSpec = corporaConfig.corpora[corpusName];
      if (!corpusSpec) {
        sendError(res, 404, `Corpus '${corpusName}' not found in configuration`, 'CORPUS_NOT_FOUND');
        return;
      }

      const filePathQuery = req.query.path;
      if (!filePathQuery || typeof filePathQuery !== 'string') {
        sendError(res, 400, 'Query parameter "path" is required', 'INVALID_PARAM_PATH');
        return;
      }

      const corpusRoot = path.resolve(rootDir, corpusSpec.path);
      const targetPath = path.resolve(corpusRoot, filePathQuery);
      const relToRoot = path.relative(corpusRoot, targetPath);

      if (relToRoot.startsWith('..') || path.isAbsolute(filePathQuery) && !targetPath.startsWith(corpusRoot)) {
        sendError(res, 403, 'Path traversal outside corpus root is rejected', 'PATH_TRAVERSAL_DETECTED');
        return;
      }

      let realTargetPath: string;
      try {
        realTargetPath = await fs.realpath(targetPath);
      } catch {
        sendError(res, 404, `File '${filePathQuery}' not found in corpus '${corpusName}'`, 'FILE_NOT_FOUND');
        return;
      }

      const realCorpusRoot = await fs.realpath(corpusRoot);
      const realRel = path.relative(realCorpusRoot, realTargetPath);
      if (realRel.startsWith('..') || !realTargetPath.startsWith(realCorpusRoot)) {
        sendError(res, 403, 'Symlink escaping corpus root is rejected', 'SYMLINK_ESCAPE_DETECTED');
        return;
      }

      const stat = await fs.stat(realTargetPath);
      if (!stat.isFile()) {
        sendError(res, 400, `Target '${filePathQuery}' is not a regular file`, 'NOT_A_FILE');
        return;
      }

      const rawContent = await fs.readFile(realTargetPath, 'utf8');
      const allLines = rawContent.split(/\r?\n/);
      const totalLines = allLines.length;

      let startLine = 1;
      if (req.query.start) {
        const parsedStart = parseInt(String(req.query.start), 10);
        if (isNaN(parsedStart) || parsedStart < 1) {
          sendError(res, 400, 'Parameter "start" must be an integer >= 1', 'INVALID_PARAM_START');
          return;
        }
        startLine = parsedStart;
      }

      let endLine = totalLines;
      if (req.query.end) {
        const parsedEnd = parseInt(String(req.query.end), 10);
        if (isNaN(parsedEnd) || parsedEnd < startLine) {
          sendError(res, 400, 'Parameter "end" must be an integer >= start', 'INVALID_PARAM_END');
          return;
        }
        if (parsedEnd - startLine + 1 > 400) {
          sendError(res, 400, 'Requested line range exceeds maximum allowed limit of 400 lines', 'RANGE_EXCEEDS_CAP');
          return;
        }
        endLine = Math.min(parsedEnd, totalLines);
      } else {
        endLine = Math.min(totalLines, startLine + 399);
      }

      const selectedLines = allLines.slice(startLine - 1, endLine);

      res.json({
        corpus: corpusName,
        path: relToRoot.replace(/\\/g, '/'),
        start_line: startLine,
        end_line: endLine,
        total_lines: totalLines,
        content: selectedLines.join('\n'),
        lines: selectedLines
      });
    } catch (err) {
      sendError(res, 500, (err as Error).message, 'FILE_READ_FAILED');
    }
  });

  return router;
}
