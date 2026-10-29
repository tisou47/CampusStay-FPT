# Backend answers to the UX review (30/10/2026)

Answers to `Backend_Questions_UX_Review.md`, one per question, checked against the code and the local demo data. Each answer says whether the question found a backend bug, what changed, and what the web should do now. The new fields are contract change **A-63** (`docs/backend/03_API_Contract_Changes.md`); every change only adds fields, so the current screens keep working until they use them.

| # | Verdict | Backend change | Web action |
|---|---|---|---|
| Q1 | **Bug, fixed** | Manager `kpis` now count Invoices without a Bed | Label the figure "Collected (Term)", tooltip with the rule below |
| Q2 | **Partly a bug, fixed** | Admin `residents` follows ADR-23; both dashboards give `allocated` and `residents` | Show "Beds held" and "Living in" as two figures |
| Q3 | Correct question, rule added | `funnelOutside.continuing` | Show "N continuing residents (no Application)" under the funnel |
| Q4 | **Bug, fixed** | Rates rounded down; `outstanding`, `outstandingInvoices` | Show the debt next to the rate; format the rate with `Math.floor` |
| Q5 | Demo data, fixed | Demo check-outs at desk hours | None |
| Q6 | Not now (breaking change) | None | Key `Tag` by entity and label (explained below) |
| Q7 | Accepted | `values` on every attention line | Write titles from `kind` + `values` |
| Q8 | Already one path | None | One screen, two buttons (explained below) |
| Q9 | Accepted | `window`, `checkInStart`, `checkInEnd`, `termId`, `termName` | "Check-in opens 31/10 · 278 expected" while `window = UPCOMING` |
| Q10 | One rule already; the picker remembers the last choice | None | Default the picker to `current`; label each Term (below) |
| Q11 | Partly accepted | Manager dashboard gains `work` and `bedsByBlock` | Drop `/dashboards/staff` from Manager Overview |
| Extra | **Bug, fixed** | `generate-catalogs.mjs` reads the lazy routes | `docs/web/01_Screen_Map.md` is regenerated (114 routes) |

## How the figures are built (background for every answer)

- **Reports never read another feature's tables.** Each feature publishes reporting views (`rpt_v_invoice`, `rpt_v_allocation`, `rpt_v_application`, …) in its own migration; `DashboardService`, `ReportService` and the Term dashboard read only those views. Billing's own screens (`/finance/*`, `/invoices`, `/payments`) read Billing's tables. Two code paths for one number is how Q1 happened; the fix makes both use the same SQL rule, and a test (TC-RPT-015) now checks that `/finance/summary`, `/dashboards/manager` and `/dashboards/admin` give the same `collected`.
- **Scope.** Without `termId` every endpoint uses the **current** Term (stay includes today), else the Term open for registration. Without `block`, the Blocks the user may see: Managers see every Block (ADR-19), Staff their own. An Invoice or refund without a Bed (a Deposit before allocation) belongs to the Blocks of the student's gender.
- **Residence (ADR-23).** A student *lives in* the Room from `resident_at`: when the door code is released after payment, or when Staff record a desk check-in, whichever is first. `checked_in_at` is only the desk visit; since phase 5 many residents never come to the desk.
- **Money.** `long` VND, never rounded. Rates are fractions with 4 decimals (`0.9997`), now rounded down.

## Q1 — "Collected": one definition

**Cause.** The Manager dashboard filtered Invoices by `building_id IN (Blocks)`, so a Deposit paid before a Bed was given (no Block yet) was left out. `/finance/summary` and the Admin dashboard include those Deposits (by the student's gender), hence 15,29 tỷ against 16,04 tỷ. The difference was the Deposits of applicants not yet allocated.

**Rule now used everywhere** (`/dashboards/manager`, `/dashboards/admin`, `/finance/summary`, `/reports/financial`), for the selected Term and Blocks:

| Figure | Invoices counted |
|---|---|
| `invoiced` | Every kind (Deposit, Balance with its Utility Deposit, next-Term fee, Utility, charges), status not Void |
| `collected` | Paid and Refunded (the money came in; refunds are shown apart in `refundsPending…` and the refund list) |
| `outstanding` / `outstandingInvoices` | Unpaid, Overdue, Awaiting confirmation (amount / count) |
| `collectionRate` | `collected / invoiced`, rounded down |

The Utility Deposit is part of the Balance Invoice, so it is **in**. Suggested label: "Collected this Term" with a tooltip "Paid Invoices of every kind, Utility Deposit included; refunds shown apart".

Note: the Admin always sees every Block; a Manager who selects one Block sees that Block plus the bed-less Deposits of its gender, exactly like Collections and refunds with the same filter.

## Q2 — Residents vs occupancy

They counted different things, and the Admin's was also outdated:

| Field | Meaning | Before | Now |
|---|---|---|---|
| `allocated` | Beds held in the Term (Allocations Active; once the Term ended, also those ended by check-out) | Manager only | Manager and Admin |
| `residents` | Of those, students living in (`resident_at`) | Admin only, counted desk check-ins (`checked_in_at`) — 0 in the demo, where residents got the door code | Manager and Admin, by `resident_at` |
| `beds` | Beds in service (Rooms out of service left out) | both | both |

So the Admin now reads "Residents 2,2xx of 3,680" and the Manager can show the same pair. `Occupancy %` = `allocated / beds`. The desk figure ("checked in at the desk") stays in `GET /check-in/today` and `/reports/occupancy` (`checkedIn`), which are about the desk.

## Q3 — The funnel and continuing residents

Yes. The funnel follows **this Term's Applications**; a resident who renews keeps the Bed through a next-Term Allocation (ADR-21) and files no Application, so 288 Allocated vs 2,232 Beds held is expected. Changes:

- `funnel[4]` ("Checked in") now counts the residents **of the funnel's Allocated Applications** only (it counted every desk check-in of the Term).
- `funnelOutside: { waitlisted, rejected, expired, continuing }` gives what the funnel leaves out; `continuing` = Beds held in the Term without an Allocated Application of the Term.
- `funnelNote` names them too, in English (use `funnelOutside` for Vietnamese).

## Q4 — "100 %" with debt left

The rate was rounded half-up to 4 decimals (`0.99973` → `0.9997`) and the screen formats it with 0 decimals, which shows 100 %. Two fixes: the backend now rounds **down** (so `1` means nothing is owed), and both dashboards give `outstanding` and `outstandingInvoices`. On the web, format the rate with `Math.floor(rate * 100)` (or one decimal) and show "4.380.000 ₫ unpaid · 3 Invoices" whenever `outstanding > 0`.

## Q5 — Every check-out at 03:59

Not a storage problem: check-out times are real `Instant`s (UTC) and the web is right to convert them to Vietnam time. The **demo data** set every check-out to "the moment of the reset minus 1–3 days", so all of them showed the time the reset was clicked (03:59). The demo now spreads check-outs over desk hours (08:30–16:20, Vietnam time) on the previous days (`db/demo/asg.sql`, `inv.sql`). Reset a stage again to see it.

Date-only values are always `YYYY-MM-DD` fields (`stayEnd`, `checkInStart`, `checkOutBy`); show those without a time. Fields ending in `At` are instants; show them with a time.

## Q6 — Status codes instead of English labels

**Not now.** Reasons:

1. The labels **are** the contract's codes: every status field has a fixed set of values written in `docs/api-contract.md` (`Awaiting confirmation`, `In progress`, …), mapped one-to-one from the database code. They do not change with the language (the backend translates only error messages, through `Accept-Language`). Keying a `Tag` map by them is as stable as keying it by `AWAITING_CONFIRMATION`.
2. Changing them is a breaking change for ~40 services, the web and the Android app at once, two days before Review 2.

The "near-duplicates" are different entities, on purpose:

| Labels | Where |
|---|---|
| `Awaiting confirmation` | Invoice status (the student claimed a transfer) |
| `Waiting for confirmation` | A payment claim (`/payment-claims`) and a proposed door code |
| `Rejected` | A decision by Staff or a Manager: Application, payment claim, late check-in, refund, next-Term request |
| `Declined` | A student or peer said no: Round-2 offer, swap invitation, Room Class consent |
| `Resolved` / `Closed` | Maintenance Request |
| `Done` | An inspection Room, a Term milestone, a furniture move |
| `Completed` | Not sent by the backend: it only exists in `Tag.jsx` |

Lowercase values are not statuses but states of one screen: `ready`, `blocked`, `checked-in`, `not-allocated` (desk lookup, `/check-in/lookup`), `review` (a proposal row). Suggested web change: a map per entity (`invoiceTone['Awaiting confirmation']`, `claimTone['Waiting for confirmation']`) instead of one global map, and the Vietnamese words in `vi.js` per entity. If after Review 2 you still want codes, ask for a `statusCode` field on the lists you need; it can be added without breaking anything.

## Q7 — Attention lines in Vietnamese

Done. Every item of `attention[]` (`/dashboards/staff`) and `waiting[]` (`/dashboards/manager`) keeps `title`, `body`, `cta` (English) and gains `values`:

| `kind` | `values` |
|---|---|
| `proposal` | `count` (conflicts), `runId` |
| `payments`, `maintenance`, `check-out`, `expired` | `count` |
| `queue` | `count`, `submitted`, `underReview` |
| `room` | `count`, `room` (oldest), `since` (instant) |
| `refund` | `amount` (VND), `source` (`CHECK_OUT`, `ROOM_CHANGE`, `APPLICATION_CANCEL`, other) |
| `escalation` | `code` (the request's code; its title and reason come from the escalation as typed) |
| `routing` | `block`, `requestType` (`MAINTENANCE`, `ROOM_CHANGE`) |

`link`, `severity` and `id` are unchanged. Write the sentence from `kind` + `values` in both languages and fall back to `title` for an unknown `kind`.

## Q8 — Two confirm endpoints

There is one confirmation path in the backend: `POST /payments/{invoiceId}/confirm` calls the same `PaymentClaimService` as `POST /payment-claims/confirm` (ADR-22). They differ in what the Manager has in hand:

| Endpoint | Use it for |
|---|---|
| `POST /payment-claims/confirm { invoiceIds }` | Bulk: confirm the claims students made after checking the bank statement |
| `POST /payments/{invoiceId}/confirm` (multipart: `reference`, `receipt`) | One Invoice with a receipt file or reference, **also when the student never claimed** (the claim is recorded in the Manager's name) |
| `POST /payment-claims/reject { invoiceIds, reason }` | The money did not arrive |

So the screens can merge: one "Payment confirmations" list (`GET /payment-claims`), a bulk "Confirm" button, and a per-row "Confirm with receipt" dialog that calls `/payments/{id}/confirm`. Staff › Payments (`GET /payments`) stays the search over every Invoice; it can open the same dialog.

## Q9 — Check-in before the window opens

Done. `GET /check-in/today` gains `termId`, `termName`, `checkInStart`, `checkInEnd` and `window`: `UPCOMING` before the first check-in day, `OPEN` through the last, `CLOSED` after (late check-ins are still recorded; null if the Term has no check-in days). `expected` keeps its meaning: every Allocation of the Term in the Blocks, i.e. how many will come, not how many came today. Suggested text while `UPCOMING`: "Check-in opens 31/10 · 278 expected".

## Q10 — Which Term is "current"

One rule, in `TermCatalog` (`GET /terms` → `current`): **the published Term whose stay includes today**, else the next one to start, else the latest one. On 30/10 that is Fall 2026 (stay until 02/11). Every endpoint called without `termId` uses it; while no Term is in stay, the one open for registration.

The Admin saw Spring 2027 because the web sends the Term chosen in the picker, and the picker remembers the last choice in `localStorage` (`web/src/app/session.jsx`, `TERM_KEY`). `GET /terms` already gives what the picker needs to label each Term: `current` (in stay → "Current"), `registrationOpen` ("Registration open"), `stayStart` / `stayEnd` (future → "Next", past → "Ended"). The Admin dashboard also gives `nextTerm`. Suggestion: default to `current` on sign-in and show the label next to each Term, so a remembered Spring 2027 reads "Spring 2027 · Next" instead of looking current. No second rule is needed in the backend.

## Q11 — One inbox per role

Partly. The Manager Overview fetched the whole Staff dashboard for four numbers; `GET /dashboards/manager` now includes them:

- `work: { toReview, submitted, underReview, paymentsToConfirm, proposal }`
- `bedsByBlock: [{ block, proposed, capacity }]`

So Manager Overview needs `/dashboards/manager`, `/approvals/summary`, `/round2`, `/payment-claims?pageSize=1` (for its amount summary; `work.paymentsToConfirm` gives the count) and `/block-staff`. Those are lists owned by different features, each with its own page; a single `/inbox` endpoint would join features that the architecture keeps apart (reports read only views, each list keeps its own scope and permissions) and would have to change with every page. The calls run in parallel, so the page waits for the slowest one, not their sum. If a measured page load is slow, tell us which one and we will add its count to the dashboard as above.

## Extra — the empty Screen Map

The lazy-loaded routes (`perf(web): load each page on its first visit`) changed `router.jsx` to `const X = () => import(…)` and `{ path, ...page(X) }`, which `docs/tools/generate-catalogs.mjs` did not read. It now reads both forms; `docs/web/01_Screen_Map.md` is regenerated with every route, its page and its API calls. Re-run `node docs/tools/generate-catalogs.mjs` after changing a page's header comment.
