# CampusStay FPT — Backend endpoint map

Every endpoint of `docs/api-contract.md` (which includes every change logged in `03_API_Contract_Changes.md`), the module that owns it, its MoSCoW priority and the build slice. **Status:** Planned → Coded (written) → Verified (integration test passes in `mvn verify`). Claude Code updates the column in the same commit as the code. Notes name the change IDs of `03_API_Contract_Changes.md` and the test cases that verify a row; every test case is described in `04_Test_Catalog.md`. Every endpoint returns IDs as strings (ADR-15, B-03).

Total: 206 endpoints (212 when the six `GET, PUT` rows count twice); all 206 coded and verified (`POST /auth/google` by integration tests with Google's token check stubbed and by hand with a real account, 25/10/2026). Change Specification v2 adds endpoints phase by phase (`docs/01_Change_Spec_v2.md` §16); phase 1 added `PUT /auth/me/locale`, phase 2 the 18 rows of section V2-2 (in `main` and production since 25/10/2026), phase 3 the 25 rows of section V2-3 (in `main` and production since 25/10/2026).

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
| CFG | GET, PUT | `/admin/eligibility` | Must | Verified | C-16; TC-CFG-009 |
| CFG | GET, PUT | `/admin/fees` | Must | Verified | C-16; TC-CFG-008 |
| CFG | GET, PUT | `/admin/matching` | Must | Verified | C-16; TC-CFG-010 |
| CFG | POST | `/admin/matching/preview` | Must | Verified | Runs the assignment engine over the Term's approved Applications (ASG implements `cfg.MatchingPreviewer`, S3); TC-CFG-010 (nobody to place) |
| CFG | GET | `/admin/room-classes` | Must | Verified | B-04 (`usedIn`: Rooms of the class in the current Term, v2 phase 3); TC-CFG-007, TC-INV-009 |
| CFG | POST | `/admin/room-classes` | Must | Verified | TC-CFG-007 |
| CFG | PUT | `/admin/room-classes/{id}` | Must | Verified | TC-CFG-007 |
| CFG | GET | `/admin/room-types` | Must | Verified | TC-CFG-005, TC-INV-005 |
| CFG | POST | `/admin/room-types` | Must | Verified | TC-CFG-005 |
| CFG | PUT | `/admin/room-types/{id}` | Must | Verified | Beds change adds/retires Beds (event to INV); TC-CFG-006, TC-INV-005 |
| CFG | GET, PUT | `/admin/system-parameters` | Must | Verified | C-16; TC-CFG-011 |
| CFG | GET | `/admin/terms` | Must | Verified | TC-CFG-002 |
| CFG | POST | `/admin/terms` | Must | Verified | C-11; TC-CFG-003, 004 |
| CFG | PUT | `/admin/terms/{id}` | Must | Verified | TC-CFG-004 |
| CFG | POST | `/admin/terms/{id}/publish` | Must | Verified | TC-CFG-004 |
| INV | GET | `/admin/buildings` | Must | Verified | C-15, C-40 (Floor classes per Term); TC-INV-001, 012 |
| INV | POST | `/admin/buildings` | Must | Verified | TC-INV-002 |
| INV | PUT | `/admin/buildings/{id}` | Must | Verified | TC-INV-002, 005 |
| INV | GET | `/admin/buildings/{id}/floors/{floor}/rooms` | Must | Verified | TC-INV-002 |
| INV | POST | `/admin/buildings/{id}/rooms/bulk` | Must | Verified | Range up to parameter `inventory.max_floor` (V11); optional `roomClassId` (C-40); TC-INV-002, 012 |
| INV | GET | `/inventory/rooms` | Must | Verified | C-17, C-40 (each Room's class in the Term); TC-INV-004, 005, 006, 009 |
| INV | GET | `/inventory/rooms/{code}` | Must | Verified | TC-INV-004 |
| INV | POST | `/inventory/rooms/{code}/back-in-service` | Must | Verified | TC-INV-006 |
| INV | POST | `/inventory/rooms/{code}/out-of-service` | Must | Verified | C-17; TC-INV-005, 006 |
| INV | GET | `/inventory/structure` | Must | Verified | TC-INV-003, 007 |
| NTF | GET | `/notifications` | Must | Verified | Moved from S2: every layout calls it; C-18; TC-NTF-001, 003 |
| NTF | POST | `/notifications/read-all` | Must | Verified | Moved from S2; TC-NTF-002 |
| NTF | POST | `/notifications/{id}/read` | Must | Verified | Moved from S2; TC-NTF-002 |

## S2 — Application wizard, Deposit Invoice, VietQR/SePay

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| APP | POST | `/applications` | Must | Verified | C-19, C-20; TC-APP-002, 003, 005 |
| APP | GET | `/applications/eligibility` | Must | Verified | C-20; TC-APP-001, 008 |
| APP | POST | `/applications/roommate-check` | Must | Verified | C-08; TC-APP-004 |
| APP | GET | `/applications/{id}` | Must | Verified | Student view and back-office view (C-21); TC-APP-002, 005, 006, 009, 010, 011 |
| APP | POST | `/applications/{id}/cancel` | Must | Verified | Voids an unpaid Deposit, refunds a paid one by rule; TC-APP-007, 009 |
| APP | POST | `/roommate-invitations/{id}/respond` | Must | Verified | TC-APP-005, 006 |
| APP | GET | `/students/me/applications` | Must | Verified | TC-APP-002, 005 |
| APP | GET | `/students/me/home` | Must | Verified | `allocation`, `checkedIn` from S3; `openRequests` from S4; TC-APP-002, 009, TC-ASG-010 |
| APP | GET | `/students/me/profile` | Must | Verified | TC-APP-009 |
| APP | GET | `/students/me/roommate-invitation` | Must | Verified | TC-APP-005, 006 |
| BIL | GET | `/invoices/{id}` | Must | Verified | Student (own), Admin, Staff/Manager of the Block (C-22); TC-BIL-001, 004, 006, 010 |
| BIL | GET | `/invoices/{id}/payment` | Must | Verified | TC-BIL-001, 003, 006 |
| BIL | POST | `/invoices/{id}/payment/refresh` | Must | Verified | TC-BIL-001 |
| BIL | GET | `/invoices/{id}/receipt` | Must | Verified | One-page PDF; TC-BIL-003, 004 |
| BIL | GET | `/students/me/invoices` | Must | Verified | TC-BIL-001, 003, 006 |
| BIL | POST | `/webhooks/sepay` | Must | Verified | A-07; TC-BIL-002, 003, 004, 005 |
| CFG | GET | `/catalog` | Must | Verified | TC-APP-001 |

Not in the contract count: `POST /dev/invoices/{id}/simulate-payment` (A-08) pays an Invoice as if SePay reported the exact transfer; it exists only with `campusstay.payment.simulator=true` (dev profile, or `PAYMENT_SIMULATOR=true` on a demo server). Verified: TC-BIL-027, 028.

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
| ASG | GET | `/students/me/allocation` | Must | Verified | C-21; TC-ASG-010, 011 |
| BIL | GET | `/payments` | Must | Verified | C-22; TC-BIL-010, 011 |
| BIL | POST | `/payments/{invoiceId}/confirm` | Must | Verified | C-22; TC-BIL-011, 012 |
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
| MNT | GET | `/maintenance-requests` | Must | Verified | C-24; TC-MNT-002, 003 |
| MNT | POST | `/maintenance-requests` | Must | Verified | Photos (signed links, A-10); TC-MNT-001 |
| MNT | GET | `/maintenance-requests/options` | Must | Verified | TC-MNT-001, 002 |
| MNT | GET | `/maintenance-requests/{id}` | Must | Verified | Student and back-office views; TC-MNT-001, 002 |
| MNT | PATCH | `/maintenance-requests/{id}` | Must | Verified | Partial update (C-24); TC-MNT-002 |
| MNT | POST | `/maintenance-requests/{id}/confirm` | Must | Verified | TC-MNT-002 |
| MNT | POST | `/maintenance-requests/{id}/updates` | Must | Verified | TC-MNT-002 |
| NTF | POST | `/devices` | Must | Verified | A-05; push after commit (C-25); TC-NTF-010…012, 020, 021 |
| NTF | POST | `/devices/unregister` | Must | Verified | A-06; TC-NTF-020 |
| REQ | GET | `/students/me/requests` | Must | Verified | Room-change tab: Room-Change Requests and swaps (S5); TC-MNT-001, TC-REQ-001, 010 |
| shared | GET | `/files/{id}` | Must | Verified | A-10 signed links (receipts, photos); TC-BIL-011, TC-MNT-002 |

## S5 — Room-Change Requests, swaps, Round-2, late check-ins, refunds, overdue

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| APP | POST | `/round2-offers/{id}/respond` | Should | Verified | C-27; TC-APP-020, 021 |
| APP | GET | `/students/me/round2-offer` | Should | Verified | Offers made when a Block is approved (C-27); TC-APP-020 |
| ASG | GET | `/late-check-ins` | Should | Verified | C-28; TC-ASG-030, 031 |
| ASG | POST | `/late-check-ins` | Should | Verified | A-12 (recorded at the desk); TC-ASG-030 |
| ASG | POST | `/late-check-ins/{id}/decision` | Should | Verified | TC-ASG-030, 031 |
| BIL | GET | `/finance/overdue` | Should | Verified | Hourly overdue job (C-28); TC-BIL-020 |
| BIL | POST | `/finance/reminders` | Should | Verified | In-app, push and email; TC-BIL-020 |
| BIL | GET | `/finance/summary` | Should | Verified | TC-BIL-020, 021 |
| BIL | GET | `/invoices` | Should | Verified | TC-BIL-020 |
| BIL | GET | `/refunds` | Should | Verified | C-28; TC-BIL-021 |
| BIL | POST | `/refunds/{id}/decision` | Should | Verified | TC-BIL-021 |
| REQ | GET | `/room-changes` | Should | Verified | C-26; TC-REQ-002, 003 |
| REQ | POST | `/room-changes` | Should | Verified | TC-REQ-001 |
| REQ | GET | `/room-changes/options` | Should | Verified | TC-REQ-001 |
| REQ | POST | `/room-changes/{id}/decision` | Should | Verified | Moves the student; Invoice or refund (C-26); TC-REQ-002, 003 |
| REQ | GET | `/room-changes/{id}/matching-beds` | Should | Verified | TC-REQ-002 |
| REQ | GET | `/swap-board` | Should | Verified | TC-REQ-011 |
| REQ | PUT | `/swap-board/my-post` | Should | Verified | TC-REQ-011 |
| REQ | POST | `/swap-board/posts/{id}/request` | Should | Verified | TC-REQ-011 |
| REQ | GET | `/swap-invitations/{id}` | Should | Verified | TC-REQ-010 |
| REQ | POST | `/swap-invitations/{id}/respond` | Should | Verified | TC-REQ-010, 011 |
| REQ | GET | `/swaps` | Should | Verified | C-26; TC-REQ-010…012 |
| REQ | POST | `/swaps` | Should | Verified | TC-REQ-010 |
| REQ | POST | `/swaps/{id}/decision` | Should | Verified | Cross-Block swaps go to the Manager; TC-REQ-010…012 |

## S6 — Utility billing, routing rules, SLA, escalations, Block staff/settings

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| AUTH | GET | `/block-staff` | Should | Verified | C-32; TC-AUTH-019 |
| AUTH | PUT | `/block-staff/{id}` | Should | Verified | C-32; TC-AUTH-020 |
| AUTH | POST | `/staff-account-requests` | Should | Verified | A-13, C-32; TC-AUTH-021 |
| BIL | GET | `/meter-periods` | Should | Verified | C-29; TC-BIL-023 |
| BIL | POST | `/meter-periods/{id}/close` | Should | Verified | C-29; shares in `UtilitySplitTest` (TC-BIL-022, 029…031); TC-BIL-024, 026 |
| BIL | POST | `/meter-periods/{id}/import` | Should | Verified | C-29; TC-BIL-025 |
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
| INV | GET | `/students/me/door-code` | Must | Verified | A-26; released to checked-in residents until phase 5; TC-INV-023 |
| INV | POST | `/students/me/door-code/reveal` | Must | Verified | A-26; audited; TC-INV-023 |
| INV | GET | `/students/me/furniture` | Must | Verified | A-26; TC-INV-023 |

Door-code rotation: a check-out or a move to another Room opens the Room's task and tells the Block's Staff (`DOOR_CODE_TO_SET`): TC-INV-022, TC-ASG-022.
