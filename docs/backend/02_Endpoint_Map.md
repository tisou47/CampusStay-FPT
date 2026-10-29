# CampusStay FPT — Backend endpoint map

Every endpoint of `docs/api-contract.md` (which includes every change logged in `03_API_Contract_Changes.md`), the module that owns it, its MoSCoW priority and the build slice. **Status:** Planned → Coded (written) → Verified (integration test passes in `mvn verify`). Claude Code updates the column in the same commit as the code. Notes name the change IDs of `03_API_Contract_Changes.md` and the test cases that verify a row; every test case is described in `04_Test_Catalog.md`. Every endpoint returns IDs as strings (ADR-15, B-03).

Total: 268 endpoints (275 when the seven `GET, PUT` rows count twice); all 268 coded and verified (`POST /auth/google` by integration tests with Google's token check stubbed and by hand with a real account, 25/10/2026). Change Specification v2 adds endpoints phase by phase (`docs/01_Change_Spec_v2.md` §16); phase 1 added `PUT /auth/me/locale`, phase 2 the 18 rows of section V2-2 (in `main` and production since 25/10/2026), phase 3 the 25 rows of section V2-3 (in `main` and production since 25/10/2026), phase 4 the 18 rows of section V2-4 (in `main` and production since 26/10/2026), phase 5 the 9 rows of section V2-5 and removed `POST /webhooks/sepay` (built on `feat/v2-phase5`, in `main` and production since 26/10/2026), phase 6 the 27 rows of section V2-6 (built on `feat/v2-phase6`, in `main` and production since 27/10/2026), phase 7 the 2 rows of section V2-7 and new fields on existing endpoints (built on `feat/v2-phase7-8`, in `main` and production since 27/10/2026).

| Slice | Focus |
|---|---|
| S0 | Foundation, AUTH session, Terms |
| S1 | Admin configuration, inventory, users, Audit Log, in-app notification list |
| S2 | Application wizard, Deposit Invoice, VietQR/SePay |
| S3 | Review, assignment engine, approval, commit, Allocation, Balance Invoice |
| S4 | Check-in/out desk, Maintenance Requests, push notifications |
| S5 | Room-Change Requests, swaps, Round-2, late check-ins, refunds, overdue |
| S6 | Utility billing, routing rules, SLA, escalations, Block staff/settings |
| S7 | Dashboards, reports, exports, inspections, email campaigns, templates |
| V2-2 | Change Specification v2 phase 2 "Accounts": Google sign-up, verification, student list, hub and import, Staff accounts |
| V2-3 | Change Specification v2 phase 3 "Inventory": Room Class per Room per Term, furniture and Room Class requirements, door codes |
| V2-4 | Change Specification v2 phase 4 "Registration periods": Managers' requests, the Term wizard with Term prices, announcements and the board, grouped configuration, rules screens, Term dashboard |
| V2-5 | Change Specification v2 phase 5 "Money and residence": payment claims confirmed by Managers, stay length, door code release and Bed states, forfeits, late check-ins online, Utility warnings and terminations, new refund triggers |
| V2-6 | Change Specification v2 phase 6 "Term transition": Stays and the requests window, next-Term room changes, swaps, Room Class changes, extensions and end of stay, operational moves, enrollment reconciliation, next-Term fees, turnover |

## S0 — Foundation, AUTH session, Terms

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| AUTH | POST | `/auth/google` | Must | Verified | A-01 (`code` or `credential`), A-17 (sign-up), A-22 (redirect flow). Validation and "disabled": TC-AUTH-009, 010, 052; code exchange: TC-AUTH-029…033, 051 (`GoogleCodeExchangerTest`); sign-up, linking by the code in the address and rejection with the token check stubbed: TC-AUTH-038, 040, 041; the real Google token check: signed in by hand on production with a real `@fpt.edu.vn` account on 25/10/2026 (pop-up and redirect flows) |
| AUTH | GET | `/auth/me` | Must | Verified | TC-AUTH-003, 004 |
| AUTH | PUT | `/auth/me/locale` | Must | Verified | A-15 (v2 phase 1, ADR-25); TC-AUTH-036. Every endpoint: `Accept-Language` A-16, TC-AUTH-037 |
| AUTH | POST | `/auth/password/change` | Must | Verified | A-04; TC-AUTH-012, 025, 026, 027 |
| AUTH | POST | `/auth/password/forgot` | Must | Verified | A-02; TC-AUTH-007; the emailed link in TC-AUTH-022 |
| AUTH | POST | `/auth/password/reset` | Must | Verified | A-03; TC-AUTH-012 (invitation link, single use), 022, 023, 024 |
| AUTH | POST | `/auth/sign-in` | Must | Verified | B-02; TC-AUTH-001, 002, 005, 006, 008 |
| AUTH | POST | `/auth/sign-out` | Must | Verified | TC-AUTH-003 |
| CFG | GET | `/terms` | Must | Verified | C-10; TC-CFG-001 |

## S1 — Admin configuration, inventory, users, Audit Log, in-app notification list

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| AUTH | GET | `/admin/audit-log` | Must | Verified | C-18; TC-AUTH-014, 018, TC-CFG-008, TC-INV-006 |
| AUTH | GET | `/admin/permissions` | Must | Verified | Built from `auth.Permission`; TC-AUTH-017 |
| AUTH | GET | `/admin/users` | Must | Verified | C-15; TC-AUTH-011 |
| AUTH | POST | `/admin/users` | Must | Verified | C-15; invitation email via outbox; TC-AUTH-012, 013 |
| AUTH | PUT | `/admin/users/{id}` | Must | Verified | C-15; disabling signs the user out; TC-AUTH-014, 015 |
| CFG | GET, PUT | `/admin/eligibility` | Must | Verified | C-16, A-33 (students failing each check); TC-CFG-009, 025 |
| CFG | GET, PUT | `/admin/fees` | Must | Verified | C-16; seven refund triggers since V42; a change is announced (C-41); `blockCheckIn`, `manualConfirm` removed (B-05, v2 phase 5); TC-CFG-008, TC-NTF-043 |
| CFG | GET, PUT | `/admin/matching` | Must | Verified | C-16, A-33 (levels); TC-CFG-010, 025 |
| CFG | POST | `/admin/matching/preview` | Must | Verified | Runs the assignment engine over the Term's approved Applications (ASG implements `cfg.MatchingPreviewer`, S3); TC-CFG-010 (nobody to place) |
| CFG | GET | `/admin/room-classes` | Must | Verified | B-04 (`usedIn`: Rooms of the class in the current Term, v2 phase 3); TC-CFG-007, TC-INV-009 |
| CFG | POST | `/admin/room-classes` | Must | Verified | TC-CFG-007 |
| CFG | PUT | `/admin/room-classes/{id}` | Must | Verified | TC-CFG-007 |
| CFG | GET | `/admin/room-types` | Must | Verified | TC-CFG-005, TC-INV-005 |
| CFG | POST | `/admin/room-types` | Must | Verified | TC-CFG-005 |
| CFG | PUT | `/admin/room-types/{id}` | Must | Verified | Beds change adds/retires Beds (event to INV); TC-CFG-006, TC-INV-005 |
| CFG | GET, PUT | `/admin/system-parameters` | Must | Verified | C-16; the parameters of a settings group moved to A-31; TC-CFG-011, 024 |
| CFG | GET | `/admin/terms` | Must | Verified | A-27 (`wizardStep`, `requestCode`); TC-CFG-002, 022 |
| CFG | POST | `/admin/terms` | Must | Verified | C-11; TC-CFG-003, 004 |
| CFG | PUT | `/admin/terms/{id}` | Must | Verified | A published Term's change is announced (C-41); TC-CFG-004 |
| CFG | POST | `/admin/terms/{id}/publish` | Must | Verified | A-27, C-41: checks, then fixes prices, Deposit, Utility Deposit and rules; Managers told, Term announcement; TC-CFG-004, 021 |
| INV | GET | `/admin/buildings` | Must | Verified | C-15, C-40 (Floor classes per Term); TC-INV-001, 012 |
| INV | POST | `/admin/buildings` | Must | Verified | TC-INV-002 |
| INV | PUT | `/admin/buildings/{id}` | Must | Verified | TC-INV-002, 005 |
| INV | GET | `/admin/buildings/{id}/floors/{floor}/rooms` | Must | Verified | TC-INV-002 |
| INV | POST | `/admin/buildings/{id}/rooms/bulk` | Must | Verified | Range up to parameter `inventory.max_floor` (V11); optional `roomClassId` (C-40); TC-INV-002, 012 |
| INV | GET | `/inventory/rooms` | Must | Verified | C-17, C-40 (each Room's class in the Term); Bed states unpaid, paid, resident (B-06), leaving, next_term (B-10); TC-INV-004, 005, 006, 009, TC-ASG-032, 033, 038 |
| INV | GET | `/inventory/rooms/{code}` | Must | Verified | TC-INV-004 |
| INV | POST | `/inventory/rooms/{code}/back-in-service` | Must | Verified | TC-INV-006 |
| INV | POST | `/inventory/rooms/{code}/out-of-service` | Must | Verified | C-17; TC-INV-005, 006 |
| INV | GET | `/inventory/structure` | Must | Verified | TC-INV-003, 007 |
| NTF | GET | `/notifications` | Must | Verified | Moved from S2: every layout calls it; C-18; a student's list also holds the board's announcements (C-41); TC-NTF-001, 003, 041 |
| NTF | POST | `/notifications/read-all` | Must | Verified | Moved from S2; also announcements (C-41); TC-NTF-002 |
| NTF | POST | `/notifications/{id}/read` | Must | Verified | Moved from S2; `ann-<n>` reads an announcement (C-41); TC-NTF-002, 041 |

## S2 — Application wizard, Deposit Invoice, VietQR/SePay

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| APP | POST | `/applications` | Must | Verified | C-19, C-20; `stayTerms` (stay length, A-38); TC-APP-002, 003, 005, 023 |
| APP | GET | `/applications/eligibility` | Must | Verified | C-20; `maxStayTerms`, not a continuing resident (A-38); TC-APP-001, 008, 023 |
| APP | POST | `/applications/roommate-check` | Must | Verified | C-08; TC-APP-004 |
| APP | GET | `/applications/{id}` | Must | Verified | Student view and back-office view (C-21); TC-APP-002, 005, 006, 009, 010, 011 |
| APP | POST | `/applications/{id}/cancel` | Must | Verified | Voids an unpaid Deposit, refunds a paid one by rule; TC-APP-007, 009 |
| APP | POST | `/roommate-invitations/{id}/respond` | Must | Verified | `stayTerms` when accepting (A-38); TC-APP-005, 006 |
| APP | GET | `/students/me/applications` | Must | Verified | TC-APP-002, 005 |
| APP | GET | `/students/me/home` | Must | Verified | `allocation`, `checkedIn` from S3; `openRequests` from S4; TC-APP-002, 009, TC-ASG-010 |
| APP | GET | `/students/me/profile` | Must | Verified | TC-APP-009 |
| APP | GET | `/students/me/roommate-invitation` | Must | Verified | TC-APP-005, 006 |
| BIL | GET | `/invoices/{id}` | Must | Verified | Student (own), Admin, Staff/Manager of the Block (C-22); TC-BIL-001, 004, 006, 010 |
| BIL | GET | `/invoices/{id}/payment` | Must | Verified | `claim`, `canClaim`; no QR without a bank account (A-34); TC-BIL-001, 006, 032, 033 |
| BIL | POST | `/invoices/{id}/payment/refresh` | Must | Verified | TC-BIL-001 |
| BIL | GET | `/invoices/{id}/receipt` | Must | Verified | One-page PDF; TC-BIL-003, 004 |
| BIL | GET | `/students/me/invoices` | Must | Verified | `summary.awaitingCount`, `summary.warning` (A-39); type `termFee` (B-10); TC-BIL-001, 006, 032, 037 |
| CFG | GET | `/catalog` | Must | Verified | The Term's prices, Deposit and Utility Deposit (C-41); TC-APP-001, TC-CFG-021 |

Removed in v2 phase 5 (ADR-22, B-07): `POST /webhooks/sepay` (A-07) and the payment simulator `POST /dev/invoices/{id}/simulate-payment` (A-08). Payments are claims (section V2-5).

## S3 — Review, assignment engine, approval, commit, Allocation, Balance Invoice

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| APP | GET | `/applications` | Must | Verified | C-21; TC-APP-010, 011 |
| APP | POST | `/applications/bulk-review` | Must | Verified | Approves only; TC-ASG-010 |
| APP | POST | `/applications/{id}/review` | Must | Verified | C-21; TC-APP-010, 011 |
| ASG | GET | `/approvals/assignment` | Must | Verified | TC-ASG-010, 011. Since v2 phase 1 the commit approves at once (C-38): kept, not called by the web |
| ASG | GET | `/assignment-runs` | Must | Verified | Run ids `RUN-<n>` (C-21); TC-ASG-010, 011 |
| ASG | POST | `/assignment-runs` | Must | Verified | Engine unit tests TC-ASG-001…006; TC-ASG-010, 011 |
| ASG | POST | `/assignment-runs/{runId}/approve` | Must | Verified | Allocations + Balance Invoices + notifications; TC-ASG-010. Since v2 phase 1 run by the commit (C-38): kept, not called by the web |
| ASG | POST | `/assignment-runs/{runId}/commit` | Must | Verified | A Manager commits the Block: Allocations, Balance Invoices and notifications at once (v2 phase 1, C-38); TC-ASG-010, 011 |
| ASG | GET | `/assignment-runs/{runId}/conflicts/{applicationId}` | Must | Verified | TC-ASG-010 |
| ASG | POST | `/assignment-runs/{runId}/conflicts/{applicationId}/resolve` | Must | Verified | TC-ASG-010 |
| ASG | GET | `/assignment-runs/{runId}/proposal` | Must | Verified | TC-ASG-010, 011 |
| ASG | POST | `/assignment-runs/{runId}/return` | Must | Verified | TC-ASG-010. Nothing waits for approval since v2 phase 1 (C-38): kept, not called by the web |
| ASG | GET | `/assignment-runs/{runId}/rooms` | Must | Verified | TC-ASG-010, 011. Not called by the web since v2 phase 1 (the Decisions page has no assignment tab) |
| ASG | GET | `/students/me/allocation` | Must | Verified | C-21; residency status, `stayTerms`, `termination` (A-39, B-06); `stay`, `nextTerm` (A-43); TC-ASG-010, 011, 032, 035, 038…042, TC-REQ-019 |
| BIL | GET | `/payments` | Must | Verified | C-22; TC-BIL-010, 011 |
| BIL | POST | `/payments/{invoiceId}/confirm` | Must | Verified | C-22; one Invoice with an optional receipt: its claim, or a transfer not claimed yet; no `amount` (B-05); TC-BIL-011, 012 |
| BIL | GET | `/payments/{invoiceId}/receipt-file` | Must | Verified | A-09; TC-BIL-011 |

## S4 — Check-in/out desk, Maintenance Requests, push notifications

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| ASG | POST | `/check-in` | Must | Verified | C-23; TC-ASG-020 |
| ASG | GET | `/check-in/lookup` | Must | Verified | Code, name or pass (A-11); C-23; TC-ASG-020, 021 |
| ASG | GET | `/check-in/today` | Must | Verified | TC-ASG-020, 021 |
| ASG | GET | `/check-out` | Must | Verified | C-23; TC-ASG-021, 022 |
| ASG | GET | `/check-out/{allocationId}` | Must | Verified | B-01 (was `{studentCode}`); TC-ASG-021, 022 |
| ASG | POST | `/check-out/{allocationId}` | Must | Verified | B-01; Utility Deposit settlement (C-23); TC-ASG-022 (opens the door-code rotation, A-25), 023 |
| ASG | GET | `/check-out/readings` | Must | Verified | A-55; TC-ASG-046 |
| ASG | PUT | `/check-out/readings` | Must | Verified | A-55; TC-ASG-046 |
| ASG | POST | `/check-out/readings` (multipart) | Must | Verified | A-55; TC-ASG-046 |
| ASG | GET | `/check-out/readings/template` | Must | Verified | A-55; XLSX; TC-ASG-046 |
| MNT | GET | `/maintenance-requests` | Must | Verified | C-24; TC-MNT-002, 003 |
| MNT | POST | `/maintenance-requests` | Must | Verified | Photos (signed links, A-10); TC-MNT-001 |
| MNT | GET | `/maintenance-requests/options` | Must | Verified | TC-MNT-001, 002 |
| MNT | GET | `/maintenance-requests/{id}` | Must | Verified | Student and back-office views; TC-MNT-001, 002 |
| MNT | PATCH | `/maintenance-requests/{id}` | Must | Verified | Partial update (C-24); only the person in charge changes the status (B-12); TC-MNT-002, 009 |
| MNT | POST | `/maintenance-requests/{id}/confirm` | Must | Verified | TC-MNT-002 |
| MNT | POST | `/maintenance-requests/{id}/updates` | Must | Verified | TC-MNT-002 |
| NTF | POST | `/devices` | Must | Verified | A-05; push after commit (C-25); TC-NTF-010…012, 020, 021 |
| NTF | POST | `/devices/unregister` | Must | Verified | A-06; TC-NTF-020 |
| REQ | GET | `/students/me/requests` | Must | Verified | Room-change tab: every next-Term request (B-10); TC-MNT-001, TC-REQ-001, 010, 020 |
| shared | GET | `/files/{id}` | Must | Verified | A-10 signed links (receipts, photos); TC-BIL-011, TC-MNT-002 |

## S5 — Room-Change Requests, swaps, Round-2, late check-ins, refunds, overdue

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| APP | POST | `/round2-offers/{id}/respond` | Should | Verified | C-27; TC-APP-020, 021 |
| ASG | GET | `/round2` | Must | Verified | A-57; TC-APP-024 |
| ASG | POST | `/round2/run` | Must | Verified | A-57; TC-APP-024 |
| APP | GET | `/round2/offers` | Must | Verified | A-58; TC-APP-024 |
| APP | POST | `/applications/{id}/withdraw` | Must | Verified | A-61, B-13; TC-APP-025 |
| APP | GET | `/students/me/round2-offer` | Should | Verified | Offers made when a Block is approved (C-27); TC-APP-020 |
| ASG | GET | `/late-check-ins` | Should | Verified | C-28; `source` Online or Desk (A-36); TC-ASG-030, 031, 037 |
| ASG | POST | `/late-check-ins` | Should | Verified | A-12 (recorded at the desk); TC-ASG-030 |
| ASG | POST | `/late-check-ins/{id}/decision` | Should | Verified | at most `late_check_in.max_days` after the check-in end; moves the Balance deadline (A-36); TC-ASG-030, 031, 033, 037 |
| BIL | GET | `/finance/overdue` | Should | Verified | Hourly overdue job (C-28); TC-BIL-020 |
| BIL | POST | `/finance/reminders` | Should | Verified | In-app, push and email; TC-BIL-020 |
| BIL | GET | `/finance/summary` | Should | Verified | TC-BIL-020, 021 |
| BIL | GET | `/invoices` | Should | Verified | TC-BIL-020 |
| BIL | GET | `/refunds` | Should | Verified | C-28; TC-BIL-021 |
| BIL | POST | `/refunds/{id}/decision` | Should | Verified | TC-BIL-021 |
| REQ | GET | `/room-changes` | Should | Verified | C-26, B-08 (next Term since v2 phase 6); TC-REQ-002, 003 |
| REQ | POST | `/room-changes` | Should | Verified | B-08; TC-REQ-001 |
| REQ | GET | `/room-changes/options` | Should | Verified | B-08; TC-REQ-001 |
| REQ | POST | `/room-changes/{id}/decision` | Should | Verified | Moves the next-Term Allocation; nothing invoiced or refunded since v2 phase 6 (B-08, C-43); TC-REQ-002, 003 |
| REQ | GET | `/room-changes/{id}/matching-beds` | Should | Verified | TC-REQ-002 |
| REQ | GET | `/swap-board` | Should | Verified | B-09; TC-REQ-011 |
| REQ | PUT | `/swap-board/my-post` | Should | Verified | TC-REQ-011 |
| REQ | POST | `/swap-board/posts/{id}/request` | Should | Verified | TC-REQ-011 |
| REQ | GET | `/swap-invitations/{id}` | Should | Verified | B-09; TC-REQ-010 |
| REQ | POST | `/swap-invitations/{id}/respond` | Should | Verified | TC-REQ-010, 011 |
| REQ | GET | `/swaps` | Should | Verified | C-26, B-09; TC-REQ-010…012 |
| REQ | POST | `/swaps` | Should | Verified | TC-REQ-010 |
| REQ | POST | `/swaps/{id}/decision` | Should | Verified | Cross-Block swaps go to a Manager; next-Term Beds, no charge or credit (B-09); TC-REQ-010…012 |

## S6 — Utility billing, routing rules, SLA, escalations, Block staff/settings

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| AUTH | GET | `/block-staff` | Should | Verified | C-32; TC-AUTH-019 |
| AUTH | PUT | `/block-staff/{id}` | Should | Verified | C-32; TC-AUTH-020 |
| AUTH | GET | `/block-staff/me` | Should | Verified | A-60; TC-AUTH-057 |
| AUTH | PUT | `/block-staff/me/duty` | Should | Verified | A-60; TC-AUTH-057 |
| AUTH | GET | `/students/me/refund-account` | Must | Verified | A-62; TC-AUTH-058 |
| AUTH | PUT | `/students/me/refund-account` | Must | Verified | A-62; TC-AUTH-058, TC-APP-025 |
| AST | GET | `/students/me/assistant` | Could | Verified | A-63; TC-AST-001, 005 |
| AST | POST | `/students/me/assistant/chat` | Could | Verified | A-63; TC-AST-001…007 |
| AUTH | POST | `/staff-account-requests` | Should | Verified | A-13, C-32; TC-AUTH-021 |
| BIL | GET | `/meter-periods` | Should | Verified | C-29; TC-BIL-023 |
| BIL | POST | `/meter-periods/{id}/close` | Should | Verified | C-29; shares in `UtilitySplitTest` (TC-BIL-022, 029…031); TC-BIL-024, 026 |
| BIL | POST | `/meter-periods/{id}/import` | Should | Verified | C-29, A-59 (XLSX, blank lines skipped); TC-BIL-025, 039 |
| BIL | GET | `/meter-periods/{id}/template` | Should | Verified | A-59; TC-BIL-039 |
| BIL | GET | `/meter-periods/{id}/readings` | Should | Verified | C-29; TC-BIL-023, 024 |
| BIL | GET | `/meter-periods/{id}/readings/{room}` | Should | Verified | C-29; TC-BIL-024 |
| BIL | PUT | `/meter-periods/{id}/readings/{room}` | Should | Verified | C-29; TC-BIL-024, 026 |
| BIL | POST | `/meter-periods/{id}/readings/{room}/confirm` | Should | Verified | Was missing from this map (in the contract, used by the web); C-29; TC-BIL-024 |
| CFG | GET, PUT | `/admin/utility` | Should | Verified | C-29; TC-CFG-013 |
| CFG | GET | `/block-settings` | Should | Verified | C-33; TC-CFG-014 |
| CFG | PUT | `/block-settings` | Should | Verified | C-33; TC-CFG-014, 015 |
| REQ | GET | `/escalations` | Should | Verified | C-31; scan every 15 minutes; TC-REQ-016…018 |
| REQ | POST | `/escalations/{id}/actions` | Should | Verified | C-31; TC-REQ-016, 018 |
| REQ | GET | `/routing-rules` | Should | Verified | C-30; TC-REQ-013 |
| REQ | POST | `/routing-rules` | Should | Verified | C-30; new requests follow the rules: TC-REQ-013…015 |
| REQ | PUT | `/routing-rules/timers` | Should | Verified | C-30; TC-REQ-013 |
| REQ | PUT | `/routing-rules/{id}` | Should | Verified | C-30; TC-REQ-013 |

## S7 — Dashboards, reports, exports, inspections, email campaigns, templates

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| MNT | GET | `/inspection-checklists` | Could | Verified | C-34; TC-MNT-004 |
| MNT | POST | `/inspection-checklists` | Could | Verified | C-34; TC-MNT-004 |
| MNT | POST | `/inspection-checklists/{id}/archive` | Could | Verified | C-34; pauses the schedules: TC-MNT-004, 006 |
| MNT | POST | `/inspection-checklists/{id}/publish` | Could | Verified | A-14, C-34; TC-MNT-004, 006 |
| MNT | GET | `/inspection-runs/current` | Could | Verified | C-34; TC-MNT-005, 007 |
| MNT | GET | `/inspection-runs/upcoming` | Could | Verified | C-34; TC-MNT-005 |
| MNT | GET | `/inspection-runs/{id}/rooms` | Could | Verified | C-34; TC-MNT-005 |
| MNT | PUT | `/inspection-runs/{id}/rooms/{room}` | Could | Verified | C-34; a failed item creates a Maintenance Request: TC-MNT-005 |
| MNT | POST | `/inspection-runs/{id}/rooms/{room}/unreachable` | Could | Verified | C-34; TC-MNT-005 |
| MNT | POST | `/inspection-runs/{id}/submit` | Could | Verified | C-34; TC-MNT-005 |
| MNT | GET | `/inspection-schedules` | Could | Verified | C-34; TC-MNT-005…007 |
| MNT | POST | `/inspection-schedules` | Could | Verified | C-34; starts the first run; job at 06:00: TC-MNT-005, 006 |
| MNT | PUT | `/inspection-schedules/{id}` | Could | Verified | C-34; TC-MNT-006, 007 |
| NTF | POST | `/admin/emails` | Could | Verified | C-35; TC-NTF-033 |
| NTF | GET | `/admin/emails/options` | Could | Verified | C-35; TC-NTF-032 |
| NTF | POST | `/admin/emails/preview` | Could | Verified | C-35; TC-NTF-032 |
| NTF | GET | `/admin/notification-templates` | Could | Verified | C-35; TC-NTF-030 |
| NTF | PUT | `/admin/notification-templates/{key}` | Could | Verified | C-35; TC-NTF-030 |
| NTF | POST | `/admin/notification-templates/{key}/test` | Could | Verified | C-35; TC-NTF-031 |
| RPT | GET | `/approvals/summary` | Should | Verified | C-36; TC-RPT-003 |
| RPT | GET | `/dashboards/admin` | Should | Verified | C-36; TC-RPT-004 |
| RPT | GET | `/dashboards/manager` | Should | Verified | C-36; TC-RPT-002 |
| RPT | GET | `/dashboards/staff` | Should | Verified | C-36; TC-RPT-001 |
| RPT | GET | `/exports/{report}` | Must | Verified | C-37; CSV; each screen export is implemented by its module: TC-RPT-008, 009 |
| RPT | GET | `/reports/block` | Must | Verified | C-37; TC-RPT-007 |
| RPT | GET | `/reports/financial` | Must | Verified | C-37; TC-RPT-006 |
| RPT | GET | `/reports/occupancy` | Must | Verified | A-14, C-37; TC-RPT-005 |

## V2-2 — Change Specification v2 phase 2 "Accounts"

Built on `feat/v2-phase2`, merged into `main` and deployed on 25/10/2026 (ADR-27). Migrations V36 (AUTH) and V37 (NTF).

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| AUTH | POST | `/auth/password/set` | Must | Verified | A-17; the setup gate (`PASSWORD_REQUIRED`, `PROFILE_REQUIRED`): TC-AUTH-038 |
| AUTH | GET, PUT | `/students/me/verification` | Must | Verified | A-18; TC-AUTH-038, 039 |
| AUTH | GET | `/student-accounts` | Must | Verified | A-19; Staff: residents of their Blocks; TC-AUTH-042 |
| AUTH | GET | `/student-accounts/{id}` | Must | Verified | A-19; the student hub (sections from APP, ASG, BIL, REQ through `StudentRecords`); TC-AUTH-043 |
| AUTH | PUT | `/student-accounts/{id}` | Must | Verified | A-19; TC-AUTH-044 |
| AUTH | POST | `/student-accounts/{id}/verify` | Must | Verified | A-19; TC-AUTH-045, TC-APP-022 |
| AUTH | POST | `/student-accounts/{id}/reject` | Must | Verified | A-19; TC-AUTH-041, 045 |
| AUTH | POST | `/student-accounts/{id}/lock` | Must | Verified | A-19; TC-AUTH-045 |
| AUTH | POST | `/student-accounts/{id}/unlock` | Must | Verified | A-19; TC-AUTH-045 |
| AUTH | GET | `/student-imports` | Must | Verified | A-20; TC-AUTH-047 |
| AUTH | GET | `/student-imports/template` | Must | Verified | A-20; TC-AUTH-046 |
| AUTH | POST | `/student-imports` | Must | Verified | A-20; CSV and XLSX: TC-AUTH-046, 048 |
| AUTH | GET | `/student-imports/{id}` | Must | Verified | A-20; TC-AUTH-048 |
| AUTH | POST | `/student-imports/{id}/confirm` | Must | Verified | A-20, C-39; TC-AUTH-047 |
| AUTH | GET | `/staff-accounts` | Must | Verified | A-21; TC-AUTH-049 |
| AUTH | POST | `/staff-accounts` | Must | Verified | A-21; TC-AUTH-049, TC-NTF-040 |
| AUTH | PUT | `/staff-accounts/{id}` | Must | Verified | A-21; TC-AUTH-050 |
| AUTH | POST | `/staff-accounts/{id}/invitation` | Must | Verified | A-21; TC-AUTH-050 |

Email redirect for fictional accounts only (spec O-3): `ntf_email_outbox.demo_recipient`, TC-NTF-039 (`EmailSenderConfigTest`), TC-NTF-040.

## V2-3 — Change Specification v2 phase 3 "Inventory"

Built on `feat/v2-phase3`, merged into `main` and deployed on 25/10/2026 (ADR-27; `DOOR_CODE_KEY` set on the VM). Migrations V38–V40 (INV: Room Class per Room per Term, furniture, door codes) and V41 (NTF: door-code notifications). Room Class per Room per Term also changes `GET /inventory/rooms`, `/admin/buildings` and `/admin/room-classes` (C-40, B-04).

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| INV | GET | `/inventory/room-classes` | Must | Verified | A-23; Staff: their Blocks; TC-INV-008, 010, 011 |
| INV | PUT | `/inventory/room-classes` | Must | Verified | A-23; Managers; Terms not started, Beds not given yet; TC-INV-009, 010, 011 |
| INV | GET | `/inventory/rooms/{code}/details` | Must | Verified | A-23; TC-INV-009, 014, 017, 018 |
| INV | GET | `/admin/furniture-types` | Must | Verified | A-24; TC-INV-013 |
| INV | POST | `/admin/furniture-types` | Must | Verified | A-24; TC-INV-013 |
| INV | PUT | `/admin/furniture-types/{id}` | Must | Verified | A-24; `409 TYPE_REQUIRED`; TC-INV-013 |
| INV | GET | `/admin/room-class-requirements` | Must | Verified | A-24; TC-INV-014 |
| INV | PUT | `/admin/room-class-requirements/{roomClassId}` | Must | Verified | A-24; TC-INV-014 |
| INV | GET | `/furniture` | Must | Verified | A-24; TC-INV-015, 016, 018 |
| INV | GET | `/furniture/{id}` | Must | Verified | A-24; history; TC-INV-015, 016, 017, 018 |
| INV | POST | `/furniture` | Must | Verified | A-24; Managers register items; TC-INV-016 |
| INV | PUT | `/furniture/{id}` | Must | Verified | A-24; TC-INV-018 |
| INV | GET | `/furniture/moves` | Must | Verified | A-24; TC-INV-017 |
| INV | POST | `/furniture/moves` | Must | Verified | A-24; transfers between Blocks by Managers; TC-INV-017 |
| INV | POST | `/furniture/moves/{id}/done` | Must | Verified | A-24; TC-INV-017 |
| INV | POST | `/furniture/moves/{id}/cancel` | Must | Verified | A-24; TC-INV-017 |
| INV | GET | `/door-codes` | Must | Verified | A-25; TC-INV-019, 020, 022 |
| INV | POST | `/door-codes/import` | Must | Verified | A-25; CSV checked line by line; TC-INV-021 |
| INV | POST | `/door-codes/{room}` | Must | Verified | A-25; typed or random; TC-INV-019, 020 |
| INV | POST | `/door-codes/{room}/confirm` | Must | Verified | A-25; residents notified (`DOOR_CODE_CHANGED`); TC-INV-019, 020, 022 |
| INV | POST | `/door-codes/{room}/cancel` | Must | Verified | A-25; TC-INV-020 |
| INV | POST | `/door-codes/{room}/reveal` | Must | Verified | A-25; audited; TC-INV-019, 020, 021 |
| INV | GET | `/students/me/door-code` | Must | Verified | A-26; released once the Balance is paid, the check-in start has come and the Room's code is confirmed (v2 phase 5, C-42); TC-INV-023, TC-ASG-032, 036 |
| INV | POST | `/students/me/door-code/reveal` | Must | Verified | A-26; audited; TC-INV-023 |
| INV | GET | `/students/me/furniture` | Must | Verified | A-26; TC-INV-023 |

Door-code rotation: a check-out or a move to another Room opens the Room's task and tells the Block's Staff (`DOOR_CODE_TO_SET`): TC-INV-022, TC-ASG-022.

## V2-4 — Change Specification v2 phase 4 "Registration periods"

Built on `feat/v2-phase4` (ADR-20, ADR-27), in `main` and production since 26/10/2026. Migrations V42 (CFG: Term milestones M1–M7, Term prices, Blocks and Rooms of a Term, the rules a Term opened with, information for students, registration-period requests and their history, grouped settings, three refund triggers, report views) and V43 (NTF: announcements with a read state per user, the request and publish notifications). A published Term keeps its prices, Deposit, Utility Deposit and rules; every reader asks the Term (C-41). Change announcements also come from `PUT /admin/room-types/{id}`, `/admin/room-classes/{id}`, `/admin/fees`, `/admin/utility` and `/block-settings`.

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| CFG | GET | `/term-requests` | Must | Verified | A-28; Managers and the Admin; TC-CFG-016 |
| CFG | GET | `/term-requests/{id}` | Must | Verified | A-28; history, differences with reasons; TC-CFG-016, 018, 019 |
| CFG | POST | `/term-requests` | Must | Verified | A-28; Managers; one open request per Term; Admins and other Managers told; TC-CFG-016, 017 |
| CFG | PUT | `/term-requests/{id}` | Must | Verified | A-28; the requester, Submitted or Needs changes; TC-CFG-018 |
| CFG | POST | `/term-requests/{id}/comments` | Must | Verified | A-28; TC-CFG-018 |
| CFG | POST | `/term-requests/{id}/decision` | Must | Verified | A-28; Admin: In progress, Needs changes, Rejected; TC-CFG-018 |
| CFG | POST | `/admin/terms/drafts` | Must | Verified | A-27; from a request or empty; TC-CFG-019, 020, 021 |
| CFG | GET | `/admin/terms/{id}/wizard` | Must | Verified | A-27; TC-CFG-019, 021, 022 |
| CFG | PUT | `/admin/terms/{id}/wizard/{step}` | Must | Verified | A-27; reasons for differences; spec §5.2 checks; after publishing extend-only, money locked, change announcement; TC-CFG-019, 020, 021, 022 |
| CFG | GET | `/registration-periods/current` | Must | Verified | A-29; TC-CFG-023 |
| CFG | GET | `/registration-periods/{termId}` | Must | Verified | A-29; TC-CFG-023 |
| CFG | GET, PUT | `/admin/settings/{group}` | Must | Verified | A-31; deadlines, refunds, stay; TC-CFG-024 |
| NTF | GET | `/students/me/board` | Must | Verified | A-30; TC-NTF-041, 042, 043, TC-CFG-021, 022 |
| NTF | GET | `/announcements` | Must | Verified | A-30; Staff see their Blocks' and everybody's; TC-NTF-041, 042 |
| NTF | GET | `/announcements/options` | Must | Verified | A-30; TC-NTF-042 |
| NTF | POST | `/announcements` | Must | Verified | A-30; Staff: residents of their Blocks only; TC-NTF-041, 042 |
| NTF | PUT | `/announcements/{id}` | Must | Verified | A-30; pin, end; TC-NTF-042 |
| RPT | GET | `/dashboards/term` | Must | Verified | A-32; Managers and the Admin; TC-RPT-012 |

## V2-5 — Change Specification v2 phase 5 "Money and residence"

Built on `feat/v2-phase5` (ADR-22, ADR-23, ADR-27), in `main` and production since 26/10/2026. Migrations V44 (BIL: payment claims, the bank-feed inbox kept as an archive, Invoices fixed once issued and refunded once, reminders, Utility warnings), V45 (ASG: residence and door-code release times, forfeits, late check-ins asked online, terminations), V46 (APP: stay length, Forfeited), V47 (CFG: `cfg_fee_policy` without its two switches, `stay.program_semesters`, the Termination check-out reason), V48 (INV: rotation after an overdue termination) and V49 (NTF: the notifications and emails of money and residence). Contract changes A-34…A-39, B-05…B-07, C-42.

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| BIL | POST | `/invoices/{id}/claim` | Must | Verified | A-34; the student's "I have transferred"; one open claim; Deposit and Balance only before their deadline; TC-BIL-032, 033, 034, 035 |
| BIL | GET | `/payment-claims` | Must | Verified | A-35; Managers; filters type, since, q, Term, Block (the web sends no Term: a queue of every Term); count and total; TC-BIL-032, 034 |
| BIL | POST | `/payment-claims/confirm` | Must | Verified | A-35; each Invoice paid at the time of its claim, audited and announced on its own; TC-BIL-032, 034, 035 |
| BIL | POST | `/payment-claims/reject` | Must | Verified | A-35; reason required; time left given back (min. 12 h); a second rejection cancels a Deposit or Balance; debts never cancelled; TC-BIL-033, 034, 035, TC-ASG-034 |
| ASG | GET | `/students/me/late-check-in` | Should | Verified | A-36; TC-ASG-037 |
| ASG | POST | `/students/me/late-check-in` | Should | Verified | A-36; reason, day (up to the check-in end + `late_check_in.max_days`), evidence file; Managers told; TC-ASG-033, 037 |
| ASG | GET | `/terminations` | Must | Verified | A-37; Managers, Staff (their Blocks, read only); TC-ASG-035, 036, TC-BIL-038 |
| ASG | POST | `/terminations` | Must | Verified | A-37; Managers; Manager decision (note required) or Not enrolled; TC-ASG-035, 036 |
| ASG | POST | `/terminations/{id}/cancel` | Must | Verified | A-37; Managers, with a reason; TC-ASG-035 |

Jobs (no endpoint): the forfeit every 5 minutes, the door-code release and overdue terminations every 15 minutes (TC-ASG-032…034, 036), payment reminders and the Managers' hourly summary of claims (TC-BIL-036), overdue Invoices and the Utility debt rules every hour (TC-BIL-020, 037, 038).

## V2-6 — Change Specification v2 phase 6 "Term transition"

Built on `feat/v2-phase6` (ADR-21, ADR-27), in `main` and production since 27/10/2026. Migrations V50 (ASG: Stays, next-Term Allocations with their renewal state and fee payment, the requests window of a Term, operational moves, report views), V51 (REQ: Room-Change Requests and swaps of the next Term without price differences, Room Class changes with consents, extension and end-of-stay requests; open in-Term requests closed), V52 (AUTH: enrollment reconciliations and their items), V53 (BIL: the next-Term room fee `TERM_FEE`, one live per Allocation; meter cuts at a move or the turnover), V54 (CFG: operational move reasons; where the Stay settings act) and V55 (NTF: the notifications and emails of the Term transition). Contract changes A-40…A-46, B-08…B-10, C-43.

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| ASG | GET | `/renewals` | Must | Verified | A-40; Staff, Managers, the Admin; TC-ASG-038 |
| ASG | GET | `/renewals/overview` | Must | Verified | A-40; milestones M2–M7, counts, open requests, reconciliation, Beds for new students; TC-ASG-038, 039, TC-REQ-021 |
| ASG | GET | `/next-term-fees` | Must | Verified | A-41; Managers; the blockers (filing, open requests, reconciliation, prices); TC-ASG-040, TC-AUTH-054 |
| ASG | POST | `/next-term-fees/issue` | Must | Verified | A-41; one fee per continuing resident, end-of-stay notices; issuing again bills nobody twice; TC-ASG-040…042, 044 |
| ASG | GET | `/turnover` | Must | Verified | A-40; leavers, movers, Rooms whose residents change; TC-ASG-042 |
| ASG | POST | `/turnover/meter-cuts` | Must | Verified | A-40; `DESK`; TC-ASG-042 |
| ASG | GET | `/operational-moves/options` | Must | Verified | A-45; by student code or Allocation; Staff their Blocks; TC-ASG-043 |
| ASG | POST | `/operational-moves` | Must | Verified | A-45; reason, both meter readings for a resident, the next-Term Bed follows or stays; after M6 only a Manager, same price when paid; TC-ASG-042…044 |
| ASG | GET | `/operational-moves` | Must | Verified | A-45; TC-ASG-043 |
| REQ | GET | `/room-class-changes/options` | Must | Verified | A-42; TC-REQ-020 |
| REQ | POST | `/room-class-changes` | Must | Verified | A-42; a continuing resident for their Room, a Manager for any Room; TC-REQ-020, 021 |
| REQ | POST | `/room-class-changes/{id}/consent` | Must | Verified | A-42; every other continuing resident; a refusal cancels; TC-REQ-020 |
| REQ | GET | `/room-class-changes` | Must | Verified | A-42; TC-REQ-020 |
| REQ | GET | `/room-class-changes/{id}` | Must | Verified | A-42; consents, prices, furniture check; TC-REQ-020 |
| REQ | POST | `/room-class-changes/{id}/decision` | Must | Verified | A-42; consents first, furniture reserved from the Block store; TC-REQ-020 |
| REQ | POST | `/room-class-changes/{id}/set-back` | Must | Verified | A-42; Managers; next-Term fees issued again or the difference charged or credited (spec §6.11 step 6); TC-REQ-020 |
| REQ | POST | `/students/me/stay/extension` | Must | Verified | A-43; approved at once when enrolled and nothing overdue, else Staff decide; TC-REQ-019, 021 |
| REQ | POST | `/students/me/stay/end` | Must | Verified | A-43; the next-Term Bed is released at once; TC-REQ-019 |
| REQ | GET | `/stay-requests` | Must | Verified | A-43; TC-REQ-019 |
| REQ | POST | `/stay-requests/{id}/decision` | Must | Verified | A-43; a note to reject; TC-REQ-019 |
| REQ | GET | `/next-term-requests` | Must | Verified | A-44; every open request of a window, oldest first; TC-REQ-021 |
| REQ | POST | `/next-term-requests/decision` | Must | Verified | A-44; each item on its own, failures listed; TC-REQ-021 |
| AUTH | GET | `/reconciliations` | Must | Verified | A-46; Managers; TC-AUTH-053, 054 |
| AUTH | GET | `/reconciliations/template` | Must | Verified | A-46; TC-AUTH-053 |
| AUTH | POST | `/reconciliations` | Must | Verified | A-46; enrolled list or leavers, CSV or XLSX; groups 1–4; TC-AUTH-053…055 |
| AUTH | GET | `/reconciliations/{id}` | Must | Verified | A-46; TC-AUTH-053, 054 |
| AUTH | POST | `/reconciliations/{id}/items/{itemId}/resolve` | Must | Verified | A-46; a note; Not enrolled ends what the student holds in the Term; TC-AUTH-054, 055 |

Jobs (no endpoint): every 15 minutes the renewal job opens the requests windows that reached M2, closes filing at M3 (Beds still awaiting extension are released), alerts Managers before M4 and cancels the next-Term fees unpaid at M7 (TC-ASG-038, 039, 041); the door-code release of a paid continuing resident ends the Allocation of the previous Term (TC-ASG-042).

## V2-7 — Change Specification v2 phases 7 "Operations" and 8 "Documents"

Built on `feat/v2-phase7-8` (both phases in one branch, one test run and one deployment: user decision 27/10/2026), built on `feat/v2-phase7-8`, in `main` and production since 27/10/2026. Migrations V56 (MNT: SLA deadline set when a request is routed, the furniture item of a request), V57 (INV: Repair entries in a furniture item's history), V58 (MNT: the Room's own checks in inspections), V59 (ASG: damage per furniture item at check-out). Contract changes A-47…A-52, B-11, C-44. The demo reset tool of phase 8 waits until the demo scenarios are planned (user decision 27/10/2026).

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| RPT | GET | `/search` | Should | Verified | A-47; students, Rooms, Invoices, Applications, requests inside the Blocks; TC-RPT-013 |
| INV | GET | `/inventory/rooms/{code}/hub` | Should | Verified | A-48; residents, meter readings, Maintenance Requests, inspections; TC-INV-024 |

Changed (no new path): `/maintenance-requests` SLA deadline and furniture item (A-49, TC-MNT-008), `GET /routing-rules` staff workload (A-50, TC-REQ-022), `GET /dashboards/term` requests window (A-50, TC-RPT-014), inspection Rooms' own checks (A-51, B-11, TC-MNT-005), check-out damage per item and overdue check-outs (A-52, TC-ASG-045).

## Demo data and Rooms left out (27/10/2026)

The demo reset tool of spec §15 (stages 0, A, B and C; `DEMO_TOOLS=true` on the demo server) and the import of the Rooms a Term leaves out.

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| INV | POST | `/inventory/room-codes` | Should | Verified | A-53; CSV or XLSX list of Room codes; TC-INV-025 |
| CFG | GET | `/admin/demo` | Could | Verified | A-54; stages, scenario accounts, sample files; TC-CFG-026, TC-CFG-029 |
| CFG | POST | `/admin/demo/reset` | Could | Verified | A-54; checked by TC-CFG-027 (the stages themselves are loaded and checked against the base data locally) |
| CFG | GET | `/admin/demo/files/{kind}` | Could | Verified | A-54; TC-CFG-028 |
