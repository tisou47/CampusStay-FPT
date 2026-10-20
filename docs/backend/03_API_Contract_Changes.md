# CampusStay FPT — API contract changes (backend → web/mobile)

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 20/10/2026 |
| Base | `docs/api-contract.md` (mentor-confirmed) |
| Rule | Additive changes are applied by the backend directly. Breaking changes are listed here for Claude Code (VS Code) to apply in `web/` in the same PR as the backend change. |

Apply the "Web action" column in `web/`, then copy the new endpoints into `docs/api-contract.md` and `web/src/api/endpoints.js`.

## 1. Additions (non-breaking)

| ID | Endpoint | Request | Response | Web / mobile action |
|---|---|---|---|---|
| A-01 | `POST /auth/google` | `{ credential, remember }` — `credential` is the Google ID token from Google Identity Services | `{ token, user }` (same as sign-in) | Add a "Sign in with Google" button (GIS, `hd: 'fpt.edu.vn'` as a UI hint). New env var `VITE_GOOGLE_CLIENT_ID`. Only accounts that already exist can sign in; there is no sign-up. |
| A-02 | `POST /auth/password/forgot` | `{ email }` | `204` always (does not reveal whether the email exists) | "Forgot password?" link on the sign-in page → form → show "If an account exists, we sent a link." |
| A-03 | `POST /auth/password/reset` | `{ token, newPassword }` | `204`; all sessions of the user are signed out | New public pages `/reset-password?token=…` and `/set-password?token=…` (invitation). Both call this endpoint, then go to sign-in. |
| A-04 | `POST /auth/password/change` | `{ currentPassword, newPassword }` | `204`; other sessions are signed out | Profile › Change password (all roles). |
| A-05 | `POST /devices` | `{ token, platform: 'android' }` | `204` | Mobile only: register the FCM token after sign-in and on token refresh. |
| A-06 | `POST /devices/unregister` | `{ token }` | `204` | Mobile only: call before sign-out. |
| A-07 | `POST /webhooks/sepay` | SePay payload | `{ "success": true }` | None (server to server). |

Password rule (A-03, A-04): 8–64 characters, at least one letter and one number, not containing the email name. Error `400 WEAK_PASSWORD` with a message to show as is.

## 2. Breaking changes (web action required)

| ID | Change | Why | Web action |
|---|---|---|---|
| B-01 | `GET /check-out/{studentCode}` and `POST /check-out/{studentCode}` become `/check-out/{allocationId}`; list items of `GET /check-out` gain `allocationId`. | A student code in the URL ends up in proxy logs and browser history (personal data, Law 91/2025/QH15). An Allocation id also stays unique if the same student checks out of two Terms. | Use `allocationId` in the desk Check-out routes and calls. |

## 3. Clarifications (no contract change, but the web app must handle them)

| ID | Topic | Behaviour |
|---|---|---|
| C-01 | IDs | IDs are JSON numbers (e.g. `"id": 42`). URL params are strings: compare with `String(item.id) === params.id`, never `item.id === params.id`. Request bodies may send ids as numbers or numeric strings. |
| C-02 | Date-only fields | `stayStart`, `stayEnd`, `checkInStart`, `checkInEnd`, `requestedFor`, `deadline` are `YYYY-MM-DD`. Format them as dates without time-zone conversion. Everything ending in `At` is an ISO instant in UTC. |
| C-03 | Validation errors | `400` with `code: "VALIDATION_FAILED"` and `details.fields = { fieldName: message }`. Show `message` as the toast and each field message under its input. |
| C-04 | Stale data | `409 STALE_DATA` when another user changed the record since it was loaded: show the message and reload. |
| C-05 | Paging | `pageSize` maximum is 100; larger values return `400 BAD_PAGE`. |
| C-06 | Uploads | Photos: max 5 MB each, max 5 per Maintenance Request (Admin › System parameters). Request max 30 MB. Too large → `413 FILE_TOO_LARGE`. |
| C-07 | Statuses | The API returns status labels exactly as listed in the contract (e.g. `Awaiting Deposit`, `Awaiting confirmation`, `In progress`). |
| C-08 | Roommate check | When `checksLeft` reaches 0 the next check answers `429 ROOMMATE_CHECKS_EXHAUSTED`. |
| C-09 | Sign-in errors | `401 INVALID_CREDENTIALS` (same text for unknown email and wrong password), `401 ACCOUNT_LOCKED` (after 5 failures, 15 minutes), `403 ACCOUNT_DISABLED`, `403 GOOGLE_DOMAIN_NOT_ALLOWED`, `403 NO_ACCOUNT`, `503 GOOGLE_SIGN_IN_DISABLED`. |
| C-10 | `/terms` | The response also contains `total` (list convention). |
