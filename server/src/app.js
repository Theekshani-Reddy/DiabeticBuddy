import express from 'express';
import pool from './db/pool.js';
import { createAuthRouter } from './routes/auth.js';
import { createReadingsRouter } from './routes/readings.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp({ db = pool, jwtSecret = process.env.JWT_SECRET, now = () => new Date() } = {}) {
  if (typeof jwtSecret !== 'string' || Buffer.byteLength(jwtSecret) < 32 || jwtSecret.startsWith('replace-with-')) {
    throw new Error('Set JWT_SECRET in .env to a random secret of at least 32 bytes.');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'sweety-api' });
  });

  app.use('/api/auth', createAuthRouter({ db, jwtSecret }));
  app.use('/api/readings', createReadingsRouter({ db, jwtSecret, now }));
  app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use(errorHandler);

  return app;
}
