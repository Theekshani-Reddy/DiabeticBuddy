import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  options: '-c timezone=Asia/Kolkata',
});

pool.on('error', () => {
  console.error('An idle database connection failed. Check that PostgreSQL is running.');
});

export default pool;
