# Sweety

A blood glucose tracker for the Kenpath Junior Full Stack Developer assignment.
Built in small, reviewable stages using React, Node.js, Express, and PostgreSQL.

## Current stage

Stage 1: project setup. The React welcome screen checks the Express health endpoint.
Authentication, database tables, readings, and reports are not implemented yet.
See [the build plan](CODEX_PLAN.md) for the next stages and commit checkpoints.

## Prerequisites

- Node.js 24 LTS recommended (Node.js 22.12+ also supported).
- npm (included with Node.js) and Git.
- PostgreSQL will be needed for stage 2; setup does not connect to a database yet.

## Install

From the project root:

```sh
npm install
```

Copy `.env.example` to `.env`. In Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux, use `cp .env.example .env`. Keep `.env` out of Git.

## Run locally

Open two terminals in the project root.

Terminal 1 - Express API:

```sh
npm run dev:server
```

Terminal 2 - React frontend:

```sh
npm run dev:client
```

Open http://localhost:5173. The welcome screen should say **API connected.**
The API is at http://localhost:3001/api/health and returns:

```json
{"status":"ok","service":"sweety-api"}
```

Vite forwards `/api` requests to Express during development. Restart both dev servers
after changing the API port in `.env`.

## Build and checks

```sh
npm run build
```

This builds the client into `client/dist`. `npm start` starts the API without watch
mode; serving the frontend in production will be documented before submission.
There is no automated test suite yet. API tests will be added with the relevant
features, including isolation between users, validation, and report date boundaries.

## Environment variables

All variables are listed in the root `.env.example`. There are no frontend secrets.

| Variable | Purpose | Used in stage 1? |
| --- | --- | --- |
| `PORT` | Express port; also used by the Vite API proxy. Default: `3001`. | Yes |
| `CLIENT_URL` | Frontend origin for later authentication/CORS configuration. | No |
| `DATABASE_URL` | PostgreSQL connection string for migrations and application queries. | No |
| `JWT_SECRET` | Random signing secret for authentication tokens. | No |

## Database, seed, and tests

Database setup and migration commands will be added in stage 2. A demo user and
sample readings will be added before submission. This section will then include
the seed and test commands plus demo login details.

## Notes

- PostgreSQL is the required database, despite the assignment's MERN label.
- Use JavaScript and plain CSS to keep the implementation easy to review.
- Reports will use a selected calendar date: daily, month-to-date, and the whole
  previous calendar month. Define the timezone explicitly when adding date validation.
- Required features come first. Doctor accounts, messaging, Redis, and background
  jobs are outside the initial scope.
- With more time: consider a monthly chart, pagination, and additional frontend tests
  after the required features and submission materials are complete.

## Submission checklist

- [ ] Public GitHub repository with incremental commits.
- [ ] Registration, login, and access limited to the signed-in user's data.
- [ ] Reading CRUD and all validation messages.
- [ ] Daily, month-to-date, and previous-month reports.
- [ ] Meaningful automated tests.
- [ ] Database instructions and demo seed script.
- [ ] Screenshots or a short recording.
- [ ] Fresh-clone walkthrough of the completed README.
