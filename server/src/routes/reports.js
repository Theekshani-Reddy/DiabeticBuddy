import { Router } from 'express';
import { createRequireAuth } from '../middleware/require-auth.js';
import { isValidDate, todayInKolkata } from '../readings/validation.js';
import { reportRange } from '../reports/range.js';

export function createReportsRouter({ db, jwtSecret, now }) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(createRequireAuth({ db, jwtSecret }));

  for (const type of ['daily', 'mtd', 'monthly']) {
    router.get(`/${type}`, async (req, res) => {
      const date = req.query.date === undefined ? todayInKolkata(now()) : req.query.date;
      if (!isValidDate(date)) {
        return res.status(400).json({ field: 'date', error: 'Please enter a valid date in YYYY-MM-DD format.' });
      }
      if (type === 'monthly' && date < '0001-02-01') {
        return res.status(400).json({ field: 'date', error: 'Previous month is outside the supported date range.' });
      }

      const { startDate, endDate } = reportRange(type, date);
      const { rows } = await db.query(
        `SELECT id, date::text AS date, slot, value, created_at FROM readings
         WHERE user_id = $1 AND date BETWEEN $2::date AND $3::date
         ORDER BY date, CASE slot WHEN 'morning' THEN 1 WHEN 'after_breakfast' THEN 2
           WHEN 'after_lunch' THEN 3 WHEN 'after_dinner' THEN 4 END`,
        [req.user.id, startDate, endDate],
      );

      // Each range contains at most 31 days / 124 readings. One query keeps the
      // statistics and daily list consistent even if another request changes data.
      const values = rows.map((reading) => reading.value);
      const count = values.length;
      const total = values.reduce((sum, value) => sum + value, 0);
      res.json({
        type, date, startDate, endDate,
        highest: count ? Math.max(...values) : null,
        lowest: count ? Math.min(...values) : null,
        average: count ? Math.round(total * 10 / count) / 10 : null,
        count,
        ...(type === 'daily' && { readings: rows }),
      });
    });
  }

  return router;
}
