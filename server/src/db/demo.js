import bcrypt from 'bcrypt';
import { todayInKolkata } from '../readings/validation.js';
import { reportRange } from '../reports/range.js';

// Public, synthetic demo credentials. This account is for local evaluation only.
export const demoAccount = {
  name: 'Demo Patient',
  email: 'demo@sweety.example',
  password: 'SweetyDemo123!',
};

export function demoReadings(today = todayInKolkata()) {
  const rows = [];
  const slots = ['morning', 'after_breakfast', 'after_lunch', 'after_dinner'];
  function day(date, values) {
    values.forEach((value, index) => rows.push({ date, slot: slots[index], value }));
  }

  const { startDate, endDate } = reportRange('monthly', today);
  day(startDate, [96, 134, 126, 139]);
  day(`${startDate.slice(0, 7)}-15`, [110, 152, 141, 146]);
  day(endDate, [102]);

  const dayOfMonth = Number(today.slice(8));
  if (dayOfMonth > 1) day(`${today.slice(0, 7)}-01`, [110, 143, 138, 131]);
  if (dayOfMonth > 3) day(`${today.slice(0, 7)}-03`, [105, 147, 139]);
  day(today, [112, 148, 142]);
  return rows;
}

export async function seedDemo(client, today = todayInKolkata()) {
  await client.query('BEGIN');
  try {
    const hash = await bcrypt.hash(demoAccount.password, 12);
    await client.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [demoAccount.name, demoAccount.email, hash],
    );
    const { rows } = await client.query(
      'SELECT id, password_hash FROM users WHERE lower(email) = $1', [demoAccount.email],
    );
    const user = rows[0];
    if (!user || !await bcrypt.compare(demoAccount.password, user.password_hash)) {
      throw new Error('The demo email already has a different password. No account or readings were changed. Use a clean development database or change the demo email in server/src/db/demo.js.');
    }

    let inserted = 0;
    for (const reading of demoReadings(today)) {
      const result = await client.query(
        `INSERT INTO readings (user_id, date, slot, value) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, date, slot) DO NOTHING`,
        [user.id, reading.date, reading.slot, reading.value],
      );
      inserted += result.rowCount;
    }
    await client.query('COMMIT');
    return { userId: user.id, date: today, inserted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
