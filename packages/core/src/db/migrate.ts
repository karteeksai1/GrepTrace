import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { getDirectDatabaseUrl, createPool, executeWithRetry } from './client.js';

interface MigrationFile {
  name: string;
  fullPath: string;
}

async function getMigrationFiles(dirPath: string): Promise<MigrationFile[]> {
  const entries = await fs.readdir(dirPath);
  const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort();
  return sqlFiles.map((file) => ({
    name: file,
    fullPath: path.join(dirPath, file)
  }));
}

async function ensureMigrationTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client: pg.PoolClient): Promise<Set<string>> {
  const result = await client.query('SELECT name FROM schema_migrations');
  return new Set(result.rows.map((row) => row.name));
}

async function applyMigration(client: pg.PoolClient, file: MigrationFile): Promise<void> {
  const sql = await fs.readFile(file.fullPath, 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file.name]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function runMigrations(migrationsDirectory?: string): Promise<string[]> {
  const targetDir = migrationsDirectory ?? path.resolve(process.cwd(), 'migrations');
  const directUrl = getDirectDatabaseUrl();
  const pool = createPool(directUrl, 1);

  try {
    return await executeWithRetry(async () => {
      const client = await pool.connect();
      try {
        await ensureMigrationTable(client);
        const applied = await getAppliedMigrations(client);
        const files = await getMigrationFiles(targetDir);
        const newlyApplied: string[] = [];

        for (const file of files) {
          if (!applied.has(file.name)) {
            await applyMigration(client, file);
            newlyApplied.push(file.name);
          }
        }
        return newlyApplied;
      } finally {
        client.release();
      }
    });
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then((applied) => {
      process.stdout.write(`Migrations finished. Applied: ${applied.length ? applied.join(', ') : 'none (already up to date)'}\n`);
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`Migration failed: ${err.message}\n`);
      process.exit(1);
    });
}
