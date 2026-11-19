import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pg;
export function getAppDatabaseUrl() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL is not defined in environment');
    }
    return url;
}
export function getDirectDatabaseUrl() {
    const url = process.env.DATABASE_URL_DIRECT;
    if (!url) {
        throw new Error('DATABASE_URL_DIRECT is not defined in environment');
    }
    return url;
}
export function createPool(connectionString, maxConnections = 10) {
    return new Pool({
        connectionString,
        max: maxConnections,
        ssl: { rejectUnauthorized: false }
    });
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function executeWithRetry(action, maxRetries = 5, initialDelayMs = 500) {
    let attempt = 0;
    let currentDelay = initialDelayMs;
    while (attempt < maxRetries) {
        try {
            return await action();
        }
        catch (error) {
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
export async function warmUpDatabase(pool) {
    const start = Date.now();
    await executeWithRetry(async () => {
        const client = await pool.connect();
        try {
            await client.query('SELECT 1');
        }
        finally {
            client.release();
        }
    });
    return Date.now() - start;
}
//# sourceMappingURL=client.js.map