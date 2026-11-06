import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createToken } from '../src/auth/tokens.js';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a separate PostgreSQL test database.');
}

const schemaSql = await readFile(new URL('../src/db/migrations/001_initial.sql', import.meta.url), 'utf8');
const jwtSecret = randomBytes(32).toString('hex');
const reportTypes = ['daily', 'mtd', 'monthly'];
let client;
let app;
let users;
let tokens;

beforeEach(async () => {
  client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  await client.query('BEGIN');
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}`);
  await client.query(schemaSql);
  const { rows } = await client.query(
    `INSERT INTO users (name, email, password_hash) VALUES
      ('First Patient', 'first@example.test', 'test-hash-placeholder'),
      ('Second Patient', 'second@example.test', 'test-hash-placeholder') RETURNING id`,
  );
  users = rows;
  tokens = users.map((user) => createToken(user.id, jwtSecret));
  app = createApp({ db: client, jwtSecret, now: () => new Date('2026-11-06T12:00:00Z') });
});

afterEach(async () => {
  if (client) {
    try { await client.query('ROLLBACK'); }
    finally { await client.end(); }
  }
});

async function add(date, value, slot = 'morning', user = 0) {
  const { rows } = await client.query(
    'INSERT INTO readings (user_id, date, slot, value) VALUES ($1, $2, $3, $4) RETURNING id',
    [users[user].id, date, slot, value],
  );
  return rows[0].id;
}

function getReport(type, date = '2026-10-15', user = 0, targetApp = app) {
  return request(targetApp).get(`/api/reports/${type}${date === null ? '' : `?date=${date}`}`)
    .set('Authorization', `Bearer ${tokens[user]}`);
}

function stats(report) {
  const { highest, lowest, average, count } = report;
  return { highest, lowest, average, count };
}

test('daily reports use only the selected date and include the ordered readings', async () => {
  await add('2026-10-14', 40);
  await add('2026-10-16', 600);
  await add('2026-10-15', 142, 'after_lunch');
  await add('2026-10-15', 112);
  await add('2026-10-15', 148, 'after_breakfast');
  const response = await getReport('daily').expect(200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(stats(response.body), { highest: 148, lowest: 112, average: 134, count: 3 });
  assert.equal(response.body.date, '2026-10-15');
  assert.equal(response.body.startDate, '2026-10-15');
  assert.equal(response.body.endDate, '2026-10-15');
  assert.deepEqual(response.body.readings.map(({ slot, value, date }) => [slot, value, date]), [
    ['morning', 112, '2026-10-15'], ['after_breakfast', 148, '2026-10-15'], ['after_lunch', 142, '2026-10-15'],
  ]);
  assert.equal(typeof response.body.readings[0].created_at, 'string');
});

test('month-to-date includes the first and selected days, excluding later and previous-month readings', async () => {
  await add('2026-09-30', 40);
  await add('2026-10-01', 100);
  await add('2026-10-14', 120);
  await add('2026-10-15', 112);
  await add('2026-10-15', 148, 'after_breakfast');
  await add('2026-10-15', 142, 'after_lunch');
  await add('2026-10-16', 600);
  const { body } = await getReport('mtd').expect(200);
  assert.deepEqual(stats(body), { highest: 148, lowest: 100, average: 124.4, count: 5 });
  assert.equal(body.startDate, '2026-10-01');
  assert.equal(body.endDate, '2026-10-15');
  assert.equal(Object.hasOwn(body, 'readings'), false);
});

test('monthly means the whole previous calendar month, including both boundary dates', async () => {
  await add('2026-08-31', 600);
  await add('2026-09-01', 90);
  await add('2026-09-30', 110);
  await add('2026-10-01', 40);
  await add('2026-10-15', 500);
  const { body } = await getReport('monthly').expect(200);
  assert.deepEqual(stats(body), { highest: 110, lowest: 90, average: 100, count: 2 });
  assert.equal(body.startDate, '2026-09-01');
  assert.equal(body.endDate, '2026-09-30');
  assert.equal(Object.hasOwn(body, 'readings'), false);
});

test('averages individual readings instead of averaging daily averages', async () => {
  await add('2026-11-01', 100);
  await add('2026-11-02', 200);
  await add('2026-11-02', 300, 'after_breakfast');
  const { body } = await getReport('mtd', '2026-11-02').expect(200);
  assert.deepEqual(stats(body), { highest: 300, lowest: 100, average: 200, count: 3 });
});

test('rounds fractional averages to one decimal and handles a single reading', async () => {
  await add('2026-10-10', 100);
  await add('2026-10-10', 100, 'after_breakfast');
  await add('2026-10-10', 101, 'after_lunch');
  await add('2026-10-11', 100);
  await add('2026-10-11', 101, 'after_breakfast');
  await add('2026-10-12', 112);
  const third = await getReport('daily', '2026-10-10').expect(200);
  const half = await getReport('daily', '2026-10-11').expect(200);
  const single = await getReport('daily', '2026-10-12').expect(200);
  assert.equal(third.body.average, 100.3);
  assert.equal(half.body.average, 100.5);
  assert.deepEqual(stats(single.body), { highest: 112, lowest: 112, average: 112, count: 1 });
});

test('empty reports return zero count and null statistics instead of invalid glucose values', async () => {
  for (const type of reportTypes) {
    const { body } = await getReport(type).expect(200);
    assert.deepEqual(stats(body), { highest: null, lowest: null, average: null, count: 0 });
    if (type === 'daily') assert.deepEqual(body.readings, []);
  }
});

test('January monthly reports cross into December of the previous year', async () => {
  await add('2025-11-30', 600);
  await add('2025-12-01', 80);
  await add('2025-12-31', 120);
  await add('2026-01-01', 500);
  const { body } = await getReport('monthly', '2026-01-15').expect(200);
  assert.equal(body.startDate, '2025-12-01');
  assert.equal(body.endDate, '2025-12-31');
  assert.deepEqual(stats(body), { highest: 120, lowest: 80, average: 100, count: 2 });
  const firstDay = await getReport('mtd', '2026-01-01').expect(200);
  assert.equal(firstDay.body.startDate, '2026-01-01');
  assert.equal(firstDay.body.endDate, '2026-01-01');
  assert.equal(firstDay.body.count, 1);
});

test('previous-month ranges handle leap years, century rules, and 30/31-day months', async () => {
  const cases = [
    ['2024-03-15', '2024-02-01', '2024-02-29'],
    ['2025-03-15', '2025-02-01', '2025-02-28'],
    ['2000-03-01', '2000-02-01', '2000-02-29'],
    ['1900-03-01', '1900-02-01', '1900-02-28'],
    ['2026-05-31', '2026-04-01', '2026-04-30'],
    ['2026-09-01', '2026-08-01', '2026-08-31'],
  ];
  for (const [date, startDate, endDate] of cases) {
    await add(startDate, 40);
    await add(endDate, 600);
    await add(`${date.slice(0, 7)}-01`, 500);
    const { body } = await getReport('monthly', date).expect(200);
    assert.equal(body.startDate, startDate);
    assert.equal(body.endDate, endDate);
    assert.deepEqual(stats(body), { highest: 600, lowest: 40, average: 320, count: 2 });
  }
});

test('every report is restricted to its token owner and ignores supplied user ids', async () => {
  const ownId = await add('2026-10-15', 112);
  const otherId = await add('2026-10-15', 600, 'morning', 1);
  await add('2026-09-15', 80);
  await add('2026-09-15', 500, 'morning', 1);
  for (const type of reportTypes) {
    const response = await request(app).get(`/api/reports/${type}?date=2026-10-15&user_id=${users[1].id}`)
      .set('Authorization', `Bearer ${tokens[0]}`).expect(200);
    const other = await getReport(type, '2026-10-15', 1).expect(200);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.average, type === 'monthly' ? 80 : 112);
    assert.equal(other.body.average, type === 'monthly' ? 500 : 600);
    if (type === 'daily') {
      assert.deepEqual(response.body.readings.map(({ id }) => id), [ownId]);
      assert.deepEqual(other.body.readings.map(({ id }) => id), [otherId]);
    }
  }
});

test('all report endpoints require a valid authenticated session', async () => {
  for (const type of reportTypes) {
    await request(app).get(`/api/reports/${type}?date=2026-10-15`).expect(401);
    await request(app).get(`/api/reports/${type}?date=2026-10-15`).set('Authorization', 'Bearer invalid').expect(401);
  }
});

test('rejects invalid date queries and unsupported previous-month ranges clearly', async () => {
  for (const type of reportTypes) {
    for (const date of ['', '2026-02-29', '2026-13-01', '2026-1-1', '0000-01-01', '2026-10-15T00:00:00Z', '2026-10-15&date=2026-10-16']) {
      const response = await getReport(type, date).expect(400);
      assert.deepEqual(response.body, { field: 'date', error: 'Please enter a valid date in YYYY-MM-DD format.' });
    }
  }
  await getReport('monthly', '0001-01-15').expect(400);
  await add('0001-01-01', 40);
  const earliest = await getReport('monthly', '0001-02-01').expect(200);
  assert.equal(earliest.body.count, 1);
  assert.equal(earliest.body.startDate, '0001-01-01');
  assert.equal(earliest.body.endDate, '0001-01-31');
});

test('omitted dates use India time, including a month rollover at midnight', async () => {
  await add('2026-10-31', 112);
  await add('2026-11-01', 148);
  const before = createApp({ db: client, jwtSecret, now: () => new Date('2026-10-31T18:29:59Z') });
  const after = createApp({ db: client, jwtSecret, now: () => new Date('2026-10-31T18:30:00Z') });
  for (const type of reportTypes) {
    const previous = await getReport(type, null, 0, before).expect(200);
    const next = await getReport(type, null, 0, after).expect(200);
    assert.equal(previous.body.date, '2026-10-31');
    assert.equal(next.body.date, '2026-11-01');
    if (type === 'daily' || type === 'mtd') assert.equal(next.body.average, 148);
    else {
      assert.equal(next.body.startDate, '2026-10-01');
      assert.equal(next.body.endDate, '2026-10-31');
      assert.equal(next.body.average, 112);
    }
  }
});

test('reports reflect adds, edits, moved dates, and deletes without stale cached results', async () => {
  const authorized = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${tokens[0]}`);
  const created = await authorized('post', '/api/readings').send({ date: '2026-10-15', slot: 'morning', value: 112 }).expect(201);
  const id = created.body.reading.id;
  for (const [type, date] of [['daily', '2026-10-15'], ['mtd', '2026-10-15'], ['monthly', '2026-11-15']]) {
    assert.equal((await getReport(type, date).expect(200)).body.average, 112);
  }
  await authorized('put', `/api/readings/${id}`).send({ date: '2026-10-15', slot: 'morning', value: 148 }).expect(200);
  for (const [type, date] of [['daily', '2026-10-15'], ['mtd', '2026-10-15'], ['monthly', '2026-11-15']]) {
    assert.equal((await getReport(type, date).expect(200)).body.average, 148);
  }
  await authorized('put', `/api/readings/${id}`).send({ date: '2026-09-30', slot: 'morning', value: 148 }).expect(200);
  assert.equal((await getReport('daily').expect(200)).body.count, 0);
  assert.equal((await getReport('mtd').expect(200)).body.count, 0);
  assert.equal((await getReport('monthly').expect(200)).body.average, 148);
  await authorized('delete', `/api/readings/${id}`).expect(204);
  assert.equal((await getReport('monthly').expect(200)).body.count, 0);
});
