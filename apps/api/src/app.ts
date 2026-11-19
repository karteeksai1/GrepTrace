import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import pg from 'pg';
import { CorporaConfig } from '@greptrace/core';
import { createBatchesRouter } from './routes/batches.js';
import { createRunsRouter } from './routes/runs.js';
import { createCorporaRouter } from './routes/corpora.js';
import { sendError } from './utils/errors.js';

export interface AppOptions {
  pool: pg.Pool;
  corporaConfig: CorporaConfig;
  rootDir: string;
  corsOrigin?: string;
}

export function createApp(options: AppOptions): Express {
  const app = express();

  const corsOrigin = options.corsOrigin || process.env.CORS_ORIGIN || '*';
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/batches', createBatchesRouter(options.pool, options.rootDir));
  app.use('/api/runs', createRunsRouter(options.pool, options.rootDir));
  app.use('/api/corpora', createCorporaRouter(options.corporaConfig, options.rootDir));

  app.use((_req: Request, res: Response) => {
    sendError(res, 404, 'Endpoint not found', 'NOT_FOUND');
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
  });

  return app;
}
