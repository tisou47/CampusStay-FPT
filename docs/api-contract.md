# CampusStay — API contract

What the web and Android apps send and expect from the CampusStay backend. On the web, every call goes through `web/src/api/client.js`; the endpoint list lives in `web/src/api/endpoints.js`, and each page repeats the shapes it reads in a comment at the top of its file.

Version 1.14 (27/10/2026): the mentor-confirmed contract plus the changes A-01…A-52, B-01…B-11 and C-01…C-45 of [`backend/03_API_Contract_Changes.md`](backend/03_API_Contract_Changes.md) (A-15, A-16, C-38: Change Specification v2 phase 1; A-17…A-21, C-39: phase 2 "Accounts"; A-23…A-26, B-04, C-40: phase 3 "Inventory"; A-27…A-33, C-41: phase 4 "Registration periods"; A-34…A-39, B-05…B-07, C-42: phase 5 "Money and residence"; A-40…A-46, B-08…B-10, C-43: phase 6 "Term transition", in `main` since 27/10/2026; A-47…A-52, B-11, C-44: phase 7 "Operations", built on `feat/v2-phase7-8`, in `main` and production since 27/10/2026). Every later change is logged there first and written here in the same commit.

## Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `VITE_API_BASE_URL` (default `/api`). In development Vite proxies `/api` to `VITE_API_PROXY_TARGET`. |
| Auth | `POST /auth/sign-in` or `POST /auth/google` returns a token. Every other call sends `Authorization: Bearer <token>`. A `401` signs the user out. An account from Google sign-up first sets a password (`403 PASSWORD_REQUIRED` meanwhile), and a student the student list does not know then sends the sign-up form (`403 PROFILE_REQUIRED` meanwhile), A-17. |
| Language | Every request sends `Accept-Language: vi` or `en`; error `message` and `details.fields` texts and notifications come back in that language, English without the header (A-16). |
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
| Statuses | Application: Draft, Awaiting Roommate, Awaiting Deposit, Submitted, Under Review, Approved, Waitlisted, Allocated, Forfeited, Rejected, Cancelled, Expired. Allocation: Assigned – unpaid, Paid – waiting for the door code, Resident. Invoice: Unpaid, Paid, Overdue, Awaiting confirmation (a payment claim waits for a Manager), Refunded, Void, Upcoming. Termination: Notice sent, Overdue, Checked out, Cancelled. Request: Submitted, Assigned, In progress, Resolved, Closed, Pending, Approved, Rejected. Next-Term Bed: Continuing, Awaiting extension, Not continuing. Room Class change: Awaiting consent, Waiting for Staff, Approved, Rejected, Cancelled, Set back. |

Applications have no `period` field: the length of a stay is the stay length (`stayTerms`, A-38), and a stay continues from Term to Term through the requests window of the next Term (A-40…A-46, C-43). Removed in v2 phase 5 (B-07): the SePay webhook and the payment simulator; payments are claims confirmed by Managers (A-34, A-35, C-42). Removed in v2 phase 6 (B-08, B-09): room changes and swaps during a Term and their prorated price differences; they take effect in the next Term.

---

## Session and shared

- `GET /search?q` (back office) → `{ q, items: [{ kind, id, title, detail }] }`: students, Rooms, Invoices, Applications, Maintenance Requests and next-Term request codes inside the user's Blocks (A-47)

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| POST | `/auth/sign-in` | `{ email, password, remember }` — the account email and the CampusStay password (not the FPT Wi-Fi credentials); `remember` is optional (default `false`) | `{ token, user: { id, name, email, role: 'student'\|'staff'\|'manager'\|'admin', studentCode?, title?, blocks?: [string], locale: 'vi'\|'en', passwordSet, verification?: 'Verified'\|'Pending verification'\|'Profile needed' } }` (`verification` for students) |
| POST | `/auth/google` | `{ code, remember }` (web: authorization code from the Google Identity Services popup, `ux_mode: popup`; the server exchanges it with `redirect_uri=postmessage`), `{ code, redirectUri, remember }` (web, when the popup was blocked: Google's redirect flow returned to `redirectUri` = the web's `/signin`, A-22) or `{ credential, remember }` (Android: Google ID token) | Same as sign-in. Only `@fpt.edu.vn` Google Workspace accounts. An account CampusStay does not know signs up as a student (`passwordSet: false`); an address ending with the code of an imported, unused account signs in to that account (A-17). |
| POST | `/auth/sign-out` | — | `204` |
| GET | `/auth/me` | — | `user` |
| PUT | `/auth/me/locale` | `{ locale: 'vi'\|'en' }` | `204`: the account's language for notifications, push and emails (A-15) |
| POST | `/auth/password/set` | `{ newPassword }` — the first password of an account from Google sign-up | `204`; `409 PASSWORD_ALREADY_SET` (A-17) |
| POST | `/auth/password/forgot` | `{ email }` | `204` always (does not reveal whether the email exists) |
| POST | `/auth/password/reset` | `{ token, newPassword }` — used by both the reset and the set-password (invitation) page | `204`; every session of the user is signed out |
| POST | `/auth/password/change` | `{ currentPassword, newPassword }` | `204`; the user's other sessions are signed out |
| POST | `/devices` · `/devices/unregister` | Android only: `{ token, platform: 'android' }` after sign-in and on token refresh · `{ token }` before sign-out | `204`; notifications are then also pushed (C-25) |
| GET | `/terms` | — | `{ items: [{ id, name, current, registrationOpen, stayStart, stayEnd, registrationOpensAt, registrationClosesAt, resultsPublishedAt, balanceDueAt, checkInStart, checkInEnd, depositWindowHours }], total }` |
| GET | `/files/{id}?exp&sig` | A signed link handed out by another endpoint (`receipt.url`, `photos[].url`); no token | The file; `404` once expired (A-10) |
| GET | `/notifications?limit` | — | `{ items: [{ id, title, body, createdAt, link, read, kind: 'notification'\|'announcement' }], unread }`; a student's list also holds the board's announcements (`id: 'ann-<n>'`) and `unread` counts them (C-41) |
| POST | `/notifications/read-all`, `/notifications/{id}/read` | `id` may be `ann-<n>` (an announcement) | `204` |
| GET | `/registration-periods/current` | — | `{ card: { termId, name, status: 'Opens soon'\|'Open'\|'Closed', opensAt, closesAt, countdownTo, stayStart, stayEnd, places, fromPrice } \| null }` (A-29) |
| GET | `/registration-periods/{termId}` | — | A published Term for students: `{ id, name, status, stayStart, stayEnd, timeline: [{ key, label, at, date, until, done }], prices: [{ roomTypeId, roomType, beds, roomClassId, roomClass, price, deposit, places, furniture: [{ name, nameVi, quantity }] }], depositPercent, utilityDeposit, houseRules, faq: [{ question, answer }], documents: [{ title, url }] }`; `places`: Beds of the reader's gender for a student; `404` for a Draft (A-29, B-14) |

- **Sign-in errors:** `401 INVALID_CREDENTIALS` (same text for an unknown email and a wrong password), `401 ACCOUNT_LOCKED` (after 5 failures, for 15 minutes), `403 ACCOUNT_DISABLED`, `403 ACCOUNT_REJECTED` (with the Manager's reason), `403 NO_ACCOUNT`, `403 GOOGLE_DOMAIN_NOT_ALLOWED`, `403 GOOGLE_ACCOUNT_MISMATCH`, `401 GOOGLE_TOKEN_INVALID` (try again), `503 GOOGLE_SIGN_IN_DISABLED`, `503 GOOGLE_UNAVAILABLE` (Google cannot be reached or the server is misconfigured). `POST /auth/google` without exactly one of `code` and `credential` → `400 VALIDATION_FAILED`.
- **Password rule:** 8–64 characters, at least one letter and one number, not containing the email name; otherwise `400 WEAK_PASSWORD` with a message to show as is.
- **Email links:** invitation and reset emails open the web pages `/set-password?token=…` (valid 72 hours) and `/reset-password?token=…` (valid 30 minutes). Both call `POST /auth/password/reset`, then go to Sign In. Each token works once. Students sign up with Google (A-17); back-office accounts are invited.

### Student account verification

- `GET /students/me/verification` → `{ status, locked, note, form: { studentCode, name, gender, dateOfBirth, major, cohort, phone }, options: { genders, majors } }` · `PUT /students/me/verification` (the form) → `204`: Pending verification; `409 ALREADY_VERIFIED` (A-18). Only a Verified account may apply (C-39).

## Student

### Home, profile, catalog

- `GET /students/me/home?termId` → `{ firstName, term, application: { id, status, roomTypeName, roomClassName } | null, allocation: { room, bed, block, floor } | null, checkedIn, dueInvoice: { id, type, title, amount, dueAt } | null, invoices: { due, total }, openRequests }`
- `GET /students/me/profile` → `{ name, studentCode, gender, major, cohort, hometown, contact: { phone, email, emergencyName, relationship, emergencyPhone } }`
- `GET /students/me/board` → `{ items: [{ id: 'ann-<n>', category, title, body, changes: [{ field, type, before, after }] | null, link, pinned, shownFrom, createdAt, read }], unread }`: the dormitory board, pinned first (A-30)
- `GET /catalog?termId` (prices, `depositRate` and `utilityDeposit` of that Term; without it the Term open for registration, else the current Term, C-41) → `{ roomTypes: [{ id, name, beds, description? }], roomClasses: [{ id, name, surchargeRate, amenities: [string] }], prices: [{ roomTypeId, roomClassId, termPrice }], depositRate, utilityDeposit, preferenceOptions: { region: [string], semester: [string], major: [string] }, relationships: [string] }`

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
  "consent": { "matching": true, "rules": true },
  "stayTerms": 2
}
```

`contact` is optional, and so is each of its fields (a field given must be valid): without it the Application keeps the contact on the student's profile (C-46).

`stayTerms` is the stay length, the number of Terms the student wants to stay: 1 to `maxStayTerms` of `GET /applications/eligibility` (default 1, A-38).

`roommate` is sent only for Room Types with 2 Beds. `roommate.preferences` is the free, optional **Roommate preferences** service: it is sent only when the student chose *Match me automatically* and turned the service on. The matcher weighs it on top of the Admin Matching Criteria (see the boost setting).

### Applications

Application and Invoice `id`s are their codes (`APP-SP27-000123`, `INV-SP27-000123`); for a student `GET /terms` marks their own Term as `current`, and the Application endpoints always use the Term open for registration (C-19). Wizard rules, errors and payment behaviour: C-20.


- `GET /students/me/applications?page&pageSize` → `{ items: [{ id, termName, roomTypeName, roomClassName, deposit, submittedAt, status }], total, activeTermName }`
- `GET /applications/{id}` (student view) → `{ id, status, termName, roomTypeName, roomClassName, surchargeRate, twoBed, roommate: { mode, studentCode, status, preferences } | null, allocation: { room, bed, block } | null, events: [{ title, at, state: 'done'|'current'|'upcoming', note }], invoices: [{ id, type, title, amount, status, dueAt, paidAt }], canCancel, cancelPolicy, resultsPublishedAt, registrationClosesAt, decisionNote }`
- `POST /applications/{id}/cancel` `{ reason? }`
- `GET /students/me/roommate-invitation` → `{ invitation: { id, fromName, expiresAt, termName, stayStart, stayEnd, roomTypeName, roomClassName, surchargeRate, termPrice, deposit, depositWindowHours, registrationClosesAt } | null }`
- `POST /roommate-invitations/{id}/respond` `{ accept }` → `{ applicationId, depositInvoiceId }`
- `GET /students/me/round2-offer` → `{ offer: { id, expiresAt, termName, application: { id, roomTypeName, roomClassName, termPrice, depositPaid }, options: [{ id, roomTypeName, roomClassName, block, note, fill, termPrice, difference }] } | null }`
- `POST /round2-offers/{id}/respond` `{ accept, optionId? }` → `{ balanceInvoiceId }` (C-27)
- `POST /applications/{id}/withdraw` (a Waitlisted Application) → `{ applicationId, refund }`: an open offer closes as declined, the Application is cancelled and the whole Deposit refunded after a Manager approves; `GET /applications/{id}` of a Waitlisted one carries `waitlist: { offer: { id, expiresAt, options } | null, until, refund }` (A-61)
- `GET /students/me/refund-account` → `{ holder, number, bank, updatedAt }` · `PUT /students/me/refund-account` `{ holder, number, bank }` → the same (A-62)
- `GET /round2/offers?termId&status&q&page&pageSize` (Managers) → `{ items: [{ id, applicationId, studentName, studentCode, requested, status: Pending|Accepted|Declined|Expired|Withdrawn|No offer, offeredAt, expiresAt, respondedAt, options: [{ block, roomTypeName, roomClassName, termPrice, difference, chosen }] }], total, counts: { pending, accepted, declined, expired, withdrawn, noOffer } }` (A-58)

### Invoices and payment

- `GET /students/me/invoices?termId&page&pageSize` → `{ items: [{ id, type: 'deposit'|'balance'|'utility'|'roomChange'|'damage'|'termFee', typeLabel, title, termName, amount, dueAt, status, paidAt, paymentMethod, transferContent }], total, summary: { outstanding, dueCount, nextDueAt, paidTotal, paidCount, upcoming: { typeLabel, amount, note } | null, awaitingCount, warning: { level, debt, overdue, terminateOn, issuedAt } | null } }` (A-39; `paymentMethod` Bank transfer for confirmed claims)
- `GET /invoices/{id}` → `{ id, title, type, typeLabel, amount, status, issuedAt, dueAt, paidAt, room, utilityDeposit, lines: [{ label, amount }] | null, breakdown: { segments: [{ from, to, note, residents, kwh, m3, electricityCost, waterCost, share }], subtotal, roundingNote, priceKwh, priceM3 } | null }`
- `GET /invoices/{id}/payment` → `{ invoice: { id, title, typeLabel, amount, status, dueAt, paidAt, reference }, qr: { image, expiresAt } | null, bank: { name, accountName, accountNumber } | null, transferContent, claim: { status, claimedAt, reference, rejected, lastRejection: { reason, at } | null } | null, canClaim }`. `qr` and `bank` are null without a configured receiving account. While a claim waits the page asks again every 15 seconds.
- `POST /invoices/{id}/claim` `{ reference? }` → the claim: the student's "I have transferred"; the Invoice waits for a Manager and its deadline stops (A-34, C-42).
- `POST /invoices/{id}/payment/refresh` → new `qr`
- `GET /invoices/{id}/receipt` → PDF file

### My Room and requests

- `GET /students/me/allocation?termId` → `{ term: { id, name, stayStart, stayEnd, resultsPublishedAt }, allocation: { room, bed, block, blockLabel, floor, roomTypeName, roomClassName, amenities, allocatedAt, status (Assigned – unpaid, Paid – waiting for the door code, Resident), pass, residentSince, codeReleased } | null, roommates: [{ name, bed }], roommateCapacity, checkIn: { start, end, deskHours, location, checkedInAt } | null, balance: { invoiceId, amount, status, dueAt, paidAt } | null, application: { id, status } | null, rulesUrl, stayTerms, termination: { reason, note, status, moveOutBy, startedAt } | null, stay: { committedTerms, termsUsed, termsLeft, status } | null, nextTerm: { term: { id, name, stayStart }, state, room, bed, roomTypeName, roomClassName, termPrice, termsLeft, fee: { invoiceId, amount, status, dueAt } | null, window: { opensAt, closesAt, decisionsDueAt, feesDueAt, filing, checkOutBy }, endReason, checkOutBy } | null }` (A-39, B-06, A-43)
- `POST /students/me/stay/extension` `{ terms, reason? }` · `POST /students/me/stay/end` `{ reason? }` → `{ id, status, automatic, note }` (A-43, C-43)
- `GET /room-class-changes/options` → `{ termId, termName, room, roomType, current: { id, name, termPrice }, classes: [{ id, name, termPrice }], residents, open: { id, status, toClass, requestedBy, consents: [{ name, status }] } | null, canAsk, unavailable }` · `POST /room-class-changes` `{ roomClassId, reason }` → `{ id, status }` · `POST /room-class-changes/{id}/consent` `{ agree }` → `204` (A-42)
- `GET /students/me/late-check-in` → `{ request: { id, status, requestedFor, deadline, reason, decisionReason, createdAt, source } | null, canRequest, checkInEnd, latestDay }` · `POST /students/me/late-check-in` (multipart) `reason, requestedFor, evidence` → `{ id }` (A-36)
- `GET /students/me/requests?kind=maintenance|room-changes&termId&page&pageSize` → `{ items, total, counts: { maintenance, roomChanges, consents }, room }`
  - maintenance item: `{ id, title, location, category, reportedAt, status, assignee, visitWindow }`
  - room-change item (every next-Term request: room change, swap, Room Class change, extension, end of stay; B-10): `{ id, typeLabel, summary, submittedAt, status, decision: { note, at } | null, invoiceId, invitationId, consentId }`
- `GET /maintenance-requests/options?for=student|staff` → `{ categories, locations, priorities, staff: [{ id, name, skills }] }`
- `POST /maintenance-requests` (multipart) `title, description, category, location, urgency, staffMayEnter, photos` (one `photos` part per file) → `{ id }`
- `GET /maintenance-requests/{id}` (student view) → `{ id, title, status, room, category, location, reportedAt, assignee, visitWindow, description, events: [{ who, at, message }] }` (public updates only)
- `POST /maintenance-requests/{id}/confirm` `{ fixed, comment? }` → `204`
- `GET /room-changes/options?termId` → `{ currentRoom: { room, bed, roomTypeId, roomTypeName, roomClassId, roomClassName } | null (the next-Term Bed), roomTypes, roomClasses, prices: [{ roomTypeId, roomClassId, termPrice }] (the next Term's), window: { termId, termName, closesAt, decisionsDueAt } | null, reasons, hasOpenRequest, canAsk, unavailable }` (B-08)
- `POST /room-changes` `{ termId (the window's next Term), kind: 'same'|'class'|'type', roomTypeId, roomClassId, reason, details? }` → `{ id }`
- `GET /students/me/door-code` → `{ room, status: 'Ready'|'Not ready'|'Not set', note, changedAt }` · `POST /students/me/door-code/reveal` → `{ room, code, changedAt }` (every view audited; `409 DOOR_CODE_NOT_READY`) · `GET /students/me/furniture` → `{ room, items: [{ assetCode, type, typeVi, status }] }`. Without a Bed in the current Term: `404`. See A-26.

### Swaps

- `POST /swaps` `{ studentCode, reason? }` → `{ id }`
- `GET /swap-board?termId` → `{ blocks, myPost: { block, roomTypeId, roomClassId, expiresAt } | null, items: [{ id, offeredRoomTypeName, offeredRoomClassName, floor, block, wants, termPrice, requested, crossBlock }], window }` (next-Term Beds, B-09)
- `PUT /swap-board/my-post` `{ termId, block|null, roomTypeId, roomClassId }` → `204` (without `roomTypeId` the post comes down)
- `POST /swap-board/posts/{id}/request` → `{ id }`
- `GET /swap-invitations/{id}` → `{ id, status, expiresAt, crossBlock, termName, give: { room, bed, roomTypeName, roomClassName, block, termPrice }, get: { … } }` (B-09)
- `POST /swap-invitations/{id}/respond` `{ accept }` → `204`

Room changes, swaps and their errors: C-26; since v2 phase 6 they act on next-Term Beds (C-43).

---

## Staff (also used by the Manager for its Block)

### Dashboard

`GET /dashboards/staff?termId&block` → `{ kpis: { toReview, submitted, underReview, paymentsToConfirm, proposal: { runId, proposed, requested, conflicts, waitlisted, committedBlocks, totalBlocks } | null, roomsOutOfService, firstOutOfService: { room, since } | null }, attention: [{ id, kind: 'proposal'|'payments'|'room'|'queue'|'expired'|'maintenance', severity, title, body, link, cta, values }], applicationsByStatus: [{ status, count }], applicationsTotal, checkInPlan: { start, end, days: [{ date, morning, afternoon }] } | null, bedsByBlock: [{ block, proposed, capacity }] }`

### Applications and payments

- `GET /applications?termId&block&q&status&roomTypeId&roomClassId&submittedWithin&page&pageSize` → `{ items: [{ id, studentName, studentCode, pair, roomTypeName, roomClassName, depositStatus, depositPaidAt, status }], total, counts: { [status]: number } }`. `status` may be a comma-separated list.
- `GET /applications/{id}` (back-office view) → `{ id, status, termName, student: { name, studentCode, gender, cohort, major, hometown, phone, emergencyContact, syncedAt }, roomTypeName, roomClassName, surchargeRate, termPrice, roommate, eligibility: [{ title, passed }], deposit: { invoiceId, amount, method, paidAt, status } | null, activity: [{ text, at }] }`
- `POST /applications/{id}/review` `{ decision: 'Approved'|'Rejected', note? }` (note required when rejecting) → `204`
- `POST /applications/bulk-review` `{ ids, decision }` → `{ approved, skipped }`
- `GET /payments?termId&block&q&type&status&method&date=today|7d|term&page&pageSize` → `{ items: [{ invoiceId, studentName, studentCode, type, typeLabel, amount, method, paidAt, dueAt, status, reference, transferContent, receipt: { name, size, url } | null }], total, summary: { collectedToday, collectedTodayCount, awaitingConfirmation, unpaidDeposits, depositsPaid, depositsSubmitted } }`
- `POST /payments/{invoiceId}/confirm` (multipart) `reference?, receipt?` → `204` — the Invoice's claim, or a transfer not claimed yet (B-05)
- `GET /payment-claims?termId&block&type&since&q&page&pageSize` → `{ items: [{ invoiceId, studentName, studentCode, type, typeLabel, title, amount, claimedAt, dueAt, timeLeftSeconds, reference, rejected, transferContent }], total, summary: { count, amount }, types }` · `POST /payment-claims/confirm { invoiceIds }` → `{ confirmed, amount, skipped }` · `POST /payment-claims/reject { invoiceIds, reason }` → `{ rejected, cancelled, skipped }` (Managers, A-35)
- `GET /payments/{invoiceId}/receipt-file` → the attached receipt (A-09)

Scope, review rules and errors: C-21; payment filters, summary and confirmation rules: C-22.

### Assignment

- `GET /assignment-runs?termId&block` → `{ current: { id, kind, status, statusTone, stage (0–5), startedAt, finishedAt, startedBy, snapshot, input, proposed, conflicts, waitlisted, averageFit } | null, history: [{ id, kind, startedAt, startedBy, proposed, conflicts, waitlisted, status }], rules: { snapshot, groups: [{ title, items: [string] }] } }`
- `POST /assignment-runs` `{ termId, dryRun }` → `{ id }`
- `GET /assignment-runs/{runId}/proposal?block&view=conflicts|proposed|all&q&page&pageSize` → `{ run: { id, kind, status, statusTone, stage, startedAt, finishedAt, startedBy, snapshot, input, proposed, conflicts, waitlisted, averageFit }, editable, blocks: [{ block, total, conflicts, status: 'review'|'submitted'|'approved' }], waitlistedCount, items: [{ applicationId, studentName, studentCode, pair, preference, bed, fit, issue: { label, tone } | null, resolved, reason }], total, commitSummary: { students, balanceDueAt } }`. `block=waitlisted` lists waitlisted Applications.
- `GET /assignment-runs/{runId}/conflicts/{applicationId}` → `{ applicationId, studentName, preference, bed, issue: { label, title, detail, tone }, options: [{ key, label, detail, recommended }] }`
- `POST /assignment-runs/{runId}/conflicts/{applicationId}/resolve` `{ optionKey }` or `{ waitlist: true }` → `{ applicationId, bed, resolved, waitlisted }`
- `POST /assignment-runs/{runId}/commit` `{ block }` → `204` (sends the Block to its Manager)

### Inventory

- `GET /inventory/structure?block` → `{ blocks: [{ block, floors: [number] }], outOfServiceReasons: [string] }`
- `GET /inventory/rooms?termId&block&floor` → `{ roomClassName, rooms: [{ code, block, floor, roomTypeName, roomClassName, capacity, outOfService: { since, reason, by, note } | null, beds: [{ id, state: 'unpaid'|'paid'|'resident'|'leaving'|'next_term'|'available'|'oos', occupant: { name, studentCode } | null }] }], summary: { beds, allocated, available, outOfService, residents } }` (B-06, B-10)
- `GET /inventory/rooms/{code}` → `{ code, block, floor }`
- `POST /inventory/rooms/{code}/out-of-service` `{ reason, note? }` · `POST /inventory/rooms/{code}/back-in-service`
- `floor` is required; `block` may be empty only when the user has one Block; without `termId` the current Term fills the Beds. A Bed `id` is its code (`A-305-B`). `reason` is one of `outOfServiceReasons`. A Room whose Bed holds an active Allocation cannot go out of service (`409 ROOM_OCCUPIED`). See C-17. Each Room's `roomClassName` is its class in the Term; the top-level `roomClassName` is `null` when the Floor's Rooms differ (C-40).
- `GET /inventory/rooms/{code}/hub?termId` → `{ details, sections: { residents, meterReadings, maintenance, inspections: [{ kind, id, title, detail, status, at }] } }` (Room hub, A-48)
- `GET /inventory/rooms/{code}/details?termId` → `{ room, block, floor, roomType, term, roomClass, next: { termId, term, roomClass } | null, conformance: { status, missing, extra }, furniture: [furniture item], doorCode: door-code item | null }` (A-23)
- `GET /inventory/room-classes?termId&block&floor&roomClassId&match&q&page&pageSize` → `{ term: { id, name, stayStart, current, editable }, terms, items: [{ room, block, floor, roomType, roomClassId, roomClass, previousClass, setForTerm, locked, conformance: { status: 'Matches'|'Does not match', missing: [{ typeId, type, typeVi, quantity }], extra } }], total, summary: [{ roomClassId, roomClass, rooms }], roomClasses: [{ id, name }], blocks, note }` · `PUT /inventory/room-classes` `{ termId, rooms: [code], roomClassId }` → `{ changed, unchanged }` (Managers; Terms not started; `409 TERM_STARTED`, `409 ROOM_CLASS_LOCKED`). See A-23.

### Furniture

- `GET /furniture?block&room&location=room|store&typeId&status&q&page&pageSize` → `{ items: [{ id, assetCode, typeId, type, typeVi, category, status, location: { kind: 'Room'|'Store', room, block }, note, plannedMove: { id, to, reason } | null, updatedAt }], total, counts: { [status]: n }, options: { types: [{ id, name, nameVi }], statuses, blocks } }`
- `GET /furniture/{id}` → `{ item, history: [{ at, kind, from, to, reason, by }] }` · `PUT /furniture/{id}` `{ status?, note?, reason? }` → the item
- `POST /furniture` `{ typeId, block, room?, quantity, note? }` → `{ assetCodes }` (Managers)
- `GET /furniture/moves?block&status=Planned|Done|Cancelled&page&pageSize` → `{ items: [{ id, itemId, assetCode, type, typeVi, from, to, reason, status, createdBy, createdAt, closedBy, closedAt }], total, statuses }` · `POST /furniture/moves` `{ items: [id], toRoom | toStore, reason, planned? }` → `{ moved, planned }` · `POST /furniture/moves/{id}/done` · `POST /furniture/moves/{id}/cancel`
- Statuses: In use, Broken, In repair, In store, Disposed. Moves to another Block: Managers only (`403 CROSS_BLOCK`). See A-24.

### Door codes

- `GET /door-codes?block&status&q&page&pageSize` → `{ items: [{ room, block, floor, status: 'Change needed'|'Not set'|'Active', proposed, proposedAt, activeSince, task: { reason, since } | null, residents }], total, counts: { toChange, notSet, proposed, active }, statuses }`
- `POST /door-codes/{room}` `{ code? }` → `{ room, code }` (blank = random) · `POST /door-codes/{room}/confirm` · `POST /door-codes/{room}/cancel` → `204` · `POST /door-codes/{room}/reveal` → `{ room, active, proposed }` (audited)
- `POST /door-codes/import` (multipart) `file` (CSV `room,code`) → `{ proposed }`; a problem line → `400` with `details.fields.line<n>`. Without `DOOR_CODE_KEY` on the server: `503 DOOR_CODES_DISABLED`. See A-25.

### Maintenance

- `GET /maintenance-requests?termId&block&q&status&priority&category&assigneeId&page&pageSize` → `{ items: [{ id, room, title, category, priority, reportedAt, assignee: { id, name } | null, status }], total, summary: { open, urgent, urgentUnassigned, unassigned, oldestUnassignedAt, resolvedThisWeek, waitingConfirmation } }`. `status=open` means Submitted, Assigned or In progress; `assigneeId=none` means unassigned.
- `GET /maintenance-requests/{id}` (back-office view) → `{ id, title, status, room, bed, category, location, reportedAt, reporter: { name, role }, urgency, priority, staffMayEnter, description, photos: [{ url, name }], assignee, suggestedAssigneeId, visitWindow, events: [{ who, role, at, text, message, internal }], roomSummary: { residents, capacity, otherOpen, pastThisTerm } }`
- `PATCH /maintenance-requests/{id}` `{ priority?, furnitureItemId?, assigneeId?, visitWindow?, status? }` → `204` (only the fields sent change). A Staff member changes `status` only when the request is assigned to them (or unassigned); another Staff member sends `assigneeId` = themselves first, in the same body or before: `409 ASSIGNED_TO_SOMEONE_ELSE` otherwise. Managers may change any request (B-12)
- Queue items and the detail carry `slaDueAt`; the detail `furnitureItem` and `furnitureOptions`; the student's options `furniture` and the report the field `furnitureItemId` (A-49)
- `POST /maintenance-requests/{id}/updates` `{ message, internal }` → `204`

Ids are codes (`MR-000321`); reporting, filters, transitions and notifications: C-24. `photos[].url` are signed links (A-10).

### Room changes and swaps

- `GET /room-changes?termId&block&status&kind&page&pageSize` → `{ items: [{ id, studentName, studentCode, kind, from: { room, bed, roomTypeName, roomClassName }, to: { roomTypeName, roomClassName }, reason, submittedAt, dueAt, status, decision: { by, at, bed, reason, note } | null }], total, rejectReasons, window }` (without `termId`: the latest open window; B-08)
- `GET /room-changes/{id}/matching-beds` → `{ items: [{ bedId, floor, roommates }] }` (free Beds of the next Term)
- `POST /room-changes/{id}/decision` `{ decision: 'Approved', bedId }` or `{ decision: 'Rejected', reason, message? }` → `{ note }`
- `GET /swaps?termId&block&kind&status&page&pageSize` → `{ items: [{ id, kind, agreedAt, crossBlock, status, a: { name, studentCode, room, bed, roomTypeName, roomClassName }, b: { … }, checks: [{ label, passed }], decision: { by, at, reason } | null, dueAt }], total, window }` (B-09)
- `POST /swaps/{id}/decision` `{ decision: 'Approved'|'Rejected', reason? }` → `204`; a swap across Blocks goes to a Manager (C-26)

### Term transition

Staff see their Blocks, Managers every Block (C-43).

- `GET /renewals` → `[{ termId, termName, previousTermName, opensAt, closesAt, decisionsDueAt, opened }]` · `GET /renewals/overview?termId` → `{ term, previousTerm, opened, filing, feesIssued, milestones, counts, requests, reconciliation, newStudentBeds }` (A-40)
- `GET /next-term-requests?termId&block&kind` → `{ items: [{ kind, id, student, studentCode, summary, status, submittedAt, dueAt, crossBlock }], total, window }` · `POST /next-term-requests/decision` `{ items: [{ kind, id }], decision, reason? }` → `{ decided, failed: [{ kind, id, message }] }` (A-44)
- `GET /room-class-changes?termId&block&status` → `{ items, total, window }` · `GET /room-class-changes/{id}` → `{ item, termName, reason, fromPrice, toPrice, residents, furniture, decisionNote, decidedBy }` · `POST /room-class-changes/{id}/decision` `{ decision, note? }` → detail (A-42)
- `GET /stay-requests?termId&block&kind&status&page&pageSize` → `{ items: [{ id, kind, studentName, studentCode, room, block, terms, committedTerms, termsUsed, reason, status, automatic, submittedAt, dueAt, decisionNote, decidedBy, decidedAt }], total, window }` · `POST /stay-requests/{id}/decision` `{ decision, note? }` (A-43)
- `GET /turnover?termId&block` → `{ term, previousTerm, checkOutBy, checkInStart, counts, leavers, movers, rooms }` · `POST /turnover/meter-cuts` `{ room, electricity, water }` → `204` (A-40)
- `GET /operational-moves/options?q|allocationId` → `{ allocationId, student, term, from, resident, nextTermAllocation, feesIssued, nextTerm, beds, reasons }` · `POST /operational-moves` `{ allocationId, bedId, reason, note?, nextTerm: 'follow'|'keep', fromElectricity, fromWater, toElectricity, toWater }` → `{ allocationId, room, bed, nextTerm, note }` · `GET /operational-moves?termId&block&page&pageSize` → `{ items, total, reasons }` (A-45)

### Desk

- `GET /check-in/today?termId&block` → `{ date, block, expected, checkedIn, waiting, blocked, recent: [{ name, bed, at }], termId, termName, checkInStart, checkInEnd, window: 'UPCOMING'|'OPEN'|'CLOSED'|null }` (`expected` = every Allocation of the Term in the Blocks; A-63)
- `GET /check-in/lookup?termId&q` → `{ student: { name, studentCode, room, bed, block, floor, status: 'ready'|'blocked'|'checked-in'|'not-allocated', checks: [{ label, passed }], owes: { balance, utilityDeposit } | null, checkedInAt, handOverItems: [string] } | null }`. `q` is a student code, a name or the QR pass payload typed by a scanner.
- `POST /check-in` `{ studentCode, items, note? }` → `{ checkedInAt }`
- `GET /check-out?termId&block&q&reason&page&pageSize` → `{ date, pendingCount, reasons, items: [{ allocationId, studentCode, name, room, bed, roomTypeName, roomClassName, reason, status, checkedOutAt }], total }`
- `GET /check-out/{allocationId}` → `{ …row, reading: { electricity, water }, settlement: { held, periodLabel, share, unpaid, damage, refund }, refundStatus, furniture: [{ itemId, assetCode, type, typeVi, amount, note }] }`
- The list carries `checkOutBy`, `overdueCount` and `items[].overdue`; `POST /check-out/{allocationId}` takes `damages: [{ itemId, amount, note? }]` (A-52)
- `POST /check-out/{allocationId}` `{ electricity, water, conditionGood, keyReturned, damageCharge, draft }` → `{ refund, refundStatus }`
- The URL carries the Allocation id, never the student code (personal data, B-01). Check-in rules, the pass and the Utility Deposit settlement: C-23 (`allocation.pass`, A-11).

### Meter readings

- `GET /meter-periods?block` → `{ items: [{ id, label, closed }] }`
- `GET /meter-periods/{id}/readings?block&status&page&pageSize` → `{ period: { id, label, closed, dueAt }, summary: { roomsDue, entered, missing, segments }, items: [{ room, roomTypeName, roomClassName, residents, electricity: { previous, current, cut: { date, value } | null }, water: { … }, status: 'Entered'|'Confirmed'|'Missing'|'Check value' }], total }`
- `GET /meter-periods/{id}/readings/{room}` → `{ …item, priceKwh, priceM3, roundingNote, segments: [{ from, to, residents, kwh, m3, electricityCost, waterCost }], shares: [{ label, amount }] }`
- `PUT /meter-periods/{id}/readings/{room}` `{ electricity, water }` · `POST …/readings/{room}/confirm`
- `GET /meter-periods/{id}/template` → XLSX (`room, electricity, water, previous electricity, previous water`, one line per Room of the period) · `POST /meter-periods/{id}/import` (multipart `file`, the template filled in: XLSX or CSV; headers room/phòng, electricity/điện, water/nước, or the first three columns) → `{ imported, skipped }` (lines with both readings blank are skipped) (A-59) · `POST /meter-periods/{id}/close` → `{ invoicesIssued }`

Meter readings, Utility Invoices and Admin › Utility: C-29.

### Inspections

- Rooms of a run carry `checks: [{ id, kind: people | furniture, expected, assetCode, type, typeVi }]`, answered in `results` like checklist items; a Room is Done when both are answered (A-51, B-11)

- `GET /inspection-runs/current?termId&block` → `{ run: { id, date, dueAt, scheduleName, scope, rooms, inspected, failed, unreachable, inspectorName, checklist: { name, version, items: [{ id, label, category, severity }] } } | null }`
- `GET /inspection-runs/{id}/rooms?page&pageSize` → `{ items: [{ room, roomTypeName, roomClassName, status, results: [{ itemId, result: 'Pass'|'Fail'|'Not checked', note }] }], total }`
- `PUT /inspection-runs/{id}/rooms/{room}` `{ results }` → `{ createdRequests: [id] }`. A failed item creates a Maintenance Request; its severity sets the request priority.
- `POST /inspection-runs/{id}/rooms/{room}/unreachable` · `POST /inspection-runs/{id}/submit`
- `GET /inspection-runs/upcoming?block` → `{ items: [{ id, date, scope, scheduleName }] }`

Inspections (checklists, schedules, runs): C-34.

---

## Manager

- `GET /dashboards/manager?termId&block` → `{ block, kpis: { allocated, residents, beds, invoiced, collected, outstanding, outstandingInvoices, collectionRate, slaRate, slaTarget, slaHours, refundsWaiting, escalationsWaiting }, floors: [{ floor, allocated, beds }], floorNote, waiting: [{ id, kind: 'refund'|'escalation'|'routing'|'check-out', severity, title, body, link, cta, values }], work: { toReview, submitted, underReview, paymentsToConfirm, proposal }, bedsByBlock: [{ block, proposed, capacity }] }` (A-63)
- `GET /approvals/summary?termId&block` → `{ assignment, lateCheckIn, swaps, refunds }`

Dashboards and approval counts: C-36.
- `GET /approvals/assignment?termId&block` → `{ item: { runId, block, blockLabel, termName, submittedBy, submittedAt, bedsOffered, conflictsResolved, conflictsTotal, applications, allocated, toRound2, averageScore, status: 'Waiting'|'Approved'|'Returned', comment } | null }`
- `GET /assignment-runs/{runId}/rooms?block&page&pageSize` → `{ items: [{ room, roomTypeName, roomClassName, students, note, score, flag: { label, tone } | null }], total }`
- `POST /assignment-runs/{runId}/approve` `{ block }` → `{ allocated, waitlisted }` · `POST /assignment-runs/{runId}/return` `{ block, comment }` → `204` (C-21)
- `POST /late-check-ins` (multipart, Staff at the desk) `studentCode, reason, requestedFor, evidence?` → `{ id }` (A-12)
- `GET /late-check-ins?termId&block` → `{ items: [{ id, studentCode, name, allocation, reason, receivedBy, paid, payment, requestedFor, evidence: { name, url }, windowClosedAt, suggestedDeadline, decision: { status, deadline, reason } | null, source }] }` (`source` Online or Desk, A-36)
- `POST /late-check-ins/{id}/decision` `{ decision, deadline?, reason? }` → `204` — `deadline` (required when approving) is a date `YYYY-MM-DD`, like `requestedFor` and `suggestedDeadline`, at most the check-in end + `late_check_in.max_days`; approving moves the Balance deadline to the end of that day
- `GET /terminations?termId&block&status&page&pageSize` → `{ items: [{ id, studentName, studentCode, room, block, reason, note, status, moveOutBy, startedAt, startedBy, debt, endedAt, cancelReason }], total, counts: { noticeSent, overdue }, reasons, statuses }` · `POST /terminations { studentCode, reason, note }` → `{ id, moveOutBy }` · `POST /terminations/{id}/cancel { reason }` → `204` (A-37)
- `GET /next-term-fees?termId` → `{ term, dueAt, count, total, groups: [{ block, roomType, roomClass, count, total }], blockers: [{ code, text }], issued: { at, by, count, paid, total } | null, leavers }` · `POST /next-term-fees/issue` `{ termId }` → `{ issued, total, notices }` (A-41)
- `POST /room-class-changes` `{ termId, room, roomClassId, reason }` (for a Room) → `{ id, status }` · `POST /room-class-changes/{id}/set-back` `{ note }` → detail (A-42)
- `GET /reconciliations?termId` → `{ term, terms, runs, openItems, resolved, people }` · `GET /reconciliations/template?kind=enrolled|leavers` → XLSX · `POST /reconciliations` (multipart) `termId, kind, file` → `{ run, term, items }` · `GET /reconciliations/{id}` → `{ run, term, items }` · `POST /reconciliations/{id}/items/{itemId}/resolve` `{ outcome: 'Not enrolled'|'Enrolled', note }` → item (A-46)
- `GET /finance/summary?termId&block` → `{ invoiced, invoices, collected, overdueCount, overdueAmount, refundsPendingCount, refundsPendingAmount }`
- `GET /refunds?termId&block&status&page&pageSize` → `{ items: [{ id, name, studentCode, reason, rule, paid, amount, proposedLabel, exception, status }], total }`
- `POST /refunds/{id}/decision` `{ decision, note? }` (note required when rejecting or approving an exception) → `204`
- `GET /finance/overdue?termId&block&page&pageSize` → `{ items: [{ invoiceId, name, studentCode, typeLabel, amount, dueAt, daysOverdue, remindedAt }], total }` · `POST /finance/reminders` `{ invoiceIds }` → `{ sent }`
- `GET /invoices?termId&block&page&pageSize` → `{ items: [{ id, name, studentCode, typeLabel, amount, dueAt, status }], total }`

Late check-ins, refunds, overdue Invoices and reminders: C-28.
- `GET /block-staff?block` → `{ items: [{ id, name, title, handles, blocks, open, resolved7d, onDuty }], summary: { total, shared, averageOpen, onDuty, deskOnDuty }, handleOptions, roleOptions }`
- `GET /block-staff/me` → `{ id, onDuty, handles, blocks, open, resolved7d }` · `PUT /block-staff/me/duty` `{ onDuty }` → the same (Staff and Managers start and end their own shift; A-60)
- `PUT /block-staff/{id}` `{ handles, onDuty }` · `POST /staff-account-requests` `{ name, email, role, block? }` → `{ id }` (A-13)
- `GET /routing-rules?block` → `{ rules: [{ id, type, scope, condition, assigneeId, assigneeName, fallbackId, fallbackName, active }], staff: [{ id, name }], types, categories, gaps: [{ ruleId, title, message }], timers: { urgent, normal, roomChange }, timerOptions: { urgent, normal, roomChange } }`
- `POST /routing-rules` · `PUT /routing-rules/{id}` `{ type, scope, condition, assigneeId, fallbackId, active }` · `PUT /routing-rules/timers` `{ block, urgent, normal, roomChange }`
- `GET /escalations?termId&block` → `{ items: [{ id, kind, title, subtitle, room, why, tone, openFor, ownerName, handled: { action, at, note } | null, events: [{ text, at }], suggestedAssigneeId, link, canOfferTemporaryBed }], assignees: [{ id, name }] }`
- `POST /escalations/{id}/actions` `{ action: 'reassign', assigneeId, note? }` or `{ action: 'temporary-bed', note? }`
- `GET /reports/block?termId&block` → `{ allocated, weekly: [{ label, value }], notCheckedIn, followUpBy }`; exports `block-occupancy`, `block-collections`, `block-maintenance`, `block-residents`
- `GET /block-settings?block` → `{ deskOpens, deskCloses, visitFrom, visitUntil, quiet, houseRules, editedAt, editedBy, limits: { visitWindow, quietStartsBy }, quietOptions }` · `PUT /block-settings` `{ block, deskOpens, deskCloses, visitFrom, visitUntil, quiet, houseRules }` → the `GET` shape

Block staff: C-32 and A-13. Routing rules and timers: C-30. Escalations: C-31. Block settings: C-33.
- `GET /student-accounts?q&verification&enrollment&gender&cohort&resident&block&page&pageSize` → `{ items: [{ id, studentCode, name, email, gender, cohort, major, enrollment, verification, account, block, residence, demo }], total, counts: { pending }, options }` (Staff: residents of their Blocks) · `GET /student-accounts/{id}` → the student hub `{ id, name, email, demo, account, profile, verification, residence, sections: { applications, allocations, invoices, requests }, history, actions }` · `PUT /student-accounts/{id}` (directory fields) → the hub · `POST /student-accounts/{id}/verify` · `POST …/reject { reason }` · `POST …/lock { reason }` · `POST …/unlock` → `204` (A-19)
- `GET /student-imports` · `GET /student-imports/template` (XLSX) · `POST /student-imports` (multipart `file`, CSV or XLSX) → the preview `{ id, fileName, status, fields, counts: { created, updated, unchanged, errors }, missing, rows: { items: [{ line, studentCode, name, email, outcome, message, changes }], total }, result }` · `GET /student-imports/{id}?outcome&page&pageSize` · `POST /student-imports/{id}/confirm { markMissingNotEnrolled? }` (A-20)
- `GET /staff-accounts?q&block&status&page&pageSize` → `{ items: [{ id, name, email, title, blocks, status, lastSignInAt }], total, blocks, statuses }` · `POST /staff-accounts { name, email, title?, blocks }` → `{ id }` · `PUT /staff-accounts/{id} { name?, title?, blocks?, status? }` → the item · `POST /staff-accounts/{id}/invitation` → `204` (A-21)

Student accounts, the student list and Staff accounts: A-19…A-21, C-39.
- `GET /term-requests?status&q&page&pageSize` → `{ items: [{ id, code, termName, stayStart, stayEnd, status, requestedBy, requestedAt, updatedAt, comments, termId }], total, counts }` · `GET /term-requests/{id}` (proposal, `term`, `differences`, `history`, `actions`) · `POST /term-requests { termName, stayStart, stayEnd, timeline, blocks, excludedRooms, places, prices, notes }` → `201 { id }` · `PUT /term-requests/{id}` · `POST /term-requests/{id}/comments { text }` → `204` (A-28; Managers request, Managers and the Admin comment)
- `GET /dashboards/term?termId` → `{ term, terms, requestCode, stayStart, stayEnd, milestones, applications, applicationsTotal, places: [{ roomType, roomClass, gender, beds, allocated, price }], money, checkedIn, residents }` (A-32, A-39)
- `GET /announcements?q&category&page&pageSize` · `GET /announcements/options` · `POST /announcements { category, audience, blocks?, termId?, title, body, pinned?, shownFrom?, shownUntil? }` → `201 { id }` · `PUT /announcements/{id} { pinned?, shownUntil?, end? }` → `204`; Staff write only to the residents of their Blocks (A-30) Since v2 phase 1 Managers work for every Block and review Applications, run and commit the assignment and confirm payments (C-38).
- `GET /inspection-schedules?block` → `{ items: [{ id, name, checklistId, scope, scopeLabel, repeat, repeatLabel, assignee, dueWithinDays, createRequests, notifyResidents, nextRunAt, status, createdAt }], runs: [{ id, assigneeName, inspected, rooms, failed, status }], options: { checklists, scopes, repeats, assignees } }` (options are `{ value, label }` lists)
- `POST /inspection-schedules` · `PUT /inspection-schedules/{id}` (also `{ status: 'Active'|'Paused' }`)

---

## Admin

- `GET /dashboards/admin?termId` → `{ term: { name, statusLabel, endsAt }, nextTerm: { name, registrationOpensAt } | null, kpis: { residents, allocated, beds, invoiced, collected, outstanding, outstandingInvoices, collectionRate, activeUsers, students, staff, managers }, funnel: [{ label, value }], funnelNote, funnelOutside: { waitlisted, rejected, expired, continuing }, blocks: [{ block, gender, allocated, beds }], checks: [{ ok, text, link }], integrations: [{ name, status, tone }] }` (A-63)
- `POST /admin/terms/drafts { name, stayStart, stayEnd, requestId? }` → `{ id }` · `GET /admin/terms/{id}/wizard` → the wizard document · `PUT /admin/terms/{id}/wizard/{general|timeline|rooms|prices|rules|information}` (that step's values, `reasons`, `changeReason`) → `{ id }`; publishing fixes the Term's prices, Deposit, Utility Deposit and rules; `409 TERM_NOT_READY`, `PRICES_LOCKED`, `RULES_FIXED` (A-27, C-41)
- `POST /term-requests/{id}/decision { status: 'In progress'|'Needs changes'|'Rejected', note }` → `204` (A-28)
- `GET|PUT /admin/settings/{deadlines|refunds|stay}` → `{ group, title, appliesFrom, settings: [{ key, label, type, value, unit, min, max, usedIn }] }`; `PUT { values }` (A-31)
- `GET /admin/terms` → `{ items: [{ id, name, status, stayStart, stayEnd, registrationOpensAt, registrationClosesAt, resultsPublishedAt, roommateHours, depositHours, balanceDueAt, checkInStart, checkInEnd, checkOutBy, wizardStep, requestCode }] }` (a Draft's windows may be `null`, A-27) · `POST /admin/terms` · `PUT /admin/terms/{id}` · `POST /admin/terms/{id}/publish`. Instants: `registrationOpensAt`, `registrationClosesAt`, `resultsPublishedAt`, `balanceDueAt`; dates (`YYYY-MM-DD`): `stayStart`, `stayEnd`, `checkInStart`, `checkInEnd`, `checkOutBy`. The Term's `depositHours` is the Deposit window used for its Applications (`/terms` returns it as `depositWindowHours`); when `POST /admin/terms` leaves it out or sends `null`, the server uses `/admin/fees.depositHours`. Empty fields are sent as `null`, never `0`.
- `GET /admin/room-types` → `{ items: [{ id, name, beds, basePrice, roommateSelection: 'auto'|'mutual', rooms, status, hasAllocations }], roomClasses: [{ id, name, surchargeRate }], totals: { rooms, beds } }` · `POST` · `PUT /admin/room-types/{id}`
- `GET /admin/room-classes` → `{ items: [{ id, name, surchargeRate, amenities, usedIn, rooms, status }], roomTypes: [{ id, name, basePrice }], depositRate }` · `POST` · `PUT /admin/room-classes/{id}`. `usedIn` and `rooms`: the Rooms that have the class in the current Term (B-04).
- `GET /admin/furniture-types` → `{ items: [{ id, code, name, nameVi, category, definesClass, status, items }], categories }` · `POST` · `PUT /admin/furniture-types/{id}` `{ code, name, nameVi, category, definesClass, status }` → `{ id }`
- `GET /admin/room-class-requirements` → `{ items: [{ roomClassId, roomClass, status, requirements: [{ typeId, type, typeVi, quantity }] }], types: [{ id, name, nameVi }] }` · `PUT /admin/room-class-requirements/{roomClassId}` `{ items: [{ typeId, quantity }] }` → `204`. See A-24.
- `GET|PUT /admin/fees` → `{ depositPercent, depositHours, balanceDays, policyConfirmed, rules: [{ id, when, refundPercent, approver, active }], approverOptions }` (B-05). `depositHours` here is only the default proposed for a new Term; each Term keeps its own.
- `GET|PUT /admin/utility` → `{ priceKwh, priceM3, readingDay, paymentDueDays, rounding, overdueReminder, estimateMonthly, monthsHeld, blockChangesWhenOverdue, options: { readingDays, paymentDueDays, rounding, overdueReminder } }`
- `GET|PUT /admin/eligibility` → `{ criteria: [{ key, title, note, on, failing }], fixed: [{ key, title, note, failing }], groups: [{ id?, title, note, applied }], appliesFromTermName, students }` (`failing`: students who fail it now, A-33)
- `GET|PUT /admin/matching` → `{ snapshot, hardConstraints: [string], order: [{ key, title, note }], weights: [{ key, label, note, on, value, level }], boost, preview }`; weights sent with `level` (Very important, Important, Not used) set the percentages (A-33). `PUT` saves a new snapshot and returns `{ snapshot }`. `boost` multiplies the score when a 2-bed student's Roommate preferences match.
- `POST /admin/matching/preview` `{ order, weights, boost }` → `{ averageFit, sameMajorRate, toRound2, source, students, moved, inUse: { placed, averageFit, priorityPlaced, priorityStudents }, draft, example: { room, students, fit, attributes } }` (the draft next to the rules in use, A-33)
- `GET|PUT /admin/system-parameters` → `{ sections: [{ title, fields: [{ key, label, value, helper?, options? }] }] }`
- `GET /admin/notification-templates` → `{ items: [{ key, event, push, inApp, titleEn, titleVi, body, variables }], sampleValues }` · `PUT /admin/notification-templates/{key}` · `POST /admin/notification-templates/{key}/test`
- `GET /admin/emails/options` → `{ templates: [{ key, name, subject }], groups: [{ key, label }], blocks, genders, channels: [{ value, label }], sendTimes: [{ value, label }] }`
- `POST /admin/emails/preview` `{ mode, studentCode?, termId, group, block?, gender?, templateKey, subject }` → `{ count, preview: { recipientName, subject, lines } | null }` · `POST /admin/emails` (same + `channel, sendAt`) → `{ queued }`

Notification templates and Send email: C-35.
- `GET /admin/buildings` → `{ items: [{ id, name, gender, status, floors: [{ floor, roomClassName, roomClasses: [{ name, rooms }], twoBed, fourBed, sixBed, rooms, beds, closedRooms }] }], genders, floorOptions, roomClasses: [{ id, name }], layoutNote }` · `POST` · `PUT /admin/buildings/{id}` · `POST /admin/buildings/{id}/rooms/bulk` `{ fromFloor, toFloor, roomClassId? }` → `{ created, skipped }` · `GET /admin/buildings/{id}/floors/{floor}/rooms` → `{ items: [{ code, roomTypeName, roomClassName, outOfService }] }`. A Floor's `roomClassName` is the class of its new Rooms; `roomClasses` and each Room's `roomClassName` are the classes in the current Term (C-40).
- `GET /admin/users?q&role&block&status&page&pageSize` → `{ items: [{ id, name, email, role, scope, lastSignInAt, status }], total, roles, blocks, scopeOptions }` · `POST /admin/users` (invite) · `PUT /admin/users/{id}`
- `GET /admin/permissions` → `{ roles: [{ key, short }], rows: [{ action, allowed: [bool] }] }`
- Admin screens exchange display labels (roles, Block scope `All Blocks`/`A`/`A, B`, statuses, `gender` Male/Female, Block `name` = code); saves return `{ id }` (`PUT /admin/users/{id}`: the updated item). Fees: rules left out of a PUT are kept. Eligibility: `applied` = students in the group. Matching: `weights[].value` in whole percent (total 100), `boost` a multiplier (1 = off). See C-15, C-16; Audit Log labels and `/notifications?limit` (default 20, max 100): C-18.
- `GET /inspection-checklists` → `{ items: [{ id, name, version, status, updatedAt, archivedAt, items: [{ label, category, severity }], replaced: [{ version, itemCount }] }], categories, severities }` · `POST /inspection-checklists` `{ name }` · `POST /inspection-checklists/{id}/publish` `{ items }` → `{ id, version }` (A-14) · `POST /inspection-checklists/{id}/archive`
- `GET /reports/occupancy?termId&block` (A-14) → `{ asOf, roomClasses: [string], note, summary: { capacity, rooms, blocks, allocated, checkedIn, notArrived, waitlisted, waitlistNote }, blocks: [{ block, rows: [{ roomTypeName, cells: [{ allocated, capacity }] }] }] }`
- `GET /reports/financial?termId&block` → `{ asOf, blocks: [string], rows: [{ block, invoiced, collected, outstanding, refunded }], summary: { invoiced, collected, outstanding, refunded, outstandingInvoices, overdueInvoices, refundCount } }`
- `GET /admin/audit-log?q&actor&action&range=7d|30d|90d|all&page&pageSize` → `{ items: [{ id, at, actor, action, tone, object, change }], total, actors, actions, retentionMonths }`

## Exports

`GET /exports/{report}` with the same filters as the screen: `applications`, `payments`, `maintenance`, `room-changes`, `inventory`, `assignment-proposal`, `block-finance`, `block-occupancy`, `block-collections`, `block-maintenance`, `block-residents`, `occupancy`, `financial`, `audit-log`. Reports and exports: C-37.
