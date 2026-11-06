import { verifyToken } from '../auth/tokens.js';

export function createRequireAuth({ db, jwtSecret }) {
  return async function requireAuth(req, res, next) {
    const authorization = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
    if (!authorization) {
      return res.status(401).json({ error: 'Please log in to continue.' });
    }

    let payload;
    try {
      payload = verifyToken(authorization[1], jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Your session is invalid or expired. Please log in again.' });
    }

    const userId = Number(payload.sub);
    if (typeof payload.sub !== 'string' || !/^[1-9]\d*$/.test(payload.sub) ||
        !Number.isSafeInteger(userId) || userId > 2147483647 || typeof payload.exp !== 'number') {
      return res.status(401).json({ error: 'Your session is invalid or expired. Please log in again.' });
    }

    const { rows } = await db.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    if (!rows[0]) {
      return res.status(401).json({ error: 'Please log in to continue.' });
    }

    req.user = rows[0];
    next();
  };
}
