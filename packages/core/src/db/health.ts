import pg from 'pg';
import { getAppDatabaseUrl, createPool, warmUpDatabase } from './client.js';

export interface HealthReport {
  connected: boolean;
  warmupMs: number;
  tables: string[];
}

export async function checkDatabaseHealth(): Promise<HealthReport> {
  const appUrl = getAppDatabaseUrl();
  const pool = createPool(appUrl, 1);

  try {
    const warmupMs = await warmUpDatabase(pool);
    const client = await pool.connect();

    try {
      const tablesRes = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      const tables = tablesRes.rows.map((r) => r.table_name);

      return {
        connected: true,
        warmupMs,
        tables
      };
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('health.ts') || process.argv[1]?.endsWith('health.js')) {
  checkDatabaseHealth()
    .then((report) => {
      process.stdout.write(`Database health check passed:\n`);
      process.stdout.write(`- Connected: ${report.connected}\n`);
      process.stdout.write(`- Warmup latency: ${report.warmupMs}ms\n`);
      process.stdout.write(`- Tables: ${report.tables.join(', ') || 'none'}\n`);
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`Database health check failed: ${err.message}\n`);
      process.exit(1);
    });
}
