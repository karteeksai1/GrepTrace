import { getAppDatabaseUrl, createPool, warmUpDatabase } from './client.js';
export async function checkDatabaseHealth() {
    const appUrl = getAppDatabaseUrl();
    const pool = createPool(appUrl, 1);
    try {
        const warmupMs = await warmUpDatabase(pool);
        const client = await pool.connect();
        try {
            const extRes = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
            const vectorExtension = extRes.rows.length > 0;
            const tablesRes = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
            const tables = tablesRes.rows.map((r) => r.table_name);
            return {
                connected: true,
                warmupMs,
                vectorExtension,
                tables
            };
        }
        finally {
            client.release();
        }
    }
    finally {
        await pool.end();
    }
}
if (process.argv[1]?.endsWith('health.ts') || process.argv[1]?.endsWith('health.js')) {
    checkDatabaseHealth()
        .then((report) => {
        process.stdout.write(`Database health check passed:\n`);
        process.stdout.write(`- Connected: ${report.connected}\n`);
        process.stdout.write(`- Warmup latency: ${report.warmupMs}ms\n`);
        process.stdout.write(`- Vector extension installed: ${report.vectorExtension}\n`);
        process.stdout.write(`- Tables: ${report.tables.join(', ') || 'none'}\n`);
        process.exit(0);
    })
        .catch((err) => {
        process.stderr.write(`Database health check failed: ${err.message}\n`);
        process.exit(1);
    });
}
//# sourceMappingURL=health.js.map