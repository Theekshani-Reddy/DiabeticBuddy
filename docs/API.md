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
(cost 12) and never returned. Registration requires at least 8 characters, with an
uppercase letter, lowercase letter, digit, and symbol. Spaces do not count as symbols.
Passwords have a 72 UTF-8 byte maximum to avoid bcrypt truncation. These character
requirements apply to signup; existing accounts can still log in with their original
passwords. Emails are trimmed and lowercased. Tokens expire after one hour.
Registration and login share a limit of 30 requests per IP per 15 minutes.

Invalid input returns `400`, invalid credentials or sessions return `401`, an
existing registration email returns `409`, and excessive auth attempts return `429`.

See the [manual testing guide](TESTING.md) for the complete endpoint list and
copyable PowerShell examples.

## Readings

All endpoints below are protected and operate only on the signed-in user's records.
Ownership comes from the token; a submitted `user_id` does not change ownership.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| POST | `/readings` | Creates a reading. Returns `201` with `{ reading }`. |
| GET | `/readings` | Returns `200` with `{ readings: [...] }`, newest date first, then slot order. |
| GET | `/readings?date=YYYY-MM-DD` | Filters to a calendar date. No results returns `{ readings: [] }`. |
| GET | `/readings?page=1&limit=20` | Returns a page of readings with pagination metadata; supports the same date filter. |
| PUT | `/readings/:id` | Replaces date, slot, and value. Returns `200` with `{ reading }`. |
| DELETE | `/readings/:id` | Deletes a reading. Returns `204` with no response body. |

Pagination is optional. Supplying either `page` or `limit` enables it, with defaults
of page `1` and limit `20`. With neither parameter, the existing unpaginated
`{ readings }` response is preserved. Supply positive whole numbers using digits
without leading zeros; `limit` must be between `1` and `100`. Invalid or repeated
parameters return `400` with `field: "page"` or `field: "limit"`. Pages/offsets must
fit JavaScript's safe integer range; an excessive offset returns `400`.

For example, `/readings?page=2&limit=2` for a user with five readings returns:

```json
{
  "readings": [
    { "id": 3, "date": "2026-10-15", "slot": "after_lunch", "value": 142, "created_at": "2026-10-15T08:00:00.000Z" },
    { "id": 4, "date": "2026-10-15", "slot": "after_dinner", "value": 135, "created_at": "2026-10-15T14:00:00.000Z" }
  ],
  "pagination": { "page": 2, "limit": 2, "total": 5, "totalPages": 3 }
}
```

Totals include only the authenticated user's readings matching the date filter.
Order remains newest date first, then Morning, After breakfast, After lunch,
After dinner. Empty results have `total: 0` and `totalPages: 0`. A page beyond
the last page returns `200` with an empty array and the requested page number.
Concurrent edits can move readings between pages; reports always use the full
date range and are not paginated.

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
| Decimal value | Please enter a whole number. | `400` |
| Outside 40-600 or a non-numeric JSON value | Value must be between 40 and 600 mg/dl. | `400` |
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

## Reports

All reports are protected and use only the signed-in user's readings. Date ranges
are inclusive and based on the reading's calendar date, not its creation timestamp.

| Method | Endpoint | Range for `date=2026-10-15` |
| --- | --- | --- |
| GET | `/reports/daily?date=YYYY-MM-DD` | 15 October 2026 |
| GET | `/reports/mtd?date=YYYY-MM-DD` | 1-15 October 2026 |
| GET | `/reports/monthly?date=YYYY-MM-DD` | 1-30 September 2026 (whole previous month) |

Omitting `date` uses today's date in `Asia/Kolkata`. A supplied date must be a real
calendar date in `YYYY-MM-DD` format; invalid dates return `400` with `field: "date"`.
Future report dates are permitted for read-only queries, consistent with reading filters.

Example daily response:

```json
{
  "type": "daily",
  "date": "2026-10-15",
  "startDate": "2026-10-15",
  "endDate": "2026-10-15",
  "highest": 148,
  "lowest": 112,
  "average": 134,
  "count": 3,
  "readings": [
    { "id": 1, "date": "2026-10-15", "slot": "morning", "value": 112, "created_at": "2026-10-15T01:00:00.000Z" },
    { "id": 2, "date": "2026-10-15", "slot": "after_breakfast", "value": 148, "created_at": "2026-10-15T04:00:00.000Z" },
    { "id": 3, "date": "2026-10-15", "slot": "after_lunch", "value": 142, "created_at": "2026-10-15T08:00:00.000Z" }
  ]
}
```

All reports include `readings`, ordered by calendar date and then slot. Monthly
and month-to-date responses use the same readings for the line chart and summary,
with at most 124 readings per response. All three reports return
highest, lowest, average, and count. The average uses individual readings and is
rounded to one decimal as a JSON number; the frontend formats `134` as `134.0`.

Empty reports return `200` with `count: 0` and `highest`, `lowest`, and `average` set
to `null`; `readings` is an empty array. The UI uses this to show its empty state. Reports
are recalculated from current data on every request and responses use `Cache-Control: no-store`.
