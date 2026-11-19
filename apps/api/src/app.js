import express from 'express';
import cors from 'cors';
import { createBatchesRouter } from './routes/batches.js';
import { createRunsRouter } from './routes/runs.js';
import { createCorporaRouter } from './routes/corpora.js';
import { sendError } from './utils/errors.js';
export function createApp(options) {
    const app = express();
    const corsOrigin = options.corsOrigin || process.env.CORS_ORIGIN || '*';
    app.use(cors({ origin: corsOrigin }));
    app.use(express.json());
    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    app.use('/api/batches', createBatchesRouter(options.pool, options.rootDir));
    app.use('/api/runs', createRunsRouter(options.pool, options.rootDir));
    app.use('/api/corpora', createCorporaRouter(options.corporaConfig, options.rootDir));
    app.use((_req, res) => {
        sendError(res, 404, 'Endpoint not found', 'NOT_FOUND');
    });
    app.use((err, _req, res, _next) => {
        sendError(res, 500, err.message, 'INTERNAL_SERVER_ERROR');
    });
    return app;
}
//# sourceMappingURL=app.js.map