# CampusStay FPT — Backend endpoint map

Every endpoint of `docs/api-contract.md` (which includes every change logged in `03_API_Contract_Changes.md`), the module that owns it, its MoSCoW priority and the build slice. **Status:** Planned → Coded (written) → Verified (integration test passes in `mvn verify`). Claude Code updates the column in the same commit as the code. Notes name the change IDs of `03_API_Contract_Changes.md` and the test cases that verify a row. Every endpoint returns IDs as strings (ADR-15, B-03).

Total: 160 endpoints (165 when the five `GET, PUT` rows count twice); 75 coded, 74 of them verified.

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

## S0 — Foundation, AUTH session, Terms

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| AUTH | POST | `/auth/google` | Must | Coded | A-01 (`code` or `credential`). Validation and "disabled" in `AuthFlowIT`, code exchange in `GoogleCodeExchangerTest`; the success path needs a real Google account (manual test) |
| AUTH | GET | `/auth/me` | Must | Verified | TC-AUTH-003, 004 |
| AUTH | POST | `/auth/password/change` | Must | Verified | A-04; TC-AUTH-012 |
| AUTH | POST | `/auth/password/forgot` | Must | Verified | A-02; TC-AUTH-007 |
| AUTH | POST | `/auth/password/reset` | Must | Verified | A-03; TC-AUTH-012 (invitation link, single use) |
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
| CFG | GET | `/admin/room-classes` | Must | Verified | TC-CFG-007 |
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
| INV | GET | `/admin/buildings` | Must | Verified | C-15; TC-INV-001 |
| INV | POST | `/admin/buildings` | Must | Verified | TC-INV-002 |
| INV | PUT | `/admin/buildings/{id}` | Must | Verified | TC-INV-002, 005 |
| INV | GET | `/admin/buildings/{id}/floors/{floor}/rooms` | Must | Verified | TC-INV-002 |
| INV | POST | `/admin/buildings/{id}/rooms/bulk` | Must | Verified | Range up to parameter `inventory.max_floor` (V11); TC-INV-002 |
| INV | GET | `/inventory/rooms` | Must | Verified | C-17; TC-INV-004, 005, 006 |
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

Dev profile only, not in the contract count: `POST /dev/invoices/{id}/simulate-payment` (A-08) pays an Invoice as if SePay reported the exact transfer.

## S3 — Review, assignment engine, approval, commit, Allocation, Balance Invoice

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| APP | GET | `/applications` | Must | Verified | C-21; TC-APP-010, 011 |
| APP | POST | `/applications/bulk-review` | Must | Verified | Approves only; TC-ASG-010 |
| APP | POST | `/applications/{id}/review` | Must | Verified | C-21; TC-APP-010, 011 |
| ASG | GET | `/approvals/assignment` | Must | Verified | TC-ASG-010, 011 |
| ASG | GET | `/assignment-runs` | Must | Verified | Run ids `RUN-<n>` (C-21); TC-ASG-010, 011 |
| ASG | POST | `/assignment-runs` | Must | Verified | Engine unit tests TC-ASG-001…006; TC-ASG-010, 011 |
| ASG | POST | `/assignment-runs/{runId}/approve` | Must | Verified | Allocations + Balance Invoices + notifications; TC-ASG-010 |
| ASG | POST | `/assignment-runs/{runId}/commit` | Must | Verified | Staff submit the Block to its Manager; TC-ASG-010, 011 |
| ASG | GET | `/assignment-runs/{runId}/conflicts/{applicationId}` | Must | Verified | TC-ASG-010 |
| ASG | POST | `/assignment-runs/{runId}/conflicts/{applicationId}/resolve` | Must | Verified | TC-ASG-010 |
| ASG | GET | `/assignment-runs/{runId}/proposal` | Must | Verified | TC-ASG-010, 011 |
| ASG | POST | `/assignment-runs/{runId}/return` | Must | Verified | TC-ASG-010 |
| ASG | GET | `/assignment-runs/{runId}/rooms` | Must | Verified | TC-ASG-010, 011 |
| ASG | GET | `/students/me/allocation` | Must | Verified | C-21; TC-ASG-010, 011 |
| BIL | GET | `/payments` | Must | Verified | C-22; TC-BIL-010, 011 |
| BIL | POST | `/payments/{invoiceId}/confirm` | Must | Verified | C-22; TC-BIL-011, 012 |
| BIL | GET | `/payments/{invoiceId}/receipt-file` | Must | Verified | A-09; TC-BIL-011 |

## S4 — Check-in/out desk, Maintenance Requests, push notifications

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| ASG | POST | `/check-in` | Must | Planned |  |
| ASG | GET | `/check-in/lookup` | Must | Planned |  |
| ASG | GET | `/check-in/today` | Must | Planned |  |
| ASG | GET | `/check-out` | Must | Planned |  |
| ASG | GET | `/check-out/{allocationId}` | Must | Planned | B-01 (was `{studentCode}`) |
| ASG | POST | `/check-out/{allocationId}` | Must | Planned | B-01 (was `{studentCode}`) |
| MNT | GET | `/maintenance-requests` | Must | Planned |  |
| MNT | POST | `/maintenance-requests` | Must | Planned |  |
| MNT | GET | `/maintenance-requests/options` | Must | Planned |  |
| MNT | GET | `/maintenance-requests/{id}` | Must | Planned |  |
| MNT | PATCH | `/maintenance-requests/{id}` | Must | Planned |  |
| MNT | POST | `/maintenance-requests/{id}/confirm` | Must | Planned |  |
| MNT | POST | `/maintenance-requests/{id}/updates` | Must | Planned |  |
| NTF | POST | `/devices` | Must | Planned | A-05 |
| NTF | POST | `/devices/unregister` | Must | Planned | A-06 |
| REQ | GET | `/students/me/requests` | Must | Planned |  |

## S5 — Room-Change Requests, swaps, Round-2, late check-ins, refunds, overdue

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| APP | POST | `/round2-offers/{id}/respond` | Should | Planned |  |
| APP | GET | `/students/me/round2-offer` | Should | Planned |  |
| ASG | GET | `/late-check-ins` | Should | Planned |  |
| ASG | POST | `/late-check-ins/{id}/decision` | Should | Planned |  |
| BIL | GET | `/finance/overdue` | Should | Planned |  |
| BIL | POST | `/finance/reminders` | Should | Planned |  |
| BIL | GET | `/finance/summary` | Should | Planned |  |
| BIL | GET | `/invoices` | Should | Planned |  |
| BIL | GET | `/refunds` | Should | Planned |  |
| BIL | POST | `/refunds/{id}/decision` | Should | Planned |  |
| REQ | GET | `/room-changes` | Should | Planned |  |
| REQ | POST | `/room-changes` | Should | Planned |  |
| REQ | GET | `/room-changes/options` | Should | Planned |  |
| REQ | POST | `/room-changes/{id}/decision` | Should | Planned |  |
| REQ | GET | `/room-changes/{id}/matching-beds` | Should | Planned |  |
| REQ | GET | `/swap-board` | Should | Planned |  |
| REQ | PUT | `/swap-board/my-post` | Should | Planned |  |
| REQ | POST | `/swap-board/posts/{id}/request` | Should | Planned |  |
| REQ | GET | `/swap-invitations/{id}` | Should | Planned |  |
| REQ | POST | `/swap-invitations/{id}/respond` | Should | Planned |  |
| REQ | GET | `/swaps` | Should | Planned |  |
| REQ | POST | `/swaps` | Should | Planned |  |
| REQ | POST | `/swaps/{id}/decision` | Should | Planned |  |

## S6 — Utility billing, routing rules, SLA, escalations, Block staff/settings

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| AUTH | GET | `/block-staff` | Should | Planned |  |
| AUTH | PUT | `/block-staff/{id}` | Should | Planned |  |
| AUTH | POST | `/staff-account-requests` | Should | Planned |  |
| BIL | GET | `/meter-periods` | Should | Planned |  |
| BIL | POST | `/meter-periods/{id}/close` | Should | Planned |  |
| BIL | POST | `/meter-periods/{id}/import` | Should | Planned |  |
| BIL | GET | `/meter-periods/{id}/readings` | Should | Planned |  |
| BIL | GET | `/meter-periods/{id}/readings/{room}` | Should | Planned |  |
| BIL | PUT | `/meter-periods/{id}/readings/{room}` | Should | Planned |  |
| BIL | POST | `/meter-periods/{id}/readings/{room}/confirm` | Should | Planned | Was missing from this map (in the contract, used by the web) |
| CFG | GET, PUT | `/admin/utility` | Should | Planned |  |
| CFG | GET | `/block-settings` | Should | Planned |  |
| CFG | PUT | `/block-settings` | Should | Planned |  |
| REQ | GET | `/escalations` | Should | Planned |  |
| REQ | POST | `/escalations/{id}/actions` | Should | Planned |  |
| REQ | GET | `/routing-rules` | Should | Planned |  |
| REQ | POST | `/routing-rules` | Should | Planned |  |
| REQ | PUT | `/routing-rules/timers` | Should | Planned |  |
| REQ | PUT | `/routing-rules/{id}` | Should | Planned |  |

## S7 — Dashboards, reports, exports, inspections, email campaigns, templates

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| MNT | GET | `/inspection-checklists` | Could | Planned |  |
| MNT | POST | `/inspection-checklists` | Could | Planned |  |
| MNT | POST | `/inspection-checklists/{id}/archive` | Could | Planned |  |
| MNT | POST | `/inspection-checklists/{id}/publish` | Could | Planned |  |
| MNT | GET | `/inspection-runs/current` | Could | Planned |  |
| MNT | GET | `/inspection-runs/upcoming` | Could | Planned |  |
| MNT | GET | `/inspection-runs/{id}/rooms` | Could | Planned |  |
| MNT | PUT | `/inspection-runs/{id}/rooms/{room}` | Could | Planned |  |
| MNT | POST | `/inspection-runs/{id}/rooms/{room}/unreachable` | Could | Planned |  |
| MNT | POST | `/inspection-runs/{id}/submit` | Could | Planned |  |
| MNT | GET | `/inspection-schedules` | Could | Planned |  |
| MNT | POST | `/inspection-schedules` | Could | Planned |  |
| MNT | PUT | `/inspection-schedules/{id}` | Could | Planned |  |
| NTF | POST | `/admin/emails` | Could | Planned |  |
| NTF | GET | `/admin/emails/options` | Could | Planned |  |
| NTF | POST | `/admin/emails/preview` | Could | Planned |  |
| NTF | GET | `/admin/notification-templates` | Could | Planned |  |
| NTF | PUT | `/admin/notification-templates/{key}` | Could | Planned |  |
| NTF | POST | `/admin/notification-templates/{key}/test` | Could | Planned |  |
| RPT | GET | `/approvals/summary` | Should | Planned |  |
| RPT | GET | `/dashboards/admin` | Should | Planned |  |
| RPT | GET | `/dashboards/manager` | Should | Planned |  |
| RPT | GET | `/dashboards/staff` | Should | Planned |  |
| RPT | GET | `/exports/{report}` | Must | Planned |  |
| RPT | GET | `/reports/block` | Must | Planned |  |
| RPT | GET | `/reports/financial` | Must | Planned |  |
| RPT | GET | `/reports/occupancy` | Must | Planned |  |
