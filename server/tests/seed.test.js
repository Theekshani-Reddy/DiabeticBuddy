import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { demoAccount, demoReadings, seedDemo } from '../src/db/demo.js';
import { isValidDate } from '../src/readings/validation.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a separate PostgreSQL test database.');

const schemaSql = await readFile(new URL('../src/db/migrations/001_initial.sql', import.meta.url), 'utf8');
let client;
let schema;

beforeEach(async () => {
  client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  schema = `test_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  await client.query(schemaSql);
});

afterEach(async () => {
  if (client) {
    try {
      await client.query('SET search_path TO public');
      if (schema) await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await client.end();
    }
  }
});

test('creates a demo user with a bcrypt password and readings across all report periods', async () => {
  const result = await seedDemo(client, '2026-11-06');
  const { rows } = await client.query('SELECT * FROM users WHERE id = $1', [result.userId]);
  assert.equal(rows[0].email, demoAccount.email);
  assert.notEqual(rows[0].password_hash, demoAccount.password);
  assert.equal(await bcrypt.compare(demoAccount.password, rows[0].password_hash), true);
  const samples = await client.query('SELECT date::text, slot, value FROM readings WHERE user_id = $1', [result.userId]);
  assert.equal(result.inserted, samples.rows.length);
  const today = samples.rows.filter((reading) => reading.date === '2026-11-06');
  assert.equal(today.length, 3);
  assert.equal(today.reduce((sum, reading) => sum + reading.value, 0) / today.length, 134);
  assert.ok(samples.rows.some((reading) => reading.date.startsWith('2026-10')));
  assert.ok(samples.rows.some((reading) => reading.date === '2026-11-01'));
});

test('rerunning preserves the demo password, edited readings, and other users', async () => {
  const first = await seedDemo(client, '2026-11-06');
  const originalUser = await client.query('SELECT password_hash FROM users WHERE id = $1', [first.userId]);
  await client.query("UPDATE readings SET value = 121 WHERE user_id = $1 AND date = '2026-11-06' AND slot = 'morning'", [first.userId]);
  await client.query("INSERT INTO users (name, email, password_hash) VALUES ('Other Patient', 'other@example.test', 'test-hash-placeholder')");
  const before = await client.query('SELECT * FROM readings ORDER BY id');
  const second = await seedDemo(client, '2026-11-06');
  const after = await client.query('SELECT * FROM readings ORDER BY id');
  const userAfter = await client.query('SELECT password_hash FROM users WHERE id = $1', [first.userId]);
  assert.equal(second.inserted, 0);
  assert.equal(second.userId, first.userId);
  assert.deepEqual(after.rows, before.rows);
  assert.equal(userAfter.rows[0].password_hash, originalUser.rows[0].password_hash);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM users WHERE email = 'other@example.test'")).rows[0].count, 1);
});

test('refuses to overwrite an existing account using the demo email with a different password', async () => {
  const hash = await bcrypt.hash('Anotherpassword!42', 12);
  await client.query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)', ['Existing Patient', demoAccount.email, hash]);
  await assert.rejects(seedDemo(client, '2026-11-06'), /demo email already has a different password/);
  const { rows } = await client.query('SELECT name, password_hash FROM users');
  assert.deepEqual(rows, [{ name: 'Existing Patient', password_hash: hash }]);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM readings')).rows[0].count, 0);
});

test('sample dates remain valid and within four slots/day at month/year/leap-year boundaries', () => {
  for (const today of ['2026-11-06', '2027-01-01', '2024-03-01', '2026-11-02']) {
    const rows = demoReadings(today);
    const keys = new Set();
    const perDay = new Map();
    for (const reading of rows) {
      assert.equal(isValidDate(reading.date), true);
      assert.ok(reading.date <= today);
      assert.ok(Number.isInteger(reading.value) && reading.value >= 40 && reading.value <= 600);
      const key = `${reading.date}:${reading.slot}`;
      assert.equal(keys.has(key), false);
      keys.add(key);
      perDay.set(reading.date, (perDay.get(reading.date) || 0) + 1);
    }
    assert.equal(perDay.get(today), 3);
    assert.ok([...perDay.values()].every((count) => count <= 4));
    if (today === '2024-03-01') assert.ok(rows.some((reading) => reading.date === '2024-02-29'));
  }
});
