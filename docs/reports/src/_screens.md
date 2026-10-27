**Public pages (no sign-in)** (5)

| # | Screen | Route | Main API calls |
|---|---|---|---|
| 1 | SCR-AUTH-01 Sign In | /signin | POST /auth/sign-in<br>POST /auth/google |
| 2 | SCR-AUTH-02 Forgot password | /forgot-password | POST /auth/password/forgot |
| 3 | SCR-AUTH-03 Reset password (from the email link) | /reset-password | POST /auth/password/reset |
| 4 | SCR-AUTH-04 Set password (invitation link) | /set-password | POST /auth/password/reset |
| 5 | SCR-AUTH-05 Set a password (first Google sign-in) | /account/password | POST /auth/password/set<br>GET /auth/me |

**Student screens** (23)

| # | Screen | Route | Main API calls |
|---|---|---|---|
| 1 | SCR-HOME-01 Student Home | /student | GET /students/me/home |
| 2 | SCR-APP-01 Application Wizard – 1 Term and eligibility | /student/apply/term | GET /applications/eligibility |
| 3 | SCR-APP-01 Application Wizard – 2 Room preference | /student/apply/room | GET /applications/eligibility |
| 4 | SCR-APP-01 Application Wizard – Roommate (2-bed) | /student/apply/roommate | POST /applications/roommate-check |
| 5 | SCR-APP-01 Application Wizard – 3 Personal info | /student/apply/personal | GET /students/me/profile |
| 6 | SCR-APP-01 Application Wizard – 4 Review and submit | /student/apply/review | POST /applications |
| 7 | SCR-APP-02 My Applications | /student/applications | GET /students/me/applications |
| 8 | SCR-APP-03 Application Detail | /student/applications/:id | GET /applications/:id<br>POST /applications/:id/cancel |
| 9 | SCR-APP-04 Roommate Invitation | /student/roommate-invitation | GET /students/me/roommate-invitation<br>POST /roommate-invitations/:id/respond |
| 10 | SCR-ASG-02 Round 2 Offer | /student/round-2-offer | GET /students/me/round2-offer<br>POST /round2-offers/:id/respond |
| 11 | SCR-BIL-01 My Invoices | /student/invoices | GET /students/me/invoices |
| 12 | SCR-BIL-03 Utility Invoice | /student/invoices/:id | GET /invoices/:id |
| 13 | SCR-BIL-02 Invoice Payment | /student/invoices/:id/pay | GET /invoices/:id/payment<br>POST /invoices/:id/claim<br>POST /invoices/:id/payment/refresh |
| 14 | SCR-ASG-01 My Room | /student/room | GET /students/me/allocation<br>POST /students/me/stay/extension<br>POST /students/me/stay/end<br>GET /students/me/late-check-in<br>(+4 more) |
| 15 | SCR-MNT-01 My Requests | /student/requests | GET /students/me/requests<br>POST /room-class-changes/:id/consent<br>GET /maintenance-requests/:id<br>POST /maintenance-requests/:id/confirm |
| 16 | SCR-MNT-02 New Maintenance Request | /student/requests/maintenance/new | GET /maintenance-requests/options<br>POST /maintenance-requests |
| 17 | SCR-REQ-02 New Room-Change Request (next Term) | /student/requests/room-change/new | GET /room-changes/options<br>POST /room-changes |
| 18 | SCR-REQ-08 Room Class change (next Term) | /student/requests/room-class/new | GET /room-class-changes/options<br>POST /room-class-changes |
| 19 | SCR-REQ-03 Room Swap – Specific Student | /student/requests/swap/new | POST /swaps |
| 20 | SCR-REQ-04 Swap Board | /student/requests/swap/board | GET /swap-board<br>PUT /swap-board/my-post<br>POST /swap-board/posts/:id/request |
| 21 | SCR-REQ-05 Swap Invitation | /student/requests/swap/invitations/:id | GET /swap-invitations/:id<br>POST /swap-invitations/:id/respond |
| 22 | SCR-AUTH-06 Account verification (sign-up form) | /student/verification | GET /students/me/verification<br>PUT /students/me/verification |
| 23 | SCR-HOME-05 Registration period details | /student/registration-periods/:termId | GET /registration-periods/:termId |

**Staff screens** (19)

| # | Screen | Route | Main API calls |
|---|---|---|---|
| 1 | SCR-HOME-02 Staff Dashboard | /staff | GET /dashboards/staff |
| 2 | SCR-INV-10 Room and Bed Inventory | /staff/inventory | GET /inventory/structure<br>GET /inventory/rooms<br>GET /inventory/rooms/:code<br>POST /inventory/rooms/:code/out-of-service<br>(+1 more) |
| 3 | SCR-INV-14 Room hub | /staff/rooms/:code | GET /inventory/rooms/:code/hub |
| 4 | SCR-INV-12 Door codes | /staff/door-codes | GET /door-codes<br>POST /door-codes/:room<br>POST /door-codes/:room/confirm<br>POST /door-codes/:room/cancel<br>(+2 more) |
| 5 | SCR-INV-13 Furniture | /staff/furniture | GET /furniture<br>GET /furniture/:id<br>PUT /furniture/:id<br>POST /furniture<br>(+4 more) |
| 6 | SCR-UTL-10 Meter Readings | /staff/meter-readings | GET /meter-periods<br>GET /meter-periods/:id/readings<br>GET /meter-periods/:id/readings/:room<br>POST /meter-periods/:id/import<br>(+1 more) |
| 7 | SCR-MNT-10 Maintenance Queue | /staff/maintenance | GET /maintenance-requests<br>GET /maintenance-requests/options |
| 8 | SCR-MNT-11 Maintenance Detail | /staff/maintenance/:id | GET /maintenance-requests/:id<br>PATCH /maintenance-requests/:id<br>POST /maintenance-requests/:id/updates |
| 9 | SCR-MNT-12 Inspection Checklist | /staff/inspections | GET /inspection-runs/current<br>GET /inspection-runs/:id/rooms<br>PUT /inspection-runs/:id/rooms/:room<br>POST /inspection-runs/:id/submit<br>(+1 more) |
| 10 | SCR-REQ-10 Room-Change Queue | /staff/room-changes | GET /room-changes<br>GET /room-changes/:id/matching-beds<br>POST /room-changes/:id/decision |
| 11 | SCR-REQ-13 Room Swap Requests | /staff/room-changes/swaps | GET /swaps<br>POST /swaps/:id/decision |
| 12 | SCR-ASG-20 Term transition – requests window and turnover | /staff/next-term | GET /renewals |
| 13 | SCR-ASG-20 Term transition | /staff/next-term/:tab | GET /renewals |
| 14 | SCR-ASG-21 Operational moves | /staff/moves | GET /operational-moves/options<br>POST /operational-moves<br>GET /operational-moves |
| 15 | SCR-REQ-11 Check-in Desk | /staff/check-in | GET /check-in/today<br>GET /check-in/lookup<br>POST /check-in<br>POST /late-check-ins |
| 16 | SCR-REQ-12 Check-out Desk | /staff/check-out | GET /check-out<br>GET /check-out/:allocationId<br>POST /check-out/:allocationId |
| 17 | SCR-AUTH-13 Students | /staff/students | GET /student-accounts |
| 18 | SCR-AUTH-14 Student hub | /staff/students/:id | GET /student-accounts/:id<br>PUT /student-accounts/:id<br>POST /student-accounts/:id/verify<br>POST /student-accounts/:id/reject<br>(+2 more) |
| 19 | SCR-NTF-22 Announcements | /staff/announcements | GET /announcements<br>GET /announcements/options<br>POST /announcements<br>PUT /announcements/:id |

**Manager screens** (38)

| # | Screen | Route | Main API calls |
|---|---|---|---|
| 1 | SCR-HOME-03 Manager Dashboard | /manager | GET /dashboards/manager |
| 2 | SCR-REQ-20 Decisions (late check-in, swaps, refunds) | /manager/approvals | GET /approvals/summary<br>GET /late-check-ins<br>POST /late-check-ins/:id/decision<br>GET /swaps<br>(+2 more) |
| 3 | SCR-REQ-20 Decisions | /manager/approvals/late-check-in | GET /approvals/summary<br>GET /late-check-ins<br>POST /late-check-ins/:id/decision<br>GET /swaps<br>(+2 more) |
| 4 | SCR-APP-10 Application Queue | /manager/applications | GET /applications<br>POST /applications/bulk-review |
| 5 | SCR-APP-11 Application Review | /manager/applications/:id | GET /applications/:id<br>POST /applications/:id/review |
| 6 | SCR-ASG-10 Assignment Runs | /manager/assignment | GET /assignment-runs<br>POST /assignment-runs |
| 7 | SCR-ASG-11 Assignment Proposal Review | /manager/assignment/:runId | GET /assignment-runs/:runId/proposal<br>GET /assignment-runs/:runId/conflicts/:applicationId<br>POST /assignment-runs/:runId/commit |
| 8 | SCR-BIL-10 Payments | /manager/payments | GET /payments<br>POST /payments/:invoiceId/confirm |
| 9 | SCR-BIL-13 Payment confirmations | /manager/payment-claims | GET /payment-claims<br>POST /payment-claims/confirm<br>POST /payment-claims/reject |
| 10 | SCR-ASG-12 Terminations | /manager/terminations | GET /terminations<br>POST /terminations<br>POST /terminations/:id/cancel |
| 11 | SCR-REQ-10 Room-Change Queue | /manager/room-changes | GET /room-changes<br>GET /room-changes/:id/matching-beds<br>POST /room-changes/:id/decision |
| 12 | SCR-REQ-13 Room Swap Requests | /manager/room-changes/swaps | GET /swaps<br>POST /swaps/:id/decision |
| 13 | SCR-ASG-20 Term transition – requests window, next-Term fees and turnover | /manager/next-term | GET /renewals |
| 14 | SCR-ASG-20 Term transition | /manager/next-term/:tab | GET /renewals |
| 15 | SCR-ASG-21 Operational moves | /manager/moves | GET /operational-moves/options<br>POST /operational-moves<br>GET /operational-moves |
| 16 | SCR-AUTH-17 Reconciliation (enrolled list) | /manager/reconciliation | GET /reconciliations<br>GET /reconciliations/template<br>POST /reconciliations<br>GET /reconciliations/:id<br>(+1 more) |
| 17 | SCR-INV-10 Room and Bed Inventory | /manager/inventory | GET /inventory/structure<br>GET /inventory/rooms<br>GET /inventory/rooms/:code<br>POST /inventory/rooms/:code/out-of-service<br>(+1 more) |
| 18 | SCR-INV-14 Room hub | /manager/rooms/:code | GET /inventory/rooms/:code/hub |
| 19 | SCR-INV-11 Room Classes by Term | /manager/room-classes | GET /inventory/room-classes<br>PUT /inventory/room-classes |
| 20 | SCR-INV-12 Door codes | /manager/door-codes | GET /door-codes<br>POST /door-codes/:room<br>POST /door-codes/:room/confirm<br>POST /door-codes/:room/cancel<br>(+2 more) |
| 21 | SCR-INV-13 Furniture | /manager/furniture | GET /furniture<br>GET /furniture/:id<br>PUT /furniture/:id<br>POST /furniture<br>(+4 more) |
| 22 | SCR-MNT-10 Maintenance Queue | /manager/maintenance | GET /maintenance-requests<br>GET /maintenance-requests/options |
| 23 | SCR-MNT-11 Maintenance Detail | /manager/maintenance/:id | GET /maintenance-requests/:id<br>PATCH /maintenance-requests/:id<br>POST /maintenance-requests/:id/updates |
| 24 | SCR-MNT-20 Inspection Schedule | /manager/inspections | GET /inspection-schedules<br>POST /inspection-schedules<br>PUT /inspection-schedules/:id |
| 25 | SCR-BIL-20 Block Finance | /manager/finance | GET /finance/summary<br>GET /refunds<br>POST /refunds/:id/decision<br>GET /finance/overdue<br>(+2 more) |
| 26 | SCR-AUTH-10 Block Staff | /manager/staff | GET /block-staff<br>PUT /block-staff/:id |
| 27 | SCR-REQ-20 Request Routing Rules | /manager/routing-rules | GET /routing-rules<br>POST /routing-rules<br>PUT /routing-rules/:id<br>PUT /routing-rules/timers |
| 28 | SCR-REQ-21 Escalations | /manager/escalations | GET /escalations<br>POST /escalations/:id/actions |
| 29 | SCR-RPT-10 Block Reports | /manager/reports | GET /reports/block<br>GET /exports/block-occupancy |
| 30 | SCR-CFG-20 Block Settings | /manager/block-settings | GET /block-settings<br>PUT /block-settings |
| 31 | SCR-AUTH-13 Students | /manager/students | GET /student-accounts |
| 32 | SCR-AUTH-14 Student hub | /manager/students/:id | GET /student-accounts/:id<br>PUT /student-accounts/:id<br>POST /student-accounts/:id/verify<br>POST /student-accounts/:id/reject<br>(+2 more) |
| 33 | SCR-AUTH-15 Import student list | /manager/student-import | GET /student-imports/template<br>POST /student-imports<br>GET /student-imports/:id<br>POST /student-imports/:id/confirm<br>(+1 more) |
| 34 | SCR-AUTH-16 Staff accounts | /manager/staff-accounts | GET /staff-accounts<br>POST /staff-accounts<br>PUT /staff-accounts/:id<br>POST /staff-accounts/:id/invitation |
| 35 | SCR-CFG-22 Registration-period requests | /manager/term-requests | GET /term-requests<br>GET /term-requests/:id<br>POST /term-requests<br>PUT /term-requests/:id<br>(+3 more) |
| 36 | SCR-RPT-11 Term dashboard | /manager/terms | GET /dashboards/term |
| 37 | SCR-RPT-11 Term dashboard | /manager/terms/:id | GET /dashboards/term |
| 38 | SCR-NTF-22 Announcements | /manager/announcements | GET /announcements<br>GET /announcements/options<br>POST /announcements<br>PUT /announcements/:id |

**Admin screens** (29)

| # | Screen | Route | Main API calls |
|---|---|---|---|
| 1 | SCR-HOME-04 Admin Dashboard | /admin | GET /dashboards/admin |
| 2 | SCR-CFG-01 Terms | /admin/terms | GET /admin/terms |
| 3 | SCR-CFG-23 Term wizard | /admin/terms/new | POST /admin/terms/drafts |
| 4 | SCR-CFG-23 Term wizard | /admin/terms/:id | GET /admin/terms/:id/wizard<br>PUT /admin/terms/:id/wizard/:step<br>POST /admin/terms/:id/publish |
| 5 | SCR-CFG-22 Registration-period requests | /admin/term-requests | GET /term-requests<br>GET /term-requests/:id<br>POST /term-requests<br>PUT /term-requests/:id<br>(+3 more) |
| 6 | SCR-CFG-24 Deadlines and reminders | /admin/deadlines | GET /admin/settings/deadlines<br>PUT /admin/settings/deadlines |
| 7 | SCR-CFG-25 Refunds, penalties and terminations | /admin/refunds | GET /admin/fees<br>GET /admin/settings/refunds |
| 8 | SCR-CFG-26 Stay and renewal | /admin/stay | GET /admin/settings/stay<br>PUT /admin/settings/stay |
| 9 | SCR-NTF-22 Announcements | /admin/announcements | GET /announcements<br>GET /announcements/options<br>POST /announcements<br>PUT /announcements/:id |
| 10 | SCR-CFG-02 Room Types | /admin/room-types | GET /admin/room-types<br>POST /admin/room-types<br>PUT /admin/room-types/:id |
| 11 | SCR-CFG-03 Room Classes | /admin/room-classes | GET /admin/room-classes<br>POST /admin/room-classes<br>PUT /admin/room-classes/:id<br>GET /admin/room-class-requirements<br>(+1 more) |
| 12 | SCR-CFG-04 Deposit | /admin/fees | GET /admin/fees<br>PUT /admin/fees |
| 13 | SCR-CFG-20 Utility | /admin/utility | GET /admin/utility<br>PUT /admin/utility |
| 14 | SCR-CFG-05 Who may apply | /admin/eligibility | GET /admin/eligibility<br>PUT /admin/eligibility |
| 15 | SCR-CFG-06 Roommate matching | /admin/matching | GET /admin/matching<br>PUT /admin/matching<br>POST /admin/matching/preview |
| 16 | SCR-CFG-21 Inspection Checklists | /admin/inspection-checklists | GET /inspection-checklists<br>POST /inspection-checklists<br>POST /inspection-checklists/:id/publish<br>POST /inspection-checklists/:id/archive |
| 17 | SCR-CFG-07 Notification Templates | /admin/notifications | GET /admin/notification-templates<br>PUT /admin/notification-templates/:key<br>POST /admin/notification-templates/:key/test |
| 18 | SCR-NTF-21 Send Email | /admin/notifications/send | GET /admin/emails/options<br>POST /admin/emails/preview<br>POST /admin/emails |
| 19 | SCR-CFG-08 System Parameters | /admin/system-parameters | GET /admin/system-parameters<br>PUT /admin/system-parameters |
| 20 | SCR-CFG-27 Demo data | /admin/demo | GET /admin/demo<br>POST /admin/demo/reset<br>GET /admin/demo/files/:kind |
| 21 | SCR-INV-01 Buildings and Structure | /admin/buildings | GET /admin/buildings<br>POST /admin/buildings<br>PUT /admin/buildings/:id<br>POST /admin/buildings/:id/rooms/bulk<br>(+1 more) |
| 22 | SCR-INV-14 Furniture types | /admin/furniture-types | GET /admin/furniture-types<br>POST /admin/furniture-types<br>PUT /admin/furniture-types/:id |
| 23 | SCR-AUTH-11 Users and Roles | /admin/users | GET /admin/users<br>POST /admin/users<br>PUT /admin/users/:id<br>GET /admin/permissions |
| 24 | SCR-RPT-01 Occupancy Report | /admin/reports/occupancy | GET /reports/occupancy<br>GET /exports/occupancy |
| 25 | SCR-RPT-02 Financial Report | /admin/reports/financial | GET /reports/financial<br>GET /exports/financial |
| 26 | SCR-AUTH-12 Audit Log | /admin/audit-log | GET /admin/audit-log<br>GET /exports/audit-log |
| 27 | SCR-AUTH-13 Students | /admin/students | GET /student-accounts |
| 28 | SCR-AUTH-14 Student hub | /admin/students/:id | GET /student-accounts/:id<br>PUT /student-accounts/:id<br>POST /student-accounts/:id/verify<br>POST /student-accounts/:id/reject<br>(+2 more) |
| 29 | SCR-AUTH-15 Import student list | /admin/student-import | GET /student-imports/template<br>POST /student-imports<br>GET /student-imports/:id<br>POST /student-imports/:id/confirm<br>(+1 more) |

