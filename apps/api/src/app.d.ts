import { Express } from 'express';
import pg from 'pg';
import { CorporaConfig } from '@greptrace/core';
export interface AppOptions {
    pool: pg.Pool;
    corporaConfig: CorporaConfig;
    rootDir: string;
    corsOrigin?: string;
}
export declare function createApp(options: AppOptions): Express;
//# sourceMappingURL=app.d.ts.map