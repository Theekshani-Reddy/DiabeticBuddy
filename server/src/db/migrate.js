import { readdir, readFile } from 'node:fs/promises';
import pool from './pool.js';

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));
    const directory = new URL('./migrations/', import.meta.url);
    const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    const pending = files.filter((name) => !applied.has(name));

    for (const name of pending) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    }

    await client.query('COMMIT');
    console.log(pending.length ? `Applied: ${pending.join(', ')}` : 'Database is up to date.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

try {
  await migrate();
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
