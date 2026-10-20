# CampusStay FPT — API contract changelog (backend → web/mobile)

| Field | Value |
|---|---|
| Version | 1.1 |
| Date | 20/10/2026 |
| Contract | `docs/api-contract.md` = the mentor-confirmed base + every change below (all merged on 20/10/2026) |
| Rule | Every contract change gets a row here **and** is written into `docs/api-contract.md` in the same commit. Additions (A-) are applied by the backend directly. Breaking changes (B-) name the client action; the backend and client changes go in the same PR. Clarifications (C-) describe behaviour the clients must handle. Update the status columns when a side is done. |

Status: **Done** · **Pending** · **—** (nothing to do on that side).

## 1. Additions (non-breaking)

| ID | Endpoint | Request → response | Backend | Web | Mobile |
|---|---|---|---|---|---|
| A-01 | `POST /auth/google` | `{ code, remember }` (web: authorization code from the Google Identity Services popup, `ux_mode: popup`; the server exchanges it with `redirect_uri=postmessage`) **or** `{ credential, remember }` (Android: Google ID token) → `{ token, user }` as sign-in. Only accounts that already exist; only `hd = fpt.edu.vn` (ADR-14). Neither or both → `400 VALIDATION_FAILED`. | Done (code exchange needs `GOOGLE_CLIENT_SECRET`) | Done (sends `code`) | Pending: send `credential` |
| A-02 | `POST /auth/password/forgot` | `{ email }` → `204` always (does not reveal whether the email exists) | Done | Pending: "Forgot password?" form on the sign-in page, then "If an account exists, we sent a link." | — |
| A-03 | `POST /auth/password/reset` | `{ token, newPassword }` → `204`; every session of the user is signed out | Done | Pending: public pages `/reset-password?token=…` and `/set-password?token=…` (C-13), both go to sign-in afterwards | — |
| A-04 | `POST /auth/password/change` | `{ currentPassword, newPassword }` → `204`; the user's other sessions are signed out | Done | Pending: Change password for every role | — |
| A-05 | `POST /devices` | `{ token, platform: 'android' }` → `204` | Pending (S4) | — | Pending: register the FCM token after sign-in and on token refresh |
| A-06 | `POST /devices/unregister` | `{ token }` → `204` | Pending (S4) | — | Pending: call before sign-out |
| A-07 | `POST /webhooks/sepay` | SePay payload → `{ "success": true }` (server to server) | Pending (S2) | — | — |

Password rule (A-03, A-04): 8–64 characters, at least one letter and one number, not containing the email name. Error `400 WEAK_PASSWORD` with a message to show as is.

## 2. Breaking changes

| ID | Change | Why | Backend | Web | Mobile |
|---|---|---|---|---|---|
| B-01 | `GET /check-out/{studentCode}` and `POST /check-out/{studentCode}` become `/check-out/{allocationId}`; items of `GET /check-out` gain `allocationId`. | A student code in the URL ends up in proxy logs and browser history (personal data, Law 91/2025/QH15). An Allocation id also stays unique if the same student checks out of two Terms. | Pending (S4) | Pending: desk Check-out routes and calls use `allocationId` | — |
| B-02 | `POST /auth/sign-in { username, password, remember }` becomes `{ email, password, remember }`; `remember` is optional (default `false`). | ADR-13: CampusStay keeps its own passwords; it cannot check FPT Wi-Fi credentials. To be confirmed with the mentor (OI-14). | Done | Pending: Email field (`type="email"`, `autocomplete="username"`), error texts, remove `VITE_PASSWORD_RESET_URL` | Pending |
| B-03 | IDs are JSON **strings**: every field named `id` or ending in `Id`, at any depth (`"id": "42"`, `"roomTypeId": "3"`). Request bodies and URL parameters send them as strings; the server also accepts numbers. Amounts, counts and rates stay numbers. Replaces C-01. | ADR-15: URL parameters, `<select>` values and browser storage are strings, so clients compare IDs without conversion. | Done for every coded endpoint (`user.id`, `GET /terms`); each new endpoint follows the rule | — (already compares strings; check while doing B-02) | Pending: model IDs as `String` |

## 3. Clarifications (no endpoint change; the clients must handle them)

| ID | Topic | Behaviour | Web |
|---|---|---|---|
| C-01 | IDs | ~~IDs are JSON numbers~~ — replaced by B-03. | — |
| C-02 | Dates | A field ending in `At` is an ISO 8601 instant in UTC (`registrationOpensAt`, `resultsPublishedAt`, `balanceDueAt`, `windowClosedAt` …). A field that holds a calendar day is `YYYY-MM-DD` (`stayStart`, `stayEnd`, `checkInStart`, `checkInEnd`, `checkOutBy`, `requestedFor`, `suggestedDeadline`, `deadline`, `date` …): show it without time-zone conversion and send it back in the same form, never through `toISOString()`. | Pending: Admin › Terms (`resultsPublishedAt` is an instant, `checkOutBy` a date, date fields sent as `YYYY-MM-DD`); Manager › Late check-in (`deadline` is a date) |
| C-03 | Validation errors | `400` with `code: "VALIDATION_FAILED"` and `details.fields = { fieldName: message }`. Show `message` as the toast and each field message under its input. | Pending |
| C-04 | Stale data | `409 STALE_DATA` when another user changed the record since it was loaded: show the message and reload. | Pending |
| C-05 | Paging | `pageSize` maximum is 100; larger values return `400 BAD_PAGE`. | Done (pages ask for ≤ 100) |
| C-06 | Uploads | Photos: max 5 MB each, max 5 per Maintenance Request (Admin › System parameters). Request max 30 MB. Too large → `413 FILE_TOO_LARGE`. | Done (message shown) |
| C-07 | Statuses | The API returns status labels exactly as listed in the contract (e.g. `Awaiting Deposit`, `Awaiting confirmation`, `In progress`). | Done |
| C-08 | Roommate check | When `checksLeft` reaches 0 the next check answers `429 ROOMMATE_CHECKS_EXHAUSTED`. | Done (message shown) |
| C-09 | Sign-in errors | `401 INVALID_CREDENTIALS` (same text for unknown email and wrong password), `401 ACCOUNT_LOCKED` (after 5 failures, 15 minutes), `403 ACCOUNT_DISABLED`, `403 GOOGLE_DOMAIN_NOT_ALLOWED`, `403 NO_ACCOUNT`, `403 GOOGLE_ACCOUNT_MISMATCH`, `401 GOOGLE_TOKEN_INVALID` (try again), `503 GOOGLE_SIGN_IN_DISABLED`, `503 GOOGLE_UNAVAILABLE` (Google unreachable or server misconfigured; added 20/10/2026 with A-01). | Done (message shown) |
| C-10 | `/terms` | The response also contains `total` (list convention). | — |
| C-11 | Deposit window | The Term's `depositHours` (`/admin/terms`) is the window used for that Term's Applications and is what `/terms` returns as `depositWindowHours`. `/admin/fees.depositHours` is only the default proposed when the Admin creates a new Term. | Pending: Admin › Fees helper text says so |
| C-12 | Endpoints not built yet | They answer `404 NOT_FOUND`. Every screen already shows its error state with **Retry**. | — |
| C-13 | Email links | Invitation and password-reset emails link to `{WEB_BASE_URL}/set-password?token=…` (72 hours) and `{WEB_BASE_URL}/reset-password?token=…` (30 minutes). Each token works once. | Pending (A-03) |
| C-14 | Search values | `q` (and the check-in lookup) may hold names or student codes. The server never writes query strings to its logs; the reverse proxy / tunnel access log is configured the same way. | — |
