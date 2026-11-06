# Sweety

Blood glucose tracker built with React, Express, Node.js, and PostgreSQL for the Kenpath assignment.
The project is in development; the database and authentication API are implemented.

## Setup

Requires Node.js 24 LTS (or 22.12+), npm, and PostgreSQL 16+. Docker Desktop is an alternative to installing PostgreSQL.

```sh
npm install
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
```

Migrations are tracked and safe to rerun.

## Run

Run each command in a separate terminal from the project root:

```sh
npm run dev:server
npm run dev:client
```

Open http://localhost:5173. The API health check is http://localhost:3001/api/health.
Vite proxies `/api` to Express; restart both servers after changing `PORT`.
`npm start` runs the API without watch mode. Production frontend hosting is not configured yet.

## Checks

```sh
npm test
npm run build
```

Tests require `TEST_DATABASE_URL`; they use isolated schemas and roll back all test data.
They cover authentication, password hashing, token validation, user identity, and database constraints.
`npm run test:db` runs only the database constraint tests.

## Authentication API

| Method | Endpoint | JSON body / authentication |
| --- | --- | --- |
| POST | `/api/auth/register` | `name`, `email`, `password` |
| POST | `/api/auth/login` | `email`, `password` |
| GET | `/api/auth/me` | `Authorization: Bearer <token>` header |

Registration and login return `{ user: { id, name, email }, token }`. Tokens expire after one hour.
Passwords require at least 8 characters and at most 72 UTF-8 bytes; they are hashed with bcrypt (cost 12).
Email addresses are trimmed and lowercased. Registration/login share a limit of 30 requests per IP per 15 minutes.
Errors return `{ error }`, with a `field` for form validation errors. The login/signup screens are not built yet.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | API port; default `3001`. |
| `DATABASE_URL` | PostgreSQL application database. |
| `TEST_DATABASE_URL` | Separate database for automated tests. |
| `CLIENT_URL` | Frontend origin; reserved for future deployment/CORS configuration. |
| `JWT_SECRET` | Random token signing secret of at least 32 bytes. |

The example database credentials are for local development. Keep `.env` out of Git.

## Notes

- Dates are calendar dates; future-date validation will use `Asia/Kolkata`. Timestamps use `TIMESTAMPTZ`.
- Slots are `morning`, `after_breakfast`, `after_lunch`, and `after_dinner`. Their uniqueness limits each user to four readings per day.
- PostgreSQL is required despite the assignment's MERN label. Optional features follow the required functionality.
- Demo seed data and screenshots will be added before submission. Potential improvements: charts and pagination.
