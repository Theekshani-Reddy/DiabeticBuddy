import { Router } from 'express';
import { createRequireAuth } from '../middleware/require-auth.js';
import { duplicateSlotError, isValidDate, todayInKolkata, validateReading } from '../readings/validation.js';
import { parsePagination } from '../readings/pagination.js';

// Return DATE as text to preserve the calendar date across browser/server timezones.
const columns = 'id, date::text AS date, slot, value, created_at';
const slotOrder = `CASE slot WHEN 'morning' THEN 1 WHEN 'after_breakfast' THEN 2
  WHEN 'after_lunch' THEN 3 WHEN 'after_dinner' THEN 4 END`;

export function createReadingsRouter({ db, jwtSecret, now }) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(createRequireAuth({ db, jwtSecret }));

  router.param('id', (req, res, next, id) => {
    const parsed = Number(id);
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(parsed) || parsed > 2147483647) {
      return res.status(400).json({ field: 'id', error: 'Reading ID must be a positive whole number.' });
    }
    req.readingId = parsed;
    next();
  });

  async function findConflict(userId, date, slot, excludeId = null) {
    const { rows } = await db.query(
      'SELECT slot FROM readings WHERE user_id = $1 AND date = $2 AND ($3::int IS NULL OR id <> $3)',
      [userId, date, excludeId],
    );
    if (rows.length >= 4) return { field: 'date', error: 'You can add only 4 readings per day.' };
    if (rows.some((row) => row.slot === slot)) return duplicateSlotError(slot);
    return null;
  }

  router.get('/', async (req, res) => {
    const { date } = req.query;
    if (date !== undefined && !isValidDate(date)) {
      return res.status(400).json({ field: 'date', error: 'Please enter a valid date in YYYY-MM-DD format.' });
    }
    const pagination = parsePagination(req.query);
    if (pagination?.error) return res.status(400).json(pagination);

    const filter = 'FROM readings WHERE user_id = $1 AND ($2::date IS NULL OR date = $2)';
    const query = `SELECT ${columns} ${filter} ORDER BY date DESC, ${slotOrder}`;
    const parameters = [req.user.id, date ?? null];
    if (!pagination) {
      const { rows } = await db.query(query, parameters);
      return res.json({ readings: rows });
    }

    const { page, limit, offset } = pagination;
    const count = await db.query(`SELECT count(*)::int AS total ${filter}`, parameters);
    const total = count.rows[0].total;
    const { rows } = offset >= total ? { rows: [] }
      : await db.query(`${query} LIMIT $3 OFFSET $4`, [...parameters, limit, offset]);
    res.json({ readings: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  router.post('/', async (req, res) => {
    const validation = validateReading(req.body, todayInKolkata(now()));
    if (validation) return res.status(400).json(validation);
    const { date, slot, value } = req.body;
    const conflict = await findConflict(req.user.id, date, slot);
    if (conflict) return res.status(409).json(conflict);

    try {
      const { rows } = await db.query(
        `INSERT INTO readings (user_id, date, slot, value) VALUES ($1, $2, $3, $4) RETURNING ${columns}`,
        [req.user.id, date, slot, value],
      );
      res.status(201).json({ reading: rows[0] });
    } catch (error) {
      // The unique constraint also protects against simultaneous requests.
      if (error.code === '23505' && error.constraint === 'readings_user_date_slot_unique') {
        return res.status(409).json(duplicateSlotError(slot));
      }
      throw error;
    }
  });

  router.put('/:id', async (req, res) => {
    const existing = await db.query('SELECT id FROM readings WHERE id = $1 AND user_id = $2', [req.readingId, req.user.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Reading not found.' });
    const validation = validateReading(req.body, todayInKolkata(now()));
    if (validation) return res.status(400).json(validation);
    const { date, slot, value } = req.body;
    const conflict = await findConflict(req.user.id, date, slot, req.readingId);
    if (conflict) return res.status(409).json(conflict);

    try {
      const { rows } = await db.query(
        `UPDATE readings SET date = $1, slot = $2, value = $3 WHERE id = $4 AND user_id = $5 RETURNING ${columns}`,
        [date, slot, value, req.readingId, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: 'Reading not found.' });
      res.json({ reading: rows[0] });
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'readings_user_date_slot_unique') {
        return res.status(409).json(duplicateSlotError(slot));
      }
      throw error;
    }
  });

  router.delete('/:id', async (req, res) => {
    const { rows } = await db.query('DELETE FROM readings WHERE id = $1 AND user_id = $2 RETURNING id', [req.readingId, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Reading not found.' });
    res.status(204).end();
  });

  return router;
}
