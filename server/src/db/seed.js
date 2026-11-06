import pool from './pool.js';
import { demoAccount, seedDemo } from './demo.js';

let client;
try {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env before seeding.');
  client = await pool.connect();
  const result = await seedDemo(client);
  console.log(`Demo ready for ${result.date}: inserted ${result.inserted} sample readings.`);
  console.log(`Email: ${demoAccount.email}`);
  console.log(`Password: ${demoAccount.password}`);
} catch (error) {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
