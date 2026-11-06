import { Router } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { validateCredentials } from '../auth/validation.js';
import { createToken } from '../auth/tokens.js';
import { createRequireAuth } from '../middleware/require-auth.js';

const hashRounds = 12;
// Unknown accounts still perform a bcrypt comparison before returning an error.
const dummyPasswordHash = bcrypt.hash('sweety-invalid-login-placeholder', hashRounds);

export function createAuthRouter({ db, jwtSecret }) {
  const router = Router();
  const requireAuth = createRequireAuth({ db, jwtSecret });
  const limitAttempts = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  });

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/register', limitAttempts, async (req, res) => {
    const validation = validateCredentials(req.body, { registration: true });
    if (validation) return res.status(400).json(validation);

    const { name, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, hashRounds);
    let user;

    try {
      const { rows } = await db.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [name.trim(), email.trim().toLowerCase(), passwordHash],
      );
      user = rows[0];
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'users_email_unique') {
        return res.status(409).json({ field: 'email', error: 'An account with this email already exists.' });
      }
      throw error;
    }

    res.status(201).json({ user, token: createToken(user.id, jwtSecret) });
  });

  router.post('/login', limitAttempts, async (req, res) => {
    const validation = validateCredentials(req.body);
    if (validation) return res.status(400).json(validation);

    const { email, password } = req.body;
    const { rows } = await db.query(
      'SELECT id, name, email, password_hash FROM users WHERE lower(email) = $1',
      [email.trim().toLowerCase()],
    );
    const user = rows[0];
    const matches = await bcrypt.compare(password, user?.password_hash ?? await dummyPasswordHash);
    if (!user || !matches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token: createToken(user.id, jwtSecret),
    });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
