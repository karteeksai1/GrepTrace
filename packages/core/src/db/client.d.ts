import pg from 'pg';
export interface DbConfig {
    connectionString?: string;
    maxRetries?: number;
    initialDelayMs?: number;
}
export declare function getAppDatabaseUrl(): string;
export declare function getDirectDatabaseUrl(): string;
export declare function createPool(connectionString: string, maxConnections?: number): pg.Pool;
export declare function executeWithRetry<T>(action: () => Promise<T>, maxRetries?: number, initialDelayMs?: number): Promise<T>;
export declare function warmUpDatabase(pool: pg.Pool): Promise<number>;
//# sourceMappingURL=client.d.ts.map