import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import pg from 'pg';

// Each test creates its own schema inside a transaction and rolls it back.
// The application database is never used as a fallback.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a separate PostgreSQL test database.');
}

const schemaSql = await readFile(new URL('../src/db/migrations/001_initial.sql', import.meta.url), 'utf8');
let client;
let userId;

beforeEach(async () => {
  client = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL,
    connectionTimeoutMillis: 5000,
    options: '-c timezone=Asia/Kolkata',
  });
  await client.connect();
  await client.query('BEGIN');
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}`);
  await client.query(schemaSql);
  const { rows } = await client.query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Test Patient', 'patient@example.test', 'test-hash-placeholder'],
  );
  userId = rows[0].id;
});

afterEach(async () => {
  if (client) {
    try {
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  }
});

function addReading(slot = 'morning', value = 100, owner = userId) {
  return client.query(
    'INSERT INTO readings (user_id, date, slot, value) VALUES ($1, $2, $3, $4)',
    [owner, '2026-10-15', slot, value],
  );
}

test('rejects a second reading for the same user, date, and slot', async () => {
  await addReading();
  await assert.rejects(addReading(), { code: '23505', constraint: 'readings_user_date_slot_unique' });
});

test('allows different users to record the same date and slot', async () => {
  const { rows } = await client.query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Another Patient', 'another@example.test', 'test-hash-placeholder'],
  );
  await addReading();
  await addReading('morning', 110, rows[0].id);
  const result = await client.query('SELECT count(*)::int AS count FROM readings');
  assert.equal(result.rows[0].count, 2);
});

test('allows all four slots and rejects a fifth reading that day', async () => {
  for (const slot of ['morning', 'after_breakfast', 'after_lunch', 'after_dinner']) {
    await addReading(slot);
  }
  const { rows } = await client.query('SELECT count(*)::int AS count FROM readings');
  assert.equal(rows[0].count, 4);
  await assert.rejects(addReading(), { code: '23505' });
});

test('rejects an unsupported slot', async () => {
  await assert.rejects(addReading('bedtime'), { code: '23514', constraint: 'readings_slot_check' });
});

for (const value of [39, 601]) {
  test(`rejects glucose value ${value}`, async () => {
    await assert.rejects(addReading('morning', value), { code: '23514', constraint: 'readings_value_check' });
  });
}

test('accepts the inclusive value boundaries, 40 and 600', async () => {
  await addReading('morning', 40);
  await addReading('after_breakfast', 600);
  const { rows } = await client.query('SELECT value FROM readings ORDER BY value');
  assert.deepEqual(rows.map((row) => row.value), [40, 600]);
});

test('rejects a reading without an existing owner', async () => {
  await assert.rejects(addReading('morning', 100, userId + 1000), { code: '23503' });
});

test('treats email addresses as case insensitive for uniqueness', async () => {
  await assert.rejects(
    client.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)',
      ['Duplicate Patient', 'PATIENT@example.test', 'test-hash-placeholder'],
    ),
    { code: '23505', constraint: 'users_email_unique' },
  );
});
