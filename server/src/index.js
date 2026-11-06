import { createApp } from './app.js';

if (!process.env.DATABASE_URL) {
  throw new Error('Set DATABASE_URL in .env before starting the API.');
}

const port = Number(process.env.PORT || 3001);
const app = createApp();

app.listen(port, () => {
  console.log(`Sweety API listening on http://localhost:${port}`);
});
