# Manual API testing

Start PostgreSQL and the API using the README. The default base URL is
`http://localhost:3001/api`. React is not required for API testing.

| Method | Path | Purpose | Success | Token required |
| --- | --- | --- | --- | --- |
| GET | `/health` | API status | 200 | No |
| POST | `/auth/register` | Create account; returns user and token | 201 | No |
| POST | `/auth/login` | Log in; returns user and token | 200 | No |
| GET | `/auth/me` | Current user | 200 | Yes |
| POST | `/readings` | Add reading | 201 | Yes |
| GET | `/readings` | List readings; optional date/page/limit | 200 | Yes |
| PUT | `/readings/:id` | Replace date, slot and value | 200 | Yes |
| DELETE | `/readings/:id` | Delete reading | 204 | Yes |
| GET | `/reports/daily?date=YYYY-MM-DD` | Selected day | 200 | Yes |
| GET | `/reports/mtd?date=YYYY-MM-DD` | Month start to selected day | 200 | Yes |
| GET | `/reports/monthly?date=YYYY-MM-DD` | Whole previous month | 200 | Yes |

## PowerShell walkthrough

Run these blocks in order in the same PowerShell window. This creates a separate
API test account and deletes its example reading at the end. The test account remains
available for further manual testing. The date uses the app's India timezone.

```powershell
$apiBase = 'http://localhost:3001/api'
$email = 'api-' + [guid]::NewGuid().ToString('N') + '@example.test'
$password = 'ApiTest123!'
$date = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTimeOffset]::UtcNow, 'India Standard Time').ToString('yyyy-MM-dd')

Invoke-RestMethod "$apiBase/health"

$registration = @{ name = 'API Test'; email = $email; password = $password } | ConvertTo-Json
$registered = Invoke-RestMethod -Method Post -Uri "$apiBase/auth/register" -ContentType 'application/json' -Body $registration

$credentials = @{ email = $email; password = $password } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post -Uri "$apiBase/auth/login" -ContentType 'application/json' -Body $credentials
$headers = @{ Authorization = "Bearer $($session.token)" }
Invoke-RestMethod "$apiBase/auth/me" -Headers $headers
```

Create, list, filter, paginate, and edit a reading:

```powershell
$body = @{ date = $date; slot = 'morning'; value = 112 } | ConvertTo-Json
$created = Invoke-RestMethod -Method Post -Uri "$apiBase/readings" -Headers $headers -ContentType 'application/json' -Body $body
$readingId = $created.reading.id

Invoke-RestMethod "$apiBase/readings" -Headers $headers | ConvertTo-Json -Depth 6
Invoke-RestMethod "$apiBase/readings?date=$date" -Headers $headers | ConvertTo-Json -Depth 6
Invoke-RestMethod "$apiBase/readings?page=1&limit=20" -Headers $headers | ConvertTo-Json -Depth 6

$body = @{ date = $date; slot = 'morning'; value = 140 } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri "$apiBase/readings/$readingId" -Headers $headers -ContentType 'application/json' -Body $body

Invoke-RestMethod "$apiBase/reports/daily?date=$date" -Headers $headers | ConvertTo-Json -Depth 6
Invoke-RestMethod "$apiBase/reports/mtd?date=$date" -Headers $headers | ConvertTo-Json -Depth 6
Invoke-RestMethod "$apiBase/reports/monthly?date=$date" -Headers $headers | ConvertTo-Json -Depth 6
```

Check decimal validation. This should return HTTP 400 with
`{"field":"value","error":"Please enter a whole number."}`:

```powershell
$invalid = @{ date = $date; slot = 'after_breakfast'; value = 132.5 } | ConvertTo-Json
try {
    Invoke-RestMethod -Method Post -Uri "$apiBase/readings" -Headers $headers -ContentType 'application/json' -Body $invalid
} catch {
    $_.ErrorDetails.Message
}
```

Delete only the reading created above. HTTP 204 has no response body:

```powershell
Invoke-RestMethod -Method Delete -Uri "$apiBase/readings/$readingId" -Headers $headers
Invoke-RestMethod "$apiBase/readings?date=$date" -Headers $headers | ConvertTo-Json -Depth 6
```

Other useful checks: blank value, 39/601, duplicate slot, all four slots, future
date, and invalid page/limit. A new signup password must have 8+ characters,
uppercase/lowercase letters, a digit, and a symbol; spaces do not count as symbols.
Passwords are limited to 72 UTF-8 bytes. Existing accounts keep their original login.
See [API validation messages](API.md) for exact responses. Tokens expire after one hour;
log in again and rebuild `$headers` when needed.

## Postman

Use the same methods and URLs. For POST/PUT, select **Body → raw → JSON** and
use the payloads in the API reference. Log in, then set **Authorization → Bearer Token**
to the returned `token` for protected requests. The health route can also be opened
directly in a browser; protected routes require the authorization header.
