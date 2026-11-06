# Sweety

Blood glucose tracker built with React, Express, Node.js, and PostgreSQL for the Kenpath assignment.
Record up to four blood glucose readings per day and view daily, month-to-date, and previous-month reports.

## Setup

Requires Node.js 24 LTS (or 22.12+), npm, and PostgreSQL 16+. Docker Desktop is an alternative to installing PostgreSQL.

```sh
npm ci
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell, `cp .env.example .env` on macOS/Linux).
Generate `JWT_SECRET` with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and paste it into `.env`.
For local PostgreSQL, create `sweety` and `sweety_test` databases and update both connection URLs in `.env`.
Alternatively, start Docker Desktop and run:

```sh
docker run --name sweety-db -e POSTGRES_USER=sweety -e POSTGRES_PASSWORD=sweety-local -e POSTGRES_DB=sweety -p 127.0.0.1:5432:5432 -v sweety-pgdata:/var/lib/postgresql/data -d postgres:16
docker exec sweety-db pg_isready -U sweety -d sweety
docker exec sweety-db createdb -U sweety sweety_test
```

Wait for `pg_isready` to say "accepting connections" before creating the test database.
On later runs, use `docker start sweety-db`. Then apply migrations for either database setup:

```sh
npm run db:migrate
npm run db:seed
```

Migrations are tracked and safe to rerun. The seed creates a synthetic demo patient:

| Email | Password |
| --- | --- |
| `demo@sweety.example` | `SweetyDemo123!` |

Samples cover today, earlier in the current month (when applicable), and the previous month.
Rerun the seed before demonstrating on a different day. It adds missing slots, preserves existing readings/passwords, and stops if the demo email has a different password. Use demo credentials only for local evaluation.

## Run

Run each command in a separate terminal from the project root:

```sh
npm run dev:server
npm run dev:client
```

Open [localhost:5173](http://localhost:5173). The API health check is [localhost:3001/api/health](http://localhost:3001/api/health).
After login, choose a date, select a slot card, and enter a glucose value. Edit/Delete actions appear in the daily report.
Report tabs follow the selected date and show highest, lowest, average, and count; empty periods show a clear empty state.
Vite proxies `/api` to Express; restart both servers after changing `PORT`.
`npm start` runs the API without watch mode. `npm run build` produces the frontend in `client/dist`; deployment requires serving these files and forwarding `/api` to Express.

## Checks

```sh
npm test
npm run build
```

Server tests require `TEST_DATABASE_URL`; they use isolated schemas and remove test data afterward.
Tests cover authentication, reading CRUD, report calculations/date boundaries, user isolation, concurrent writes, safe demo seeding, and frontend forms/reports.
Use `npm run test:client` for frontend tests, `npm run test:server` for API/database tests, or `npm run test:db` for constraints only.

## API

See the [API reference](docs/API.md) for authentication, readings, reports, payloads, and validation messages.
Tokens expire after one hour. The frontend keeps them in per-tab session storage and verifies them with the API after refresh. Logout clears the client session.

## Screenshots

[Login](docs/screenshots/login.png) · [Desktop dashboard](docs/screenshots/dashboard-desktop.png) · [Mobile dashboard](docs/screenshots/dashboard-mobile.png) · [Previous-month report](docs/screenshots/monthly-report.png)

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | API port; default `3001`. |
| `DATABASE_URL` | PostgreSQL application database. |
| `TEST_DATABASE_URL` | Separate database for automated tests. |
| `JWT_SECRET` | Random token signing secret of at least 32 bytes. |

The example database credentials are for local development. Keep `.env` out of Git.

## Notes

- Dates and displayed times use `Asia/Kolkata`. Row times show when a reading was recorded, not its measurement time; timestamps use `TIMESTAMPTZ`.
- Slots are `morning`, `after_breakfast`, `after_lunch`, and `after_dinner`. Their uniqueness limits each user to four readings per day.
- PostgreSQL follows the assignment's explicit database requirement despite its MERN label. Accounts are patients; the optional doctor role is not implemented.
- With more time: charts, pagination, password recovery, and deployment configuration. Frontend form tests are included.
