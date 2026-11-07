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
const sample = { date: '2026-11-06', slot: 'morning', value: 112 };
let admin;
let db;
let schema;
let app;
let users;
let tokens;

beforeEach(async () => {
  admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
  await admin.connect();
  schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  // A real pool permits simultaneous requests; its schema is isolated from all other tests.
  db = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    connectionTimeoutMillis: 5000,
    max: 6,
    options: `-c search_path=${schema} -c timezone=Asia/Kolkata`,
  });
  await db.query(schemaSql);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash) VALUES
      ('First Patient', 'first@example.test', 'test-hash-placeholder'),
      ('Second Patient', 'second@example.test', 'test-hash-placeholder') RETURNING id`,
  );
  users = rows;
  tokens = users.map((user) => createToken(user.id, jwtSecret));
  app = createApp({ db, jwtSecret, now: () => new Date('2026-11-06T12:00:00Z') });
});

afterEach(async () => {
  try {
    await db?.end();
    if (admin && schema) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    await admin?.end();
  }
});

function api(method, path = '/api/readings', user = 0, targetApp = app) {
  return request(targetApp)[method](path).set('Authorization', `Bearer ${tokens[user]}`);
}

async function add(overrides = {}, user = 0) {
  return api('post', '/api/readings', user).send({ ...sample, ...overrides }).expect(201);
}

async function fillDay(date = sample.date) {
  const readings = [];
  for (const slot of ['morning', 'after_breakfast', 'after_lunch', 'after_dinner']) {
    readings.push((await add({ date, slot })).body.reading);
  }
  return readings;
}

test('creates, lists, edits, and deletes a reading while preserving calendar dates', async () => {
  const created = await add();
  const reading = created.body.reading;
  assert.equal(reading.date, sample.date);
  assert.equal(reading.slot, sample.slot);
  assert.equal(reading.value, sample.value);
  assert.equal(typeof reading.created_at, 'string');
  assert.equal(created.headers['cache-control'], 'no-store');
  const listed = await api('get', `/api/readings?date=${sample.date}`).expect(200);
  assert.deepEqual(listed.body, { readings: [reading] });

  const replacement = { date: '2026-11-05', slot: 'after_breakfast', value: 148 };
  const edited = await api('put', `/api/readings/${reading.id}`).send(replacement).expect(200);
  assert.deepEqual(edited.body.reading, { ...reading, ...replacement });
  assert.deepEqual((await api('get', `/api/readings?date=${sample.date}`).expect(200)).body, { readings: [] });
  await api('delete', `/api/readings/${reading.id}`).expect(204);
  assert.deepEqual((await api('get').expect(200)).body, { readings: [] });
  await api('put', `/api/readings/${reading.id}`).send(sample).expect(404);
});

test('requires authentication for every readings operation', async () => {
  for (const [method, path] of [['get', '/api/readings'], ['get', '/api/readings?page=1&limit=20'], ['post', '/api/readings'],
    ['put', '/api/readings/1'], ['delete', '/api/readings/1']]) {
    await request(app)[method](path).send(sample).expect(401);
  }
});

test('uses the exact required and range messages for invalid glucose values', async () => {
  for (const value of [undefined, null, '', '   ']) {
    const response = await api('post').send({ ...sample, value }).expect(400);
    assert.deepEqual(response.body, { field: 'value', error: 'Please enter a glucose value.' });
  }
  for (const value of [39, 601, '112', true, [], {}]) {
    const response = await api('post').send({ ...sample, value }).expect(400);
    assert.deepEqual(response.body, { field: 'value', error: 'Value must be between 40 and 600 mg/dl.' });
  }
  for (const value of [112.5, 39.5, 600.1]) {
    const response = await api('post').send({ ...sample, value }).expect(400);
    assert.deepEqual(response.body, { field: 'value', error: 'Please enter a whole number.' });
  }
  assert.deepEqual((await api('get').expect(200)).body, { readings: [] });
  await add({ value: 40 });
  await add({ slot: 'after_breakfast', value: 600 });
});

test('rejects invalid calendar dates and future dates without inserting readings', async () => {
  for (const date of [undefined, '', '2026-02-29', '2026-04-31', '2026-1-1',
    '0000-01-01', '2026-11-06T00:00:00Z', 'not-a-date', 20261106]) {
    const response = await api('post').send({ ...sample, date }).expect(400);
    assert.equal(response.body.field, 'date');
  }
  const future = await api('post').send({ ...sample, date: '2026-11-07' }).expect(400);
  assert.deepEqual(future.body, { field: 'date', error: 'Date cannot be in the future.' });
  assert.deepEqual((await api('get').expect(200)).body, { readings: [] });
  await add({ date: '2024-02-29' });
});

test('uses the Asia/Kolkata date at midnight rather than the server UTC date', async () => {
  const beforeMidnight = createApp({ db, jwtSecret, now: () => new Date('2026-11-06T18:29:59Z') });
  const afterMidnight = createApp({ db, jwtSecret, now: () => new Date('2026-11-06T18:30:00Z') });
  const body = { ...sample, date: '2026-11-07' };
  const rejected = await api('post', '/api/readings', 0, beforeMidnight).send(body).expect(400);
  assert.equal(rejected.body.error, 'Date cannot be in the future.');
  const accepted = await api('post', '/api/readings', 0, afterMidnight).send(body).expect(201);
  assert.equal(accepted.body.reading.date, body.date);
});

test('accepts only the four canonical time slots', async () => {
  for (const slot of [undefined, null, 'evening', 'After lunch', '__proto__', {}]) {
    const response = await api('post').send({ ...sample, slot }).expect(400);
    assert.deepEqual(response.body, { field: 'slot', error: 'Please choose a valid time slot.' });
  }
});

test('names the occupied slot in a duplicate error and preserves the original reading', async () => {
  await add({ slot: 'after_lunch' });
  const response = await api('post').send({ ...sample, slot: 'after_lunch', value: 150 }).expect(409);
  assert.deepEqual(response.body, { field: 'slot', error: 'You already have an After lunch reading for this date.' });
  const { readings } = (await api('get').expect(200)).body;
  assert.equal(readings.length, 1);
  assert.equal(readings[0].value, sample.value);
});

test('rejects a fifth reading but permits editing a reading on an already full day', async () => {
  const readings = await fillDay();
  const fifth = await api('post').send(sample).expect(409);
  assert.deepEqual(fifth.body, { field: 'date', error: 'You can add only 4 readings per day.' });
  await api('put', `/api/readings/${readings[0].id}`).send({ ...sample, value: 150 }).expect(200);
  const { readings: stored } = (await api('get').expect(200)).body;
  assert.equal(stored.length, 4);
  assert.equal(stored[0].value, 150);
});

test('rejects edits into an occupied slot or a full date without losing the original', async () => {
  const full = await fillDay();
  const collision = await api('put', `/api/readings/${full[0].id}`).send({ ...sample, slot: 'after_lunch' }).expect(409);
  assert.equal(collision.body.error, 'You already have an After lunch reading for this date.');
  const other = (await add({ date: '2026-11-05' })).body.reading;
  const move = await api('put', `/api/readings/${other.id}`).send(sample).expect(409);
  assert.equal(move.body.error, 'You can add only 4 readings per day.');
  const oldDate = await api('get', '/api/readings?date=2026-11-05').expect(200);
  assert.deepEqual(oldDate.body.readings, [other]);
});

test('validates updates with the same value and future-date rules as new readings', async () => {
  const reading = (await add()).body.reading;
  for (const [overrides, message] of [
    [{ value: null }, 'Please enter a glucose value.'],
    [{ value: 39 }, 'Value must be between 40 and 600 mg/dl.'],
    [{ value: 112.5 }, 'Please enter a whole number.'],
    [{ date: '2026-11-07' }, 'Date cannot be in the future.'],
  ]) {
    const response = await api('put', `/api/readings/${reading.id}`).send({ ...sample, ...overrides }).expect(400);
    assert.equal(response.body.error, message);
  }
  assert.deepEqual((await api('get').expect(200)).body.readings, [reading]);
});

test('enforces ownership on create, list, edit, and delete regardless of supplied user ids', async () => {
  const reading = (await add({ user_id: users[1].id })).body.reading;
  const owner = await db.query('SELECT user_id FROM readings WHERE id = $1', [reading.id]);
  assert.equal(owner.rows[0].user_id, users[0].id);
  const hidden = await api('get', `/api/readings?date=${sample.date}&user_id=${users[0].id}`, 1).expect(200);
  assert.deepEqual(hidden.body, { readings: [] });
  const update = await api('put', `/api/readings/${reading.id}`, 1).send({ ...sample, value: 200 }).expect(404);
  const deletion = await api('delete', `/api/readings/${reading.id}`, 1).expect(404);
  assert.deepEqual(update.body, { error: 'Reading not found.' });
  assert.deepEqual(deletion.body, update.body);
  assert.deepEqual((await api('get').expect(200)).body.readings, [reading]);
  await add({}, 1);
});

test('sorts by newest date then slot order, filters dates, and returns empty lists', async () => {
  await add({ date: '2026-11-05' });
  await add({ slot: 'after_dinner' });
  await add();
  const all = (await api('get').expect(200)).body.readings;
  assert.deepEqual(all.map(({ date, slot }) => [date, slot]),
    [['2026-11-06', 'morning'], ['2026-11-06', 'after_dinner'], ['2026-11-05', 'morning']]);
  const filtered = (await api('get', '/api/readings?date=2026-11-05').expect(200)).body.readings;
  assert.equal(filtered.length, 1);
  assert.deepEqual((await api('get', '/api/readings?date=2026-11-07').expect(200)).body, { readings: [] });
  for (const query of ['date=', 'date=2026-02-29', 'date=2026-11-05&date=2026-11-06']) {
    await api('get', `/api/readings?${query}`).expect(400);
  }
});

test('returns clear errors for invalid ids and unknown readings', async () => {
  for (const id of ['0', '-1', '1.5', 'abc', '9999999999']) {
    await api('put', `/api/readings/${id}`).send(sample).expect(400);
    await api('delete', `/api/readings/${id}`).expect(400);
  }
  await api('put', '/api/readings/2147483647').send(sample).expect(404);
  await api('delete', '/api/readings/2147483647').expect(404);
});

test('paginates in date/slot order with correct totals and no repeated or missing readings', async () => {
  for (const date of ['2026-11-04', '2026-11-05', '2026-11-06']) await fillDay(date);
  const all = (await api('get').expect(200)).body.readings;
  const collected = [];
  for (const page of [1, 2, 3]) {
    const { body, headers } = await api('get', `/api/readings?page=${page}&limit=5`).expect(200);
    assert.deepEqual(body.pagination, { page, limit: 5, total: 12, totalPages: 3 });
    assert.deepEqual(body.readings, all.slice((page - 1) * 5, page * 5));
    assert.equal(headers['cache-control'], 'no-store');
    collected.push(...body.readings);
  }
  assert.deepEqual(collected, all);
});

test('defaults pagination parameters only when requested and preserves unpaginated responses', async () => {
  for (const day of ['01', '02', '03', '04', '05', '06']) await fillDay(`2026-11-${day}`);
  const all = (await api('get').expect(200)).body;
  assert.deepEqual(Object.keys(all), ['readings']);
  assert.equal(all.readings.length, 24);
  const first = (await api('get', '/api/readings?page=1').expect(200)).body;
  assert.deepEqual(first.pagination, { page: 1, limit: 20, total: 24, totalPages: 2 });
  assert.deepEqual(first.readings, all.readings.slice(0, 20));
  const second = (await api('get', '/api/readings?page=2').expect(200)).body;
  assert.deepEqual(second.readings, all.readings.slice(20));
  const limitOnly = (await api('get', '/api/readings?limit=3').expect(200)).body;
  assert.deepEqual(limitOnly.pagination, { page: 1, limit: 3, total: 24, totalPages: 8 });
  assert.deepEqual(limitOnly.readings, all.readings.slice(0, 3));
  const maximumLimit = (await api('get', '/api/readings?limit=100').expect(200)).body;
  assert.equal(maximumLimit.readings.length, 24);
  assert.equal(maximumLimit.pagination.limit, 100);
});

test('pagination rows and totals respect the date filter and authenticated owner', async () => {
  const own = await fillDay();
  await add({ date: '2026-11-05' });
  const other = [];
  for (const slot of ['morning', 'after_breakfast', 'after_lunch']) other.push((await add({ slot }, 1)).body.reading);
  const first = (await api('get', `/api/readings?date=${sample.date}&page=1&limit=2&user_id=${users[1].id}`).expect(200)).body;
  assert.deepEqual(first.pagination, { page: 1, limit: 2, total: 4, totalPages: 2 });
  assert.deepEqual(first.readings, own.slice(0, 2));
  const second = (await api('get', `/api/readings?date=${sample.date}&page=2&limit=2`).expect(200)).body;
  assert.deepEqual(second.readings, own.slice(2));
  assert.equal((await api('get', '/api/readings?page=1').expect(200)).body.pagination.total, 5);
  const otherUser = (await api('get', `/api/readings?page=1&limit=2&user_id=${users[0].id}`, 1).expect(200)).body;
  assert.deepEqual(otherUser.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
  assert.deepEqual(otherUser.readings, other.slice(0, 2));
});

test('empty and out-of-range pages return empty readings and accurate metadata', async () => {
  const empty = (await api('get', '/api/readings?page=1&limit=2').expect(200)).body;
  assert.deepEqual(empty, { readings: [], pagination: { page: 1, limit: 2, total: 0, totalPages: 0 } });
  await fillDay();
  const pastEnd = (await api('get', '/api/readings?page=5&limit=2').expect(200)).body;
  assert.deepEqual(pastEnd, { readings: [], pagination: { page: 5, limit: 2, total: 4, totalPages: 2 } });
  const absentDate = (await api('get', '/api/readings?date=2026-11-05&page=1').expect(200)).body;
  assert.deepEqual(absentDate, { readings: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  const largePage = (await api('get', '/api/readings?page=9007199254740991&limit=1').expect(200)).body;
  assert.deepEqual(largePage, { readings: [], pagination: { page: Number.MAX_SAFE_INTEGER, limit: 1, total: 4, totalPages: 4 } });
});

test('rejects invalid, repeated and excessive pagination parameters with clear field errors', async () => {
  for (const page of ['', '0', '-1', '1.5', '1e2', 'abc', 'NaN', 'Infinity', '9007199254740992', '01', '+1']) {
    const response = await api('get', `/api/readings?page=${encodeURIComponent(page)}`).expect(400);
    assert.deepEqual(response.body, { field: 'page', error: 'Page must be a positive whole number.' });
  }
  for (const limit of ['', '0', '-1', '1.5', '2e1', 'abc', '101', 'Infinity', '9007199254740992', '01']) {
    const response = await api('get', `/api/readings?limit=${encodeURIComponent(limit)}`).expect(400);
    assert.deepEqual(response.body, { field: 'limit', error: 'Limit must be a whole number between 1 and 100.' });
  }
  for (const [query, field] of [['page=1&page=2', 'page'], ['limit=2&limit=3', 'limit']]) {
    const response = await api('get', `/api/readings?${query}`).expect(400);
    assert.equal(response.body.field, field);
  }
  const overflow = await api('get', '/api/readings?page=9007199254740991&limit=100').expect(400);
  assert.deepEqual(overflow.body, { field: 'page', error: 'Page is too large. Please choose a smaller page.' });
  const date = await api('get', '/api/readings?date=2026-02-29&page=1').expect(400);
  assert.equal(date.body.field, 'date');
});

test('pagination parameters do not truncate daily or monthly report data and statistics', async () => {
  await fillDay('2026-11-05');
  await fillDay();
  for (const [type, date, count] of [['daily', sample.date, 4], ['mtd', sample.date, 8], ['monthly', '2026-12-06', 8]]) {
    const { body } = await api('get', `/api/reports/${type}?date=${date}&page=2&limit=1`).expect(200);
    assert.equal(body.count, count);
    assert.equal(body.readings.length, count);
    assert.equal(body.average, sample.value);
    assert.equal(Object.hasOwn(body, 'pagination'), false);
  }
});

test('simultaneous requests cannot create duplicate readings or exceed four per day', async () => {
  const slots = ['morning', 'after_breakfast', 'after_lunch', 'after_dinner', 'morning'];
  const responses = await Promise.all(slots.map((slot) => api('post').send({ ...sample, slot })));
  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 201, 201, 201, 409]);
  const stored = (await api('get').expect(200)).body.readings;
  assert.equal(stored.length, 4);
  assert.equal(new Set(stored.map(({ slot }) => slot)).size, 4);
});

test('simultaneous edits into the same slot preserve both records and allow one update', async () => {
  const first = (await add({ date: '2026-11-04' })).body.reading;
  const second = (await add({ date: '2026-11-05' })).body.reading;
  const responses = await Promise.all([first, second].map((reading) => api('put', `/api/readings/${reading.id}`).send(sample)));
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
  const stored = (await api('get').expect(200)).body.readings;
  assert.equal(stored.length, 2);
  assert.equal(stored.filter(({ date }) => date === sample.date).length, 1);
});
