import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { verifyToken } from '../src/auth/tokens.js';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a separate PostgreSQL test database.');
}

const schemaSql = await readFile(new URL('../src/db/migrations/001_initial.sql', import.meta.url), 'utf8');
const jwtSecret = randomBytes(32).toString('hex');
const account = { name: 'Test Patient', email: 'patient@example.test', password: 'Patientpass!42' };
let client;
let app;

beforeEach(async () => {
  client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  await client.query('BEGIN');
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}`);
  await client.query(schemaSql);
  app = createApp({ db: client, jwtSecret });
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

function register(overrides = {}) {
  return request(app).post('/api/auth/register').send({ ...account, ...overrides });
}

test('registers a user, hashes the exact password, and returns a one-hour token without password data', async () => {
  const password = ' Patientpass!42 ';
  const response = await register({ name: '  Test Patient  ', email: ' PATIENT@EXAMPLE.TEST ', password }).expect(201);
  assert.deepEqual(response.body.user, { id: 1, name: account.name, email: account.email });
  assert.equal(response.headers['cache-control'], 'no-store');

  const { rows } = await client.query('SELECT password_hash FROM users');
  assert.notEqual(rows[0].password_hash, password);
  assert.equal(await bcrypt.compare(password, rows[0].password_hash), true);
  assert.equal(bcrypt.getRounds(rows[0].password_hash), 12);
  assert.equal(JSON.stringify(response.body).includes(rows[0].password_hash), false);

  const payload = verifyToken(response.body.token, jwtSecret);
  assert.equal(payload.sub, String(response.body.user.id));
  assert.equal(payload.exp - payload.iat, 3600);
  assert.equal(payload.password, undefined);
});

test('rejects invalid registration fields before writing any users', async () => {
  const invalid = [
    [{ name: '' }, 'name'],
    [{ name: '   ' }, 'name'],
    [{ name: 'x'.repeat(101) }, 'name'],
    [{ email: 'not-an-email' }, 'email'],
    [{ email: 42 }, 'email'],
    [{ password: '' }, 'password'],
    [{ password: 12345678 }, 'password'],
    [{ password: 'short' }, 'password'],
    [{ password: 'x'.repeat(73) }, 'password'],
    [{ password: '\u20ac'.repeat(25) }, 'password'],
  ];
  for (const [overrides, field] of invalid) {
    const response = await register(overrides).expect(400);
    assert.equal(response.body.field, field);
    assert.equal(typeof response.body.error, 'string');
  }
  const { rows } = await client.query('SELECT count(*)::int AS count FROM users');
  assert.equal(rows[0].count, 0);
});

test('rejects duplicate emails regardless of case or surrounding whitespace', async () => {
  await register().expect(201);
  const response = await register({ email: ' PATIENT@EXAMPLE.TEST ' }).expect(409);
  assert.deepEqual(response.body, { field: 'email', error: 'An account with this email already exists.' });
});

test('logs in with normalized email and uses its token on the protected current-user endpoint', async () => {
  const registration = await register().expect(201);
  const login = await request(app).post('/api/auth/login')
    .send({ email: ' PATIENT@EXAMPLE.TEST ', password: account.password }).expect(200);
  assert.deepEqual(login.body.user, registration.body.user);
  assert.deepEqual(Object.keys(login.body).sort(), ['token', 'user']);
  const current = await request(app).get('/api/auth/me')
    .set('Authorization', `Bearer ${login.body.token}`).expect(200);
  assert.deepEqual(current.body, { user: registration.body.user });
});

test('returns the same error for a wrong password and an unknown email', async () => {
  await register().expect(201);
  for (const credentials of [
    { email: account.email, password: 'Wrongpassword!42' },
    { email: 'unknown@example.test', password: account.password },
  ]) {
    const response = await request(app).post('/api/auth/login').send(credentials).expect(401);
    assert.deepEqual(response.body, { error: 'Invalid email or password.' });
  }
});

test('rejects missing or incorrectly typed login credentials', async () => {
  for (const credentials of [{}, { email: account.email }, { email: [], password: account.password }]) {
    const response = await request(app).post('/api/auth/login').send(credentials).expect(400);
    assert.equal(typeof response.body.error, 'string');
  }
});

test('rejects missing, malformed, and unsigned authorization', async () => {
  await request(app).get('/api/auth/me').expect(401);
  for (const authorization of ['Basic credentials', 'Bearer', 'Bearer not-a-token']) {
    await request(app).get('/api/auth/me').set('Authorization', authorization).expect(401);
  }
});

test('rejects expired tokens, invalid signatures, other algorithms, and invalid claims', async () => {
  const registration = await register().expect(201);
  const options = {
    subject: String(registration.body.user.id),
    issuer: 'sweety-api',
    audience: 'sweety-client',
    expiresIn: '1h',
    algorithm: 'HS256',
  };
  const invalidTokens = [
    jwt.sign({}, jwtSecret, { ...options, expiresIn: -1 }),
    jwt.sign({}, randomBytes(32).toString('hex'), options),
    jwt.sign({}, jwtSecret, { ...options, algorithm: 'HS512' }),
    jwt.sign({}, jwtSecret, { ...options, issuer: 'another-app' }),
    jwt.sign({}, jwtSecret, { ...options, subject: 'not-a-user' }),
    jwt.sign({}, jwtSecret, { ...options, subject: '9999999999' }),
    jwt.sign({}, jwtSecret, { subject: options.subject, issuer: options.issuer, audience: options.audience }),
  ];
  for (const token of invalidTokens) {
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  }
});

test('uses the token identity even when another user id is supplied in the query', async () => {
  const first = await register().expect(201);
  const second = await register({ email: 'another@example.test' }).expect(201);
  const response = await request(app).get(`/api/auth/me?userId=${second.body.user.id}`)
    .set('Authorization', `Bearer ${first.body.token}`).expect(200);
  assert.deepEqual(response.body, { user: first.body.user });
});

test('rejects an otherwise valid token after its user is deleted', async () => {
  const response = await register().expect(201);
  await client.query('DELETE FROM users WHERE id = $1', [response.body.user.id]);
  await request(app).get('/api/auth/me').set('Authorization', `Bearer ${response.body.token}`).expect(401);
});

test('limits repeated login and registration attempts together', async () => {
  for (let count = 0; count < 30; count++) {
    await request(app).post('/api/auth/login').send({}).expect(400);
  }
  const response = await register().expect(429);
  assert.equal(typeof response.body.error, 'string');
  assert.ok(Number(response.headers['retry-after']) > 0);
  const { rows } = await client.query('SELECT count(*)::int AS count FROM users');
  assert.equal(rows[0].count, 0);
});

test('returns JSON errors for malformed JSON and oversized bodies', async () => {
  const malformed = await request(app).post('/api/auth/register')
    .set('Content-Type', 'application/json').send('{').expect(400);
  assert.deepEqual(malformed.body, { error: 'Request body must be valid JSON.' });
  const oversized = await register({ name: 'x'.repeat(11 * 1024) }).expect(413);
  assert.deepEqual(oversized.body, { error: 'Request body is too large.' });
});

test('returns a generic JSON error when a database query fails', async (t) => {
  t.mock.method(console, 'error', () => {});
  const unavailable = createApp({
    db: { query: async () => { throw new Error('Private database connection details'); } },
    jwtSecret,
  });
  const response = await request(unavailable).post('/api/auth/login')
    .send({ email: account.email, password: account.password }).expect(500);
  assert.deepEqual(response.body, { error: 'Something went wrong. Please try again.' });
});

test('refuses to start with a missing, short, or placeholder signing secret', () => {
  for (const secret of ['', 'too-short', 'replace-with-a-long-random-secret-before-authentication']) {
    assert.throws(() => createApp({ db: client, jwtSecret: secret }), /Set JWT_SECRET/);
  }
});
