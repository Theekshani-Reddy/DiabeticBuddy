# API reference

Base path: `/api`. Send request bodies as JSON. Errors return `{ error }`, with a
`field` for input errors. Protected endpoints require `Authorization: Bearer <token>`.

## Authentication

| Method | Endpoint | Body / response |
| --- | --- | --- |
| POST | `/auth/register` | Body: `name`, `email`, `password`. Returns `201` with `{ user, token }`. |
| POST | `/auth/login` | Body: `email`, `password`. Returns `200` with `{ user, token }`. |
| GET | `/auth/me` | Protected. Returns `200` with `{ user }`. |

`user` contains only `id`, `name`, and `email`. Passwords are hashed using bcrypt
(cost 12) and never returned. Registration requires at least 8 characters and at
most 72 UTF-8 bytes. Emails are trimmed and lowercased. Tokens expire after one hour.
Registration and login share a limit of 30 requests per IP per 15 minutes.

Invalid input returns `400`, invalid credentials or sessions return `401`, an
existing registration email returns `409`, and excessive auth attempts return `429`.

## Readings

All endpoints below are protected and operate only on the signed-in user's records.
Ownership comes from the token; a submitted `user_id` does not change ownership.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| POST | `/readings` | Creates a reading. Returns `201` with `{ reading }`. |
| GET | `/readings` | Returns `200` with `{ readings: [...] }`, newest date first, then slot order. |
| GET | `/readings?date=YYYY-MM-DD` | Filters to a calendar date. No results returns `{ readings: [] }`. |
| PUT | `/readings/:id` | Replaces date, slot, and value. Returns `200` with `{ reading }`. |
| DELETE | `/readings/:id` | Deletes a reading. Returns `204` with no response body. |

Create and update body:

```json
{ "date": "2026-10-15", "slot": "after_lunch", "value": 142 }
```

`date` must be a real calendar date in `YYYY-MM-DD` format. `value` must be a JSON
number, a whole number from 40 through 600, in mg/dl. Numeric strings are rejected.

| Slot code | Display label |
| --- | --- |
| `morning` | Morning (fasting) |
| `after_breakfast` | After breakfast |
| `after_lunch` | After lunch |
| `after_dinner` | After dinner |

A returned reading contains `id`, `date` (calendar-date string), `slot`, `value`,
and `created_at` (timestamp). Future-date checks use the current date in `Asia/Kolkata`.
Listing a future date is permitted and returns an empty list when there are no readings.

| Rule | Error message | Status |
| --- | --- | --- |
| Missing value | Please enter a glucose value. | `400` |
| Non-integer or outside 40-600 | Value must be between 40 and 600 mg/dl. | `400` |
| Duplicate slot | You already have an After lunch reading for this date. | `409` |
| Day already has four readings | You can add only 4 readings per day. | `409` |
| Future date on create/update | Date cannot be in the future. | `400` |

Duplicate messages use the actual slot's display label. An invalid date or slot also
returns `400` with a clear message. An unknown or unowned reading returns the same
`404` response: `{ "error": "Reading not found." }`.

Value, date, and slot are validated before checking daily conflicts. When a day
already has four readings, the daily-limit error takes precedence over a duplicate
on create. Updates exclude the edited reading from these checks. Four allowed slots
plus the unique database constraint enforce the daily cap even for concurrent writes.
