# CampusStay FPT — Backend endpoint map

Every endpoint of `docs/api-contract.md` (which includes every change logged in `03_API_Contract_Changes.md`), the module that owns it, its MoSCoW priority and the build slice. **Status:** Planned → Coded (written) → Verified (integration test passes in `mvn verify`). Claude Code updates the column in the same commit as the code. Notes name the change IDs of `03_API_Contract_Changes.md` and the test cases that verify a row. Every endpoint returns IDs as strings (ADR-15, B-03).

Total: 159 endpoints (164 when the five `GET, PUT` rows count twice); 8 coded, 5 of them verified.

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
| AUTH | POST | `/auth/password/change` | Must | Coded | A-04; no integration test yet |
| AUTH | POST | `/auth/password/forgot` | Must | Verified | A-02; TC-AUTH-007 |
| AUTH | POST | `/auth/password/reset` | Must | Coded | A-03; no integration test yet |
| AUTH | POST | `/auth/sign-in` | Must | Verified | B-02; TC-AUTH-001, 002, 005, 006, 008 |
| AUTH | POST | `/auth/sign-out` | Must | Verified | TC-AUTH-003 |
| CFG | GET | `/terms` | Must | Verified | C-10; TC-CFG-001 |

## S1 — Admin configuration, inventory, users, Audit Log, in-app notification list

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| AUTH | GET | `/admin/audit-log` | Must | Planned |  |
| AUTH | GET | `/admin/permissions` | Must | Planned |  |
| AUTH | GET | `/admin/users` | Must | Planned |  |
| AUTH | POST | `/admin/users` | Must | Planned |  |
| AUTH | PUT | `/admin/users/{id}` | Must | Planned |  |
| CFG | GET, PUT | `/admin/eligibility` | Must | Planned |  |
| CFG | GET, PUT | `/admin/fees` | Must | Planned |  |
| CFG | GET, PUT | `/admin/matching` | Must | Planned |  |
| CFG | POST | `/admin/matching/preview` | Must | Planned |  |
| CFG | GET | `/admin/room-classes` | Must | Planned |  |
| CFG | POST | `/admin/room-classes` | Must | Planned |  |
| CFG | PUT | `/admin/room-classes/{id}` | Must | Planned |  |
| CFG | GET | `/admin/room-types` | Must | Planned |  |
| CFG | POST | `/admin/room-types` | Must | Planned |  |
| CFG | PUT | `/admin/room-types/{id}` | Must | Planned |  |
| CFG | GET, PUT | `/admin/system-parameters` | Must | Planned |  |
| CFG | GET | `/admin/terms` | Must | Planned |  |
| CFG | POST | `/admin/terms` | Must | Planned |  |
| CFG | PUT | `/admin/terms/{id}` | Must | Planned |  |
| CFG | POST | `/admin/terms/{id}/publish` | Must | Planned |  |
| INV | GET | `/admin/buildings` | Must | Planned |  |
| INV | POST | `/admin/buildings` | Must | Planned |  |
| INV | PUT | `/admin/buildings/{id}` | Must | Planned |  |
| INV | GET | `/admin/buildings/{id}/floors/{floor}/rooms` | Must | Planned |  |
| INV | POST | `/admin/buildings/{id}/rooms/bulk` | Must | Planned |  |
| INV | GET | `/inventory/rooms` | Must | Planned |  |
| INV | GET | `/inventory/rooms/{code}` | Must | Planned |  |
| INV | POST | `/inventory/rooms/{code}/back-in-service` | Must | Planned |  |
| INV | POST | `/inventory/rooms/{code}/out-of-service` | Must | Planned |  |
| INV | GET | `/inventory/structure` | Must | Planned |  |
| NTF | GET | `/notifications` | Must | Planned | Moved from S2: every layout calls it |
| NTF | POST | `/notifications/read-all` | Must | Planned | Moved from S2 |
| NTF | POST | `/notifications/{id}/read` | Must | Planned | Moved from S2 |

## S2 — Application wizard, Deposit Invoice, VietQR/SePay

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| APP | POST | `/applications` | Must | Planned |  |
| APP | GET | `/applications/eligibility` | Must | Planned |  |
| APP | POST | `/applications/roommate-check` | Must | Planned |  |
| APP | GET | `/applications/{id}` | Must | Planned |  |
| APP | POST | `/applications/{id}/cancel` | Must | Planned |  |
| APP | POST | `/roommate-invitations/{id}/respond` | Must | Planned |  |
| APP | GET | `/students/me/applications` | Must | Planned |  |
| APP | GET | `/students/me/home` | Must | Planned |  |
| APP | GET | `/students/me/profile` | Must | Planned |  |
| APP | GET | `/students/me/roommate-invitation` | Must | Planned |  |
| BIL | GET | `/invoices/{id}` | Must | Planned |  |
| BIL | GET | `/invoices/{id}/payment` | Must | Planned |  |
| BIL | POST | `/invoices/{id}/payment/refresh` | Must | Planned |  |
| BIL | GET | `/invoices/{id}/receipt` | Must | Planned |  |
| BIL | GET | `/students/me/invoices` | Must | Planned |  |
| BIL | POST | `/webhooks/sepay` | Must | Planned | A-07 |
| CFG | GET | `/catalog` | Must | Planned |  |

## S3 — Review, assignment engine, approval, commit, Allocation, Balance Invoice

| Module | Method | Path | Priority | Status | Note |
|---|---|---|---|---|---|
| APP | GET | `/applications` | Must | Planned |  |
| APP | POST | `/applications/bulk-review` | Must | Planned |  |
| APP | POST | `/applications/{id}/review` | Must | Planned |  |
| ASG | GET | `/approvals/assignment` | Must | Planned |  |
| ASG | GET | `/assignment-runs` | Must | Planned |  |
| ASG | POST | `/assignment-runs` | Must | Planned |  |
| ASG | POST | `/assignment-runs/{runId}/approve` | Must | Planned |  |
| ASG | POST | `/assignment-runs/{runId}/commit` | Must | Planned |  |
| ASG | GET | `/assignment-runs/{runId}/conflicts/{applicationId}` | Must | Planned |  |
| ASG | POST | `/assignment-runs/{runId}/conflicts/{applicationId}/resolve` | Must | Planned |  |
| ASG | GET | `/assignment-runs/{runId}/proposal` | Must | Planned |  |
| ASG | POST | `/assignment-runs/{runId}/return` | Must | Planned |  |
| ASG | GET | `/assignment-runs/{runId}/rooms` | Must | Planned |  |
| ASG | GET | `/students/me/allocation` | Must | Planned |  |
| BIL | GET | `/payments` | Must | Planned |  |
| BIL | POST | `/payments/{invoiceId}/confirm` | Must | Planned |  |

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
