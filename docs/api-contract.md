# CampusStay — API contract

What the web and Android apps send and expect from the CampusStay backend. On the web, every call goes through `web/src/api/client.js`; the endpoint list lives in `web/src/api/endpoints.js`, and each page repeats the shapes it reads in a comment at the top of its file.

Version 1.5 (21/10/2026): the mentor-confirmed contract plus the changes A-01…A-11, B-01…B-03 and C-01…C-25 of [`backend/03_API_Contract_Changes.md`](backend/03_API_Contract_Changes.md). Every later change is logged there first and written here in the same commit.

## Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `VITE_API_BASE_URL` (default `/api`). In development Vite proxies `/api` to `VITE_API_PROXY_TARGET`. |
| Auth | `POST /auth/sign-in` or `POST /auth/google` returns a token. Every other call sends `Authorization: Bearer <token>`. A `401` signs the user out. |
| Errors | Non-2xx responses return JSON `{ message, code?, details? }`. `message` is shown to the user as is, so write it for them. Validation: `400 VALIDATION_FAILED` with `details.fields = { fieldName: message }`, shown under each input. `409 STALE_DATA`: someone changed the record since it was loaded; show the message and reload. |
| IDs | JSON **strings**: every field named `id` or ending in `Id`, at any depth (`"id": "42"`). Send them back as strings (numbers are accepted). Amounts, counts and rates are numbers. |
| Lists | Return `{ items: [...], total }`. Accept `page` (1-based), `pageSize` (default 20, max 100, else `400 BAD_PAGE`), `q` and the filters named below. Extra fields (`summary`, `counts`, options) sit next to `items`. |
| Scope | Term-scoped calls take `termId`. Staff and Manager calls take `block` (empty = every Block the user may see; a Block outside the user's scope = `403 BLOCK_OUT_OF_SCOPE`). The server enforces the user's scope. |
| Dates | A field ending in `At` is an ISO 8601 instant in UTC. A field that holds a calendar day (`stayStart`, `stayEnd`, `checkInStart`, `checkInEnd`, `checkOutBy`, `requestedFor`, `suggestedDeadline`, `deadline`, `date` …) is `YYYY-MM-DD`: show it without time-zone conversion and send it back in the same form. The app formats them as `dd/mm/yyyy` and `dd/mm/yyyy hh:mm`. |
| Money | Integer VND. |
| Rates | Fractions (`0.2` = 20%), except fields named `…Percent`. |
| Uploads | `multipart/form-data` where noted (photos, receipts, CSV). A list of files repeats the same part name (`photos`). Photos: max 5 MB each, max 5 per Maintenance Request (Admin › System parameters); a request is at most 30 MB. Too large → `413 FILE_TOO_LARGE`. |
| Not built yet | An endpoint that the backend has not built yet answers `404 NOT_FOUND`; the screen shows its error state with **Retry**. |
| Exports | `GET /exports/{report}?…filters` returns the file with `Content-Disposition: attachment; filename="…"`. The server writes each export to the Audit Log. |
| Statuses | Application: Draft, Awaiting Roommate, Awaiting Deposit, Submitted, Under Review, Approved, Waitlisted, Allocated, Rejected, Cancelled, Expired. Invoice: Unpaid, Paid, Overdue, Awaiting confirmation, Refunded, Void, Upcoming. Request: Submitted, Assigned, In progress, Resolved, Closed, Pending, Approved, Rejected. |

Removed from this version: Period of Stay and renewal. There are no renewal endpoints, and Applications have no `period` field.

---

## Session and shared

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| POST | `/auth/sign-in` | `{ email, password, remember }` — the account email and the CampusStay password (not the FPT Wi-Fi credentials); `remember` is optional (default `false`) | `{ token, user: { id, name, email, role: 'student'\|'staff'\|'manager'\|'admin', studentCode?, title?, blocks?: [string] } }` |
| POST | `/auth/google` | `{ code, remember }` (web: authorization code from the Google Identity Services popup, `ux_mode: popup`; the server exchanges it with `redirect_uri=postmessage`) or `{ credential, remember }` (Android: Google ID token) | Same as sign-in. Only accounts that already exist; only `@fpt.edu.vn` Google Workspace accounts. |
| POST | `/auth/sign-out` | — | `204` |
| GET | `/auth/me` | — | `user` |
| POST | `/auth/password/forgot` | `{ email }` | `204` always (does not reveal whether the email exists) |
| POST | `/auth/password/reset` | `{ token, newPassword }` — used by both the reset and the set-password (invitation) page | `204`; every session of the user is signed out |
| POST | `/auth/password/change` | `{ currentPassword, newPassword }` | `204`; the user's other sessions are signed out |
| POST | `/devices` · `/devices/unregister` | Android only: `{ token, platform: 'android' }` after sign-in and on token refresh · `{ token }` before sign-out | `204`; notifications are then also pushed (C-25) |
| GET | `/terms` | — | `{ items: [{ id, name, current, registrationOpen, stayStart, stayEnd, registrationOpensAt, registrationClosesAt, resultsPublishedAt, balanceDueAt, checkInStart, checkInEnd, depositWindowHours }], total }` |
| POST | `/webhooks/sepay` | SePay bank-feed payload (server to server, `Authorization: Apikey <key>`) | `{ "success": true }` (A-07) |
| POST | `/dev/invoices/{id}/simulate-payment` | Dev profile only (A-08) | `204` |
| GET | `/files/{id}?exp&sig` | A signed link handed out by another endpoint (`receipt.url`, `photos[].url`); no token | The file; `404` once expired (A-10) |
| GET | `/notifications?limit` | — | `{ items: [{ id, title, body, createdAt, link, read }], unread }` |
| POST | `/notifications/read-all`, `/notifications/{id}/read` | — | `204` |

- **Sign-in errors:** `401 INVALID_CREDENTIALS` (same text for an unknown email and a wrong password), `401 ACCOUNT_LOCKED` (after 5 failures, for 15 minutes), `403 ACCOUNT_DISABLED`, `403 NO_ACCOUNT`, `403 GOOGLE_DOMAIN_NOT_ALLOWED`, `403 GOOGLE_ACCOUNT_MISMATCH`, `401 GOOGLE_TOKEN_INVALID` (try again), `503 GOOGLE_SIGN_IN_DISABLED`, `503 GOOGLE_UNAVAILABLE` (Google cannot be reached or the server is misconfigured). `POST /auth/google` without exactly one of `code` and `credential` → `400 VALIDATION_FAILED`.
- **Password rule:** 8–64 characters, at least one letter and one number, not containing the email name; otherwise `400 WEAK_PASSWORD` with a message to show as is.
- **Email links:** invitation and reset emails open the web pages `/set-password?token=…` (valid 72 hours) and `/reset-password?token=…` (valid 30 minutes). Both call `POST /auth/password/reset`, then go to Sign In. Each token works once. There is no self sign-up.

## Student

### Home, profile, catalog

- `GET /students/me/home?termId` → `{ firstName, term, application: { id, status, roomTypeName, roomClassName } | null, allocation: { room, bed, block, floor } | null, checkedIn, dueInvoice: { id, type, title, amount, dueAt } | null, invoices: { due, total }, openRequests }`
- `GET /students/me/profile` → `{ name, studentCode, gender, major, cohort, hometown, contact: { phone, email, emergencyName, relationship, emergencyPhone } }`
- `GET /catalog?termId` → `{ roomTypes: [{ id, name, beds, description? }], roomClasses: [{ id, name, surchargeRate, amenities: [string] }], prices: [{ roomTypeId, roomClassId, termPrice }], depositRate, utilityDeposit, preferenceOptions: { region: [string], semester: [string], major: [string] }, relationships: [string] }`

### Application wizard

- `GET /applications/eligibility?termId` → `{ term, eligible, checks: [{ title, detail, passed }] }`
- `POST /applications/roommate-check` `{ termId, studentCode }` → `{ valid, checksLeft }`. Return the same answer for every unusable code (privacy). When `checksLeft` is 0 the next check answers `429 ROOMMATE_CHECKS_EXHAUSTED`.
- `POST /applications` → `{ id, depositInvoiceId, depositDueAt }`

```json
{
  "termId": "…",
  "roomTypeId": "…",
  "roomClassId": "…",
  "roommate": {
    "mode": "invite | auto",
    "studentCode": "only when mode = invite",
    "preferences": { "region": "…", "semester": "…", "major": "…" }
  },
  "contact": { "phone": "…", "email": "…", "emergencyName": "…", "relationship": "…", "emergencyPhone": "…" },
  "consent": { "matching": true, "rules": true }
}
```

`roommate` is sent only for Room Types with 2 Beds. `roommate.preferences` is the free, optional **Roommate preferences** service: it is sent only when the student chose *Match me automatically* and turned the service on. The matcher weighs it on top of the Admin Matching Criteria (see the boost setting).

### Applications

Application and Invoice `id`s are their codes (`APP-SP27-000123`, `INV-SP27-000123`); for a student `GET /terms` marks their own Term as `current`, and the Application endpoints always use the Term open for registration (C-19). Wizard rules, errors and payment behaviour: C-20.


- `GET /students/me/applications?page&pageSize` → `{ items: [{ id, termName, roomTypeName, roomClassName, deposit, submittedAt, status }], total, activeTermName }`
- `GET /applications/{id}` (student view) → `{ id, status, termName, roomTypeName, roomClassName, surchargeRate, twoBed, roommate: { mode, studentCode, status, preferences } | null, allocation: { room, bed, block } | null, events: [{ title, at, state: 'done'|'current'|'upcoming', note }], invoices: [{ id, type, title, amount, status, dueAt, paidAt }], canCancel, cancelPolicy, resultsPublishedAt, registrationClosesAt, decisionNote }`
- `POST /applications/{id}/cancel` `{ reason? }`
- `GET /students/me/roommate-invitation` → `{ invitation: { id, fromName, expiresAt, termName, stayStart, stayEnd, roomTypeName, roomClassName, surchargeRate, termPrice, deposit, depositWindowHours, registrationClosesAt } | null }`
- `POST /roommate-invitations/{id}/respond` `{ accept }` → `{ applicationId, depositInvoiceId }`
- `GET /students/me/round2-offer` → `{ offer: { id, expiresAt, termName, application: { id, roomTypeName, roomClassName, termPrice, depositPaid }, options: [{ id, roomTypeName, roomClassName, block, note, fill, termPrice, difference }] } | null }`
- `POST /round2-offers/{id}/respond` `{ accept, optionId? }` → `{ balanceInvoiceId }`

### Invoices and payment

- `GET /students/me/invoices?termId&page&pageSize` → `{ items: [{ id, type: 'deposit'|'balance'|'utility'|'roomChange', typeLabel, title, termName, amount, dueAt, status, paidAt, paymentMethod, transferContent }], total, summary: { outstanding, dueCount, nextDueAt, paidTotal, paidCount, upcoming: { typeLabel, amount, note } | null } }`
- `GET /invoices/{id}` → `{ id, title, type, typeLabel, amount, status, issuedAt, dueAt, paidAt, room, utilityDeposit, lines: [{ label, amount }] | null, breakdown: { segments: [{ from, to, note, residents, kwh, m3, electricityCost, waterCost, share }], subtotal, roundingNote, priceKwh, priceM3 } | null }`
- `GET /invoices/{id}/payment` → `{ invoice: { id, title, typeLabel, amount, status, dueAt, paidAt, reference }, qr: { image, expiresAt } | null, bank: { name, accountName, accountNumber }, transferContent }`. The page asks again every 5 seconds until `status` is `Paid`.
- `POST /invoices/{id}/payment/refresh` → new `qr`
- `GET /invoices/{id}/receipt` → PDF file

### My Room and requests

- `GET /students/me/allocation?termId` → `{ term: { id, name, stayStart, stayEnd, resultsPublishedAt }, allocation: { room, bed, block, blockLabel, floor, roomTypeName, roomClassName, amenities, allocatedAt, status, pass } | null, roommates: [{ name, bed }], roommateCapacity, checkIn: { start, end, deskHours, location, checkedInAt } | null, balance: { invoiceId, amount, status, dueAt, paidAt } | null, application: { id, status } | null, rulesUrl }`
- `GET /students/me/requests?kind=maintenance|room-changes&termId&page&pageSize` → `{ items, total, counts: { maintenance, roomChanges }, room }`
  - maintenance item: `{ id, title, location, category, reportedAt, status, assignee, visitWindow }`
  - room-change item: `{ id, typeLabel, summary, submittedAt, status, decision: { note, at } | null, invoiceId, invitationId }`
- `GET /maintenance-requests/options?for=student|staff` → `{ categories, locations, priorities, staff: [{ id, name, skills }] }`
- `POST /maintenance-requests` (multipart) `title, description, category, location, urgency, staffMayEnter, photos` (one `photos` part per file) → `{ id }`
- `GET /maintenance-requests/{id}` (student view) → `{ id, title, status, room, category, location, reportedAt, assignee, visitWindow, description, events: [{ who, at, message }] }` (public updates only)
- `POST /maintenance-requests/{id}/confirm` `{ fixed, comment? }` → `204`
- `GET /room-changes/options?termId` → `{ currentRoom: { room, bed, roomTypeId, roomTypeName, roomClassId, roomClassName } | null, roomTypes, roomClasses, prices, remainingDays, termDays, reasons, hasOpenRequest }`
- `POST /room-changes` `{ termId, kind: 'same'|'class'|'type', roomTypeId, roomClassId, reason, details? }` → `{ id }`

### Swaps

- `POST /swaps` `{ studentCode, reason? }` → `{ id }`
- `GET /swap-board?termId` → `{ blocks, myPost: { block, roomTypeId, roomClassId, expiresAt } | null, items: [{ id, offeredRoomTypeName, offeredRoomClassName, floor, block, wants, priceDifference, requested, crossBlock }] }`
- `PUT /swap-board/my-post` `{ termId, block|null, roomTypeId, roomClassId }`
- `POST /swap-board/posts/{id}/request`
- `GET /swap-invitations/{id}` → `{ id, status, expiresAt, crossBlock, priceDifference, give: { room, bed, roomTypeName, roomClassName, block, termPrice }, get: { … } }`
- `POST /swap-invitations/{id}/respond` `{ accept }`

---

## Staff (also used by the Manager for its Block)

### Dashboard

`GET /dashboards/staff?termId&block` → `{ kpis: { toReview, submitted, underReview, paymentsToConfirm, proposal: { runId, proposed, requested, conflicts, waitlisted, committedBlocks, totalBlocks } | null, roomsOutOfService, firstOutOfService: { room, since } | null }, attention: [{ id, kind: 'proposal'|'payments'|'room'|'queue'|'expired'|'maintenance', severity, title, body, link, cta }], applicationsByStatus: [{ status, count }], applicationsTotal, checkInPlan: { start, end, days: [{ date, morning, afternoon }] } | null, bedsByBlock: [{ block, proposed, capacity }] }`

### Applications and payments

- `GET /applications?termId&block&q&status&roomTypeId&roomClassId&submittedWithin&page&pageSize` → `{ items: [{ id, studentName, studentCode, pair, roomTypeName, roomClassName, depositStatus, depositPaidAt, status }], total, counts: { [status]: number } }`. `status` may be a comma-separated list.
- `GET /applications/{id}` (back-office view) → `{ id, status, termName, student: { name, studentCode, gender, cohort, major, hometown, phone, emergencyContact, syncedAt }, roomTypeName, roomClassName, surchargeRate, termPrice, roommate, eligibility: [{ title, passed }], deposit: { invoiceId, amount, method, paidAt, status } | null, activity: [{ text, at }] }`
- `POST /applications/{id}/review` `{ decision: 'Approved'|'Rejected', note? }` (note required when rejecting) → `204`
- `POST /applications/bulk-review` `{ ids, decision }` → `{ approved, skipped }`
- `GET /payments?termId&block&q&type&status&method&date=today|7d|term&page&pageSize` → `{ items: [{ invoiceId, studentName, studentCode, type, typeLabel, amount, method, paidAt, dueAt, status, reference, transferContent, receipt: { name, size, url } | null }], total, summary: { collectedToday, collectedTodayCount, awaitingConfirmation, unpaidDeposits, depositsPaid, depositsSubmitted } }`
- `POST /payments/{invoiceId}/confirm` (multipart) `amount, reference, receipt?` → `204`
- `GET /payments/{invoiceId}/receipt-file` → the attached receipt (A-09)

Scope, review rules and errors: C-21; payment filters, summary and confirmation rules: C-22.

### Assignment

- `GET /assignment-runs?termId&block` → `{ current: { id, kind, status, statusTone, stage (0–5), startedAt, finishedAt, startedBy, snapshot, input, proposed, conflicts, waitlisted, averageFit } | null, history: [{ id, kind, startedAt, startedBy, proposed, conflicts, waitlisted, status }], rules: { snapshot, groups: [{ title, items: [string] }] } }`
- `POST /assignment-runs` `{ termId, dryRun }` → `{ id }`
- `GET /assignment-runs/{runId}/proposal?block&view=conflicts|proposed|all&q&page&pageSize` → `{ run: { id, status, snapshot }, blocks: [{ block, total, conflicts, status: 'review'|'submitted'|'approved' }], waitlistedCount, items: [{ applicationId, studentName, studentCode, pair, preference, bed, fit, issue: { label, tone } | null, resolved, reason }], total, commitSummary: { students, balanceDueAt } }`. `block=waitlisted` lists waitlisted Applications.
- `GET /assignment-runs/{runId}/conflicts/{applicationId}` → `{ applicationId, studentName, preference, bed, issue: { label, title, detail, tone }, options: [{ key, label, detail, recommended }] }`
- `POST /assignment-runs/{runId}/conflicts/{applicationId}/resolve` `{ optionKey }` or `{ waitlist: true }` → `{ applicationId, bed, resolved, waitlisted }`
- `POST /assignment-runs/{runId}/commit` `{ block }` → `204` (sends the Block to its Manager)

### Inventory

- `GET /inventory/structure?block` → `{ blocks: [{ block, floors: [number] }], outOfServiceReasons: [string] }`
- `GET /inventory/rooms?termId&block&floor` → `{ roomClassName, rooms: [{ code, block, floor, roomTypeName, roomClassName, capacity, outOfService: { since, reason, by, note } | null, beds: [{ id, state: 'allocated'|'available'|'oos', occupant: { name, studentCode } | null }] }], summary: { beds, allocated, available, outOfService } }`
- `GET /inventory/rooms/{code}` → `{ code, block, floor }`
- `POST /inventory/rooms/{code}/out-of-service` `{ reason, note? }` · `POST /inventory/rooms/{code}/back-in-service`
- `floor` is required; `block` may be empty only when the user has one Block; without `termId` the current Term fills the Beds. A Bed `id` is its code (`A-305-B`). `reason` is one of `outOfServiceReasons`. A Room whose Bed holds an active Allocation cannot go out of service (`409 ROOM_OCCUPIED`). See C-17.

### Maintenance

- `GET /maintenance-requests?termId&block&q&status&priority&category&assigneeId&page&pageSize` → `{ items: [{ id, room, title, category, priority, reportedAt, assignee: { id, name } | null, status }], total, summary: { open, urgent, urgentUnassigned, unassigned, oldestUnassignedAt, resolvedThisWeek, waitingConfirmation } }`. `status=open` means Submitted, Assigned or In progress; `assigneeId=none` means unassigned.
- `GET /maintenance-requests/{id}` (back-office view) → `{ id, title, status, room, bed, category, location, reportedAt, reporter: { name, role }, urgency, priority, staffMayEnter, description, photos: [{ url, name }], assignee, suggestedAssigneeId, visitWindow, events: [{ who, role, at, text, message, internal }], roomSummary: { residents, capacity, otherOpen, pastThisTerm } }`
- `PATCH /maintenance-requests/{id}` `{ priority?, assigneeId?, visitWindow?, status? }` → `204` (only the fields sent change)
- `POST /maintenance-requests/{id}/updates` `{ message, internal }` → `204`

Ids are codes (`MR-000321`); reporting, filters, transitions and notifications: C-24. `photos[].url` are signed links (A-10).

### Room changes and swaps

- `GET /room-changes?termId&block&status&kind&page&pageSize` → `{ items: [{ id, studentName, studentCode, kind, from: { room, bed, roomTypeName, roomClassName }, to: { roomTypeName, roomClassName }, reason, difference, submittedAt, status, decision: { by, at, bed, reason, note } | null }], total, rejectReasons }`
- `GET /room-changes/{id}/matching-beds` → `{ items: [{ bedId, floor, roommates }] }`
- `POST /room-changes/{id}/decision` `{ decision: 'Approved', bedId }` or `{ decision: 'Rejected', reason, message? }` → `{ note }`
- `GET /swaps?termId&block&kind&status&page&pageSize` → `{ items: [{ id, kind, agreedAt, crossBlock, status, a: { name, studentCode, room, bed, roomTypeName, roomClassName }, b: { … }, checks: [{ label, passed }], decision: { by, at, reason } | null }], total }`
- `POST /swaps/{id}/decision` `{ decision: 'Approved'|'Rejected', reason? }`

### Desk

- `GET /check-in/today?termId&block` → `{ date, block, expected, checkedIn, waiting, blocked, recent: [{ name, bed, at }] }`
- `GET /check-in/lookup?termId&q` → `{ student: { name, studentCode, room, bed, block, floor, status: 'ready'|'blocked'|'checked-in'|'not-allocated', checks: [{ label, passed }], owes: { balance, utilityDeposit } | null, checkedInAt, handOverItems: [string] } | null }`. `q` is a student code, a name or the QR pass payload typed by a scanner.
- `POST /check-in` `{ studentCode, items, note? }` → `{ checkedInAt }`
- `GET /check-out?termId&block&q&reason&page&pageSize` → `{ date, pendingCount, reasons, items: [{ allocationId, studentCode, name, room, bed, roomTypeName, roomClassName, reason, status, checkedOutAt }], total }`
- `GET /check-out/{allocationId}` → `{ …row, reading: { electricity, water }, settlement: { held, periodLabel, share, unpaid, damage, refund }, refundStatus }`
- `POST /check-out/{allocationId}` `{ electricity, water, conditionGood, keyReturned, damageCharge, draft }` → `{ refund, refundStatus }`
- The URL carries the Allocation id, never the student code (personal data, B-01). Check-in rules, the pass and the Utility Deposit settlement: C-23 (`allocation.pass`, A-11).

### Meter readings

- `GET /meter-periods?block` → `{ items: [{ id, label, closed }] }`
- `GET /meter-periods/{id}/readings?block&status&page&pageSize` → `{ period: { id, label, closed, dueAt }, summary: { roomsDue, entered, missing, segments }, items: [{ room, roomTypeName, roomClassName, residents, electricity: { previous, current, cut: { date, value } | null }, water: { … }, status: 'Entered'|'Confirmed'|'Missing'|'Check value' }], total }`
- `GET /meter-periods/{id}/readings/{room}` → `{ …item, priceKwh, priceM3, roundingNote, segments: [{ from, to, residents, kwh, m3, electricityCost, waterCost }], shares: [{ label, amount }] }`
- `PUT /meter-periods/{id}/readings/{room}` `{ electricity, water }` · `POST …/readings/{room}/confirm`
- `POST /meter-periods/{id}/import` (multipart `file` CSV) → `{ imported }` · `POST /meter-periods/{id}/close` → `{ invoicesIssued }`

### Inspections

- `GET /inspection-runs/current?termId&block` → `{ run: { id, date, dueAt, scheduleName, scope, rooms, inspected, failed, unreachable, inspectorName, checklist: { name, version, items: [{ id, label, category, severity }] } } | null }`
- `GET /inspection-runs/{id}/rooms?page&pageSize` → `{ items: [{ room, roomTypeName, roomClassName, status, results: [{ itemId, result: 'Pass'|'Fail'|'Not checked', note }] }], total }`
- `PUT /inspection-runs/{id}/rooms/{room}` `{ results }` → `{ createdRequests: [id] }`. A failed item creates a Maintenance Request; its severity sets the request priority.
- `POST /inspection-runs/{id}/rooms/{room}/unreachable` · `POST /inspection-runs/{id}/submit`
- `GET /inspection-runs/upcoming?block` → `{ items: [{ id, date, scope, scheduleName }] }`

---

## Manager

- `GET /dashboards/manager?termId&block` → `{ block, kpis: { allocated, beds, collected, collectionRate, slaRate, slaTarget, slaHours, refundsWaiting, escalationsWaiting }, floors: [{ floor, allocated, beds }], floorNote, waiting: [{ id, kind: 'refund'|'escalation'|'routing', severity, title, body, link, cta }] }`
- `GET /approvals/summary?termId&block` → `{ assignment, lateCheckIn, swaps, refunds }`
- `GET /approvals/assignment?termId&block` → `{ item: { runId, block, blockLabel, termName, submittedBy, submittedAt, bedsOffered, conflictsResolved, conflictsTotal, applications, allocated, toRound2, averageScore, status: 'Waiting'|'Approved'|'Returned', comment } | null }`
- `GET /assignment-runs/{runId}/rooms?block&page&pageSize` → `{ items: [{ room, roomTypeName, roomClassName, students, note, score, flag: { label, tone } | null }], total }`
- `POST /assignment-runs/{runId}/approve` `{ block }` → `{ allocated, waitlisted }` · `POST /assignment-runs/{runId}/return` `{ block, comment }` → `204` (C-21)
- `GET /late-check-ins?termId&block` → `{ items: [{ id, studentCode, name, allocation, reason, receivedBy, paid, payment, requestedFor, evidence: { name, url }, windowClosedAt, suggestedDeadline, decision: { status, deadline, reason } | null }] }`
- `POST /late-check-ins/{id}/decision` `{ decision, deadline?, reason? }` — `deadline` (required when approving) is a date `YYYY-MM-DD`, like `requestedFor` and `suggestedDeadline`
- `GET /finance/summary?termId&block` → `{ invoiced, invoices, collected, overdueCount, overdueAmount, refundsPendingCount, refundsPendingAmount }`
- `GET /refunds?termId&block&status&page&pageSize` → `{ items: [{ id, name, studentCode, reason, rule, paid, amount, proposedLabel, exception, status }], total }`
- `POST /refunds/{id}/decision` `{ decision, note? }` (note required when rejecting or approving an exception)
- `GET /finance/overdue?termId&block&page&pageSize` → `{ items: [{ invoiceId, name, studentCode, typeLabel, amount, dueAt, daysOverdue, remindedAt }], total }` · `POST /finance/reminders` `{ invoiceIds }`
- `GET /invoices?termId&block&page&pageSize` → `{ items: [{ id, name, studentCode, typeLabel, amount, dueAt, status }], total }`
- `GET /block-staff?block` → `{ items: [{ id, name, title, handles, blocks, open, resolved7d, onDuty }], summary: { total, shared, averageOpen, onDuty, deskOnDuty }, handleOptions, roleOptions }`
- `PUT /block-staff/{id}` `{ handles, onDuty }` · `POST /staff-account-requests` `{ name, email, role }`
- `GET /routing-rules?block` → `{ rules: [{ id, type, scope, condition, assigneeId, assigneeName, fallbackId, fallbackName, active }], staff: [{ id, name }], types, categories, gaps: [{ ruleId, title, message }], timers: { urgent, normal, roomChange }, timerOptions: { urgent, normal, roomChange } }`
- `POST /routing-rules` · `PUT /routing-rules/{id}` `{ type, scope, condition, assigneeId, fallbackId, active }` · `PUT /routing-rules/timers` `{ block, urgent, normal, roomChange }`
- `GET /escalations?termId&block` → `{ items: [{ id, kind, title, subtitle, room, why, tone, openFor, ownerName, handled: { action, at, note } | null, events: [{ text, at }], suggestedAssigneeId, link, canOfferTemporaryBed }], assignees: [{ id, name }] }`
- `POST /escalations/{id}/actions` `{ action: 'reassign', assigneeId, note? }` or `{ action: 'temporary-bed', note? }`
- `GET /reports/block?termId&block` → `{ allocated, weekly: [{ label, value }], notCheckedIn, followUpBy }`; exports `block-occupancy`, `block-collections`, `block-maintenance`, `block-residents`
- `GET /block-settings?block` → `{ deskOpens, deskCloses, visitFrom, visitUntil, quiet, houseRules, editedAt, editedBy, limits: { visitWindow, quietStartsBy }, quietOptions }` · `PUT /block-settings`
- `GET /inspection-schedules?block` → `{ items: [{ id, name, checklistId, scope, scopeLabel, repeat, repeatLabel, assignee, dueWithinDays, createRequests, notifyResidents, nextRunAt, status, createdAt }], runs: [{ id, assigneeName, inspected, rooms, failed, status }], options: { checklists, scopes, repeats, assignees } }` (options are `{ value, label }` lists)
- `POST /inspection-schedules` · `PUT /inspection-schedules/{id}` (also `{ status: 'Active'|'Paused' }`)

---

## Admin

- `GET /dashboards/admin?termId` → `{ term: { name, statusLabel, endsAt }, nextTerm: { name, registrationOpensAt } | null, kpis: { residents, beds, collected, collectionRate, activeUsers, students, staff, managers }, funnel: [{ label, value }], funnelNote, blocks: [{ block, gender, allocated, beds }], checks: [{ ok, text, link }], integrations: [{ name, status, tone }] }`
- `GET /admin/terms` → `{ items: [{ id, name, status, stayStart, stayEnd, registrationOpensAt, registrationClosesAt, resultsPublishedAt, roommateHours, depositHours, balanceDueAt, checkInStart, checkInEnd, checkOutBy }] }` · `POST /admin/terms` · `PUT /admin/terms/{id}` · `POST /admin/terms/{id}/publish`. Instants: `registrationOpensAt`, `registrationClosesAt`, `resultsPublishedAt`, `balanceDueAt`; dates (`YYYY-MM-DD`): `stayStart`, `stayEnd`, `checkInStart`, `checkInEnd`, `checkOutBy`. The Term's `depositHours` is the Deposit window used for its Applications (`/terms` returns it as `depositWindowHours`); when `POST /admin/terms` leaves it out or sends `null`, the server uses `/admin/fees.depositHours`. Empty fields are sent as `null`, never `0`.
- `GET /admin/room-types` → `{ items: [{ id, name, beds, basePrice, roommateSelection: 'auto'|'mutual', rooms, status, hasAllocations }], roomClasses: [{ id, name, surchargeRate }], totals: { rooms, beds } }` · `POST` · `PUT /admin/room-types/{id}`
- `GET /admin/room-classes` → `{ items: [{ id, name, surchargeRate, amenities, floors, rooms, status }], roomTypes: [{ id, name, basePrice }], depositRate }` · `POST` · `PUT /admin/room-classes/{id}`
- `GET|PUT /admin/fees` → `{ depositPercent, depositHours, balanceDays, blockCheckIn, manualConfirm, policyConfirmed, rules: [{ id, when, refundPercent, approver, active }], approverOptions }`. `depositHours` here is only the default proposed for a new Term; each Term keeps its own.
- `GET|PUT /admin/utility` → `{ priceKwh, priceM3, readingDay, paymentDueDays, rounding, overdueReminder, estimateMonthly, monthsHeld, blockChangesWhenOverdue, options: { readingDays, paymentDueDays, rounding, overdueReminder } }`
- `GET|PUT /admin/eligibility` → `{ criteria: [{ key, title, note, on }], groups: [{ id?, title, note, applied }], appliesFromTermName }`
- `GET|PUT /admin/matching` → `{ snapshot, hardConstraints: [string], order: [{ key, title, note }], weights: [{ key, label, note, on, value }], boost, preview }`. `PUT` saves a new snapshot and returns `{ snapshot }`. `boost` multiplies the score when a 2-bed student's Roommate preferences match.
- `POST /admin/matching/preview` `{ order, weights, boost }` → `{ averageFit, sameMajorRate, toRound2, source }`
- `GET|PUT /admin/system-parameters` → `{ sections: [{ title, fields: [{ key, label, value, helper?, options? }] }] }`
- `GET /admin/notification-templates` → `{ items: [{ key, event, push, inApp, titleEn, titleVi, body, variables }], sampleValues }` · `PUT /admin/notification-templates/{key}` · `POST /admin/notification-templates/{key}/test`
- `GET /admin/emails/options` → `{ templates: [{ key, name, subject }], groups: [{ key, label }], blocks, genders, channels: [{ value, label }], sendTimes: [{ value, label }] }`
- `POST /admin/emails/preview` `{ mode, studentCode?, termId, group, block?, gender?, templateKey, subject }` → `{ count, preview: { recipientName, subject, lines } | null }` · `POST /admin/emails` (same + `channel, sendAt`) → `{ queued }`
- `GET /admin/buildings` → `{ items: [{ id, name, gender, status, floors: [{ floor, roomClassName, twoBed, fourBed, sixBed, rooms, beds, closedRooms }] }], genders, floorOptions, layoutNote }` · `POST` · `PUT /admin/buildings/{id}` · `POST /admin/buildings/{id}/rooms/bulk` `{ fromFloor, toFloor }` → `{ created, skipped }` · `GET /admin/buildings/{id}/floors/{floor}/rooms` → `{ items: [{ code, roomTypeName, roomClassName, outOfService }] }`
- `GET /admin/users?q&role&block&status&page&pageSize` → `{ items: [{ id, name, email, role, scope, lastSignInAt, status }], total, roles, blocks, scopeOptions }` · `POST /admin/users` (invite) · `PUT /admin/users/{id}`
- `GET /admin/permissions` → `{ roles: [{ key, short }], rows: [{ action, allowed: [bool] }] }`
- Admin screens exchange display labels (roles, Block scope `All Blocks`/`A`/`A, B`, statuses, `gender` Male/Female, Block `name` = code); saves return `{ id }` (`PUT /admin/users/{id}`: the updated item). Fees: rules left out of a PUT are kept. Eligibility: `applied` = students in the group. Matching: `weights[].value` in whole percent (total 100), `boost` a multiplier (1 = off). See C-15, C-16; Audit Log labels and `/notifications?limit` (default 20, max 100): C-18.
- `GET /inspection-checklists` → `{ items: [{ id, name, version, status, updatedAt, archivedAt, items: [{ label, category, severity }], replaced: [{ version, itemCount }] }], categories, severities }` · `POST /inspection-checklists` `{ name }` · `POST /inspection-checklists/{id}/publish` `{ items }` · `POST /inspection-checklists/{id}/archive`
- `GET /reports/occupancy?termId` → `{ asOf, roomClasses: [string], note, summary: { capacity, rooms, blocks, allocated, checkedIn, notArrived, waitlisted, waitlistNote }, blocks: [{ block, rows: [{ roomTypeName, cells: [{ allocated, capacity }] }] }] }`
- `GET /reports/financial?termId&block` → `{ asOf, blocks: [string], rows: [{ block, invoiced, collected, outstanding, refunded }], summary: { invoiced, collected, outstanding, refunded, outstandingInvoices, overdueInvoices, refundCount } }`
- `GET /admin/audit-log?q&actor&action&range=7d|30d|90d|all&page&pageSize` → `{ items: [{ id, at, actor, action, tone, object, change }], total, actors, actions, retentionMonths }`

## Exports

`GET /exports/{report}` with the same filters as the screen: `applications`, `payments`, `maintenance`, `room-changes`, `inventory`, `assignment-proposal`, `block-finance`, `block-occupancy`, `block-collections`, `block-maintenance`, `block-residents`, `occupancy`, `financial`, `audit-log`.
