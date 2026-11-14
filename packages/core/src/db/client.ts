import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export interface DbConfig {
  connectionString?: string;
  maxRetries?: number;
  initialDelayMs?: number;
}

export function getAppDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not defined in environment');
  }
  return url;
}

export function getDirectDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_DIRECT;
  if (!url) {
    throw new Error('DATABASE_URL_DIRECT is not defined in environment');
  }
  return url;
}

export function createPool(connectionString: string, maxConnections: number = 10): pg.Pool {
  return new Pool({
    connectionString,
    max: maxConnections,
    ssl: { rejectUnauthorized: false }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeWithRetry<T>(
  action: () => Promise<T>,
  maxRetries: number = 5,
  initialDelayMs: number = 500
): Promise<T> {
  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      return await action();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }
      await delay(currentDelay);
      currentDelay *= 2;
    }
  }

  throw new Error('Retry limit reached');
}

export async function warmUpDatabase(pool: pg.Pool): Promise<number> {
  const start = Date.now();
  await executeWithRetry(async () => {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  });
  return Date.now() - start;
}
