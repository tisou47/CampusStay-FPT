# CampusStay FPT — Web screen map

| Field | Value |
|---|---|
| Generated | 24/10/2026 by `node docs/tools/generate-catalogs.mjs` from `web/src/app/router.jsx`, `web/src/app/screens.js` and the header comment of each page |
| Feeds | Report 3 (SRS: screens and actors), Report 4 (SDD: user interface design), Report 6 (User Guides) |
| Related | `docs/api-contract.md` (request and response shapes), Figma file *CampusStay-FPT* |

Every route of the web app with its screen code, its Figma frame and the API calls the page makes. Do not edit by hand: change the page's header comment, `screens.js` or the router, then run the generator.

## Public pages (no sign-in)

| Code | Screen | Route | Figma | API calls | Page |
|---|---|---|---|---|---|
| SCR-AUTH-01 | Sign In | `/signin` | 128:58 | `POST /auth/sign-in`<br>`POST /auth/google` | [auth/SignIn.jsx](../../web/src/pages/auth/SignIn.jsx) |
| SCR-AUTH-02 | Forgot password | `/forgot-password` | — | `POST /auth/password/forgot` | [auth/ForgotPassword.jsx](../../web/src/pages/auth/ForgotPassword.jsx) |
| SCR-AUTH-03 | Reset password (from the email link) (`mode="reset"`) | `/reset-password` | — | `POST /auth/password/reset` | [auth/ResetPassword.jsx](../../web/src/pages/auth/ResetPassword.jsx) |
| SCR-AUTH-04 | Set password (invitation link) (`mode="invite"`) | `/set-password` | — | `POST /auth/password/reset` | [auth/ResetPassword.jsx](../../web/src/pages/auth/ResetPassword.jsx) |

## Student — Figma page 05 Web – Student (phones and tablets: 09 Android – Student)

| Code | Screen | Route | Figma | API calls | Page |
|---|---|---|---|---|---|
| SCR-HOME-01 | Student Home | `/student` | 13:96 | `GET /students/me/home` | [student/StudentHome.jsx](../../web/src/pages/student/StudentHome.jsx) |
| SCR-APP-01 | Application Wizard – 1 Term and eligibility | `/student/apply/term` | 14:156 | `GET /applications/eligibility` | [student/apply/ApplyTerm.jsx](../../web/src/pages/student/apply/ApplyTerm.jsx) |
| SCR-APP-01 | Application Wizard – 2 Room preference | `/student/apply/room` | 14:355 | — | [student/apply/ApplyRoom.jsx](../../web/src/pages/student/apply/ApplyRoom.jsx) |
| SCR-APP-01 | Application Wizard – Roommate (2-bed) | `/student/apply/roommate` | 15:811 | `POST /applications/roommate-check` | [student/apply/ApplyRoommate.jsx](../../web/src/pages/student/apply/ApplyRoommate.jsx) |
| SCR-APP-01 | Application Wizard – 3 Personal info | `/student/apply/personal` | 15:352 | `GET /students/me/profile` | [student/apply/ApplyPersonal.jsx](../../web/src/pages/student/apply/ApplyPersonal.jsx) |
| SCR-APP-01 | Application Wizard – 4 Review and submit | `/student/apply/review` | 15:580 | `POST /applications` | [student/apply/ApplyReview.jsx](../../web/src/pages/student/apply/ApplyReview.jsx) |
| SCR-APP-02 | My Applications | `/student/applications` | 19:868 | `GET /students/me/applications` | [student/MyApplications.jsx](../../web/src/pages/student/MyApplications.jsx) |
| SCR-APP-03 | Application Detail | `/student/applications/:id` | 17:888 | `GET /applications/:id`<br>`POST /applications/:id/cancel` | [student/ApplicationDetail.jsx](../../web/src/pages/student/ApplicationDetail.jsx) |
| SCR-APP-04 | Roommate Invitation | `/student/roommate-invitation` | 40:1439 | `GET /students/me/roommate-invitation`<br>`POST /roommate-invitations/:id/respond` | [student/RoommateInvitation.jsx](../../web/src/pages/student/RoommateInvitation.jsx) |
| SCR-ASG-02 | Round 2 Offer | `/student/round-2-offer` | 102:2059 | `GET /students/me/round2-offer`<br>`POST /round2-offers/:id/respond` | [student/Round2Offer.jsx](../../web/src/pages/student/Round2Offer.jsx) |
| SCR-BIL-01 | My Invoices | `/student/invoices` | 19:1051 | `GET /students/me/invoices` | [student/MyInvoices.jsx](../../web/src/pages/student/MyInvoices.jsx) |
| SCR-BIL-03 | Utility Invoice | `/student/invoices/:id` | 102:2263 | `GET /invoices/:id` | [student/InvoiceDetail.jsx](../../web/src/pages/student/InvoiceDetail.jsx) |
| SCR-BIL-02 | Invoice Payment | `/student/invoices/:id/pay` | 17:701 | `GET /invoices/:id/payment`<br>`POST /invoices/:id/payment/refresh` | [student/InvoicePayment.jsx](../../web/src/pages/student/InvoicePayment.jsx) |
| SCR-ASG-01 | My Room | `/student/room` | 39:1535 | `GET /students/me/allocation` | [student/MyRoom.jsx](../../web/src/pages/student/MyRoom.jsx) |
| SCR-MNT-01 | My Requests | `/student/requests` | 41:1522 | `GET /students/me/requests`<br>`GET /maintenance-requests/:id`<br>`POST /maintenance-requests/:id/confirm` | [student/MyRequests.jsx](../../web/src/pages/student/MyRequests.jsx) |
| SCR-MNT-02 | New Maintenance Request | `/student/requests/maintenance/new` | 41:1719 | `GET /maintenance-requests/options`<br>`POST /maintenance-requests` | [student/NewMaintenanceRequest.jsx](../../web/src/pages/student/NewMaintenanceRequest.jsx) |
| SCR-REQ-02 | New Room-Change Request | `/student/requests/room-change/new` | 59:1743 | `GET /room-changes/options`<br>`POST /room-changes` | [student/NewRoomChangeRequest.jsx](../../web/src/pages/student/NewRoomChangeRequest.jsx) |
| SCR-REQ-03 | Room Swap – Specific Student | `/student/requests/swap/new` | 104:2080 | `POST /swaps` | [student/SwapSpecific.jsx](../../web/src/pages/student/SwapSpecific.jsx) |
| SCR-REQ-04 | Swap Board | `/student/requests/swap/board` | 104:2254 | `GET /swap-board`<br>`PUT /swap-board/my-post`<br>`POST /swap-board/posts/:id/request` | [student/SwapBoard.jsx](../../web/src/pages/student/SwapBoard.jsx) |
| SCR-REQ-05 | Swap Invitation | `/student/requests/swap/invitations/:id` | 104:2490 | `GET /swap-invitations/:id`<br>`POST /swap-invitations/:id/respond` | [student/SwapInvitation.jsx](../../web/src/pages/student/SwapInvitation.jsx) |
| MOB-NTF-01 | Notifications (phone bell) | `/student/notifications` | 58:474 | `GET /notifications` | [student/Notifications.jsx](../../web/src/pages/student/Notifications.jsx) |

## Staff — Figma page 06 Web – Staff

| Code | Screen | Route | Figma | API calls | Page |
|---|---|---|---|---|---|
| SCR-HOME-02 | Staff Dashboard | `/staff` | 34:1147 | `GET /dashboards/staff` | [staff/StaffDashboard.jsx](../../web/src/pages/staff/StaffDashboard.jsx) |
| SCR-INV-10 | Room and Bed Inventory | `/staff/inventory` | 37:2075 | `GET /inventory/structure`<br>`GET /inventory/rooms`<br>`GET /inventory/rooms/:code`<br>`POST /inventory/rooms/:code/out-of-service`<br>`POST /inventory/rooms/:code/back-in-service` | [staff/Inventory.jsx](../../web/src/pages/staff/Inventory.jsx) |
| SCR-UTL-10 | Meter Readings | `/staff/meter-readings` | 95:3302 | `GET /meter-periods`<br>`GET /meter-periods/:id/readings`<br>`GET /meter-periods/:id/readings/:room`<br>`POST /meter-periods/:id/import`<br>`POST /meter-periods/:id/close` | [staff/MeterReadings.jsx](../../web/src/pages/staff/MeterReadings.jsx) |
| SCR-MNT-10 | Maintenance Queue | `/staff/maintenance` | 42:2251 | `GET /maintenance-requests`<br>`GET /maintenance-requests/options` | [staff/MaintenanceQueue.jsx](../../web/src/pages/staff/MaintenanceQueue.jsx) |
| SCR-MNT-11 | Maintenance Detail | `/staff/maintenance/:id` | 42:2739 | `GET /maintenance-requests/:id`<br>`PATCH /maintenance-requests/:id`<br>`POST /maintenance-requests/:id/updates` | [staff/MaintenanceDetail.jsx](../../web/src/pages/staff/MaintenanceDetail.jsx) |
| SCR-MNT-12 | Inspection Checklist | `/staff/inspections` | 98:4293 | `GET /inspection-runs/current`<br>`GET /inspection-runs/:id/rooms`<br>`PUT /inspection-runs/:id/rooms/:room`<br>`POST /inspection-runs/:id/submit`<br>`GET /inspection-runs/upcoming` | [staff/InspectionChecklist.jsx](../../web/src/pages/staff/InspectionChecklist.jsx) |
| SCR-REQ-10 | Room-Change Queue | `/staff/room-changes` | 60:2696 | `GET /room-changes`<br>`GET /room-changes/:id/matching-beds`<br>`POST /room-changes/:id/decision` | [staff/RoomChangeQueue.jsx](../../web/src/pages/staff/RoomChangeQueue.jsx) |
| SCR-REQ-13 | Room Swap Requests | `/staff/room-changes/swaps` | 98:3780 | `GET /swaps`<br>`POST /swaps/:id/decision` | [staff/SwapRequests.jsx](../../web/src/pages/staff/SwapRequests.jsx) |
| SCR-REQ-11 | Check-in Desk | `/staff/check-in` | 60:3026 | `GET /check-in/today`<br>`GET /check-in/lookup`<br>`POST /check-in`<br>`POST /late-check-ins` | [staff/CheckInDesk.jsx](../../web/src/pages/staff/CheckInDesk.jsx) |
| SCR-REQ-12 | Check-out Desk | `/staff/check-out` | 95:3876 | `GET /check-out`<br>`GET /check-out/:allocationId`<br>`POST /check-out/:allocationId` | [staff/CheckOutDesk.jsx](../../web/src/pages/staff/CheckOutDesk.jsx) |

## Block Manager — Figma page 07 Web – Manager

| Code | Screen | Route | Figma | API calls | Page |
|---|---|---|---|---|---|
| SCR-HOME-03 | Manager Dashboard | `/manager` | 61:249 | `GET /dashboards/manager` | [manager/ManagerDashboard.jsx](../../web/src/pages/manager/ManagerDashboard.jsx) |
| SCR-REQ-20 | Decisions (late check-in, swaps, refunds) (`tab="late-check-in"`) | `/manager/approvals` | 99:2192 | `GET /approvals/summary`<br>`GET /late-check-ins`<br>`POST /late-check-ins/:id/decision`<br>`GET /swaps`<br>`POST /swaps/:id/decision.`<br>`GET /refunds` | [manager/Approvals.jsx](../../web/src/pages/manager/Approvals.jsx) |
| SCR-REQ-20 | Decisions (`tab="late-check-in"`) | `/manager/approvals/late-check-in` | 99:2192 | `GET /approvals/summary`<br>`GET /late-check-ins`<br>`POST /late-check-ins/:id/decision`<br>`GET /swaps`<br>`POST /swaps/:id/decision.`<br>`GET /refunds` | [manager/Approvals.jsx](../../web/src/pages/manager/Approvals.jsx) |
| SCR-APP-10 | Application Queue | `/manager/applications` | 22:2 | `GET /applications`<br>`POST /applications/bulk-review` | [staff/ApplicationQueue.jsx](../../web/src/pages/staff/ApplicationQueue.jsx) |
| SCR-APP-11 | Application Review | `/manager/applications/:id` | 22:732 | `GET /applications/:id`<br>`POST /applications/:id/review` | [staff/ApplicationReview.jsx](../../web/src/pages/staff/ApplicationReview.jsx) |
| SCR-ASG-10 | Assignment Runs | `/manager/assignment` | 35:1357 | `GET /assignment-runs`<br>`POST /assignment-runs` | [staff/AssignmentRuns.jsx](../../web/src/pages/staff/AssignmentRuns.jsx) |
| SCR-ASG-11 | Assignment Proposal Review | `/manager/assignment/:runId` | 36:1580 | `GET /assignment-runs/:runId/proposal`<br>`GET /assignment-runs/:runId/conflicts/:applicationId`<br>`POST /assignment-runs/:runId/commit` | [staff/ProposalReview.jsx](../../web/src/pages/staff/ProposalReview.jsx) |
| SCR-BIL-10 | Payments | `/manager/payments` | 23:614 | `GET /payments`<br>`POST /payments/:invoiceId/confirm` | [staff/Payments.jsx](../../web/src/pages/staff/Payments.jsx) |
| SCR-REQ-10 | Room-Change Queue | `/manager/room-changes` | 60:2696 | `GET /room-changes`<br>`GET /room-changes/:id/matching-beds`<br>`POST /room-changes/:id/decision` | [staff/RoomChangeQueue.jsx](../../web/src/pages/staff/RoomChangeQueue.jsx) |
| SCR-REQ-13 | Room Swap Requests | `/manager/room-changes/swaps` | 98:3780 | `GET /swaps`<br>`POST /swaps/:id/decision` | [staff/SwapRequests.jsx](../../web/src/pages/staff/SwapRequests.jsx) |
| SCR-INV-10 | Room and Bed Inventory | `/manager/inventory` | 37:2075 | `GET /inventory/structure`<br>`GET /inventory/rooms`<br>`GET /inventory/rooms/:code`<br>`POST /inventory/rooms/:code/out-of-service`<br>`POST /inventory/rooms/:code/back-in-service` | [staff/Inventory.jsx](../../web/src/pages/staff/Inventory.jsx) |
| SCR-MNT-10 | Maintenance Queue | `/manager/maintenance` | 42:2251 | `GET /maintenance-requests`<br>`GET /maintenance-requests/options` | [staff/MaintenanceQueue.jsx](../../web/src/pages/staff/MaintenanceQueue.jsx) |
| SCR-MNT-11 | Maintenance Detail | `/manager/maintenance/:id` | 42:2739 | `GET /maintenance-requests/:id`<br>`PATCH /maintenance-requests/:id`<br>`POST /maintenance-requests/:id/updates` | [staff/MaintenanceDetail.jsx](../../web/src/pages/staff/MaintenanceDetail.jsx) |
| SCR-MNT-20 | Inspection Schedule | `/manager/inspections` | 99:2569 | `GET /inspection-schedules`<br>`POST /inspection-schedules`<br>`PUT /inspection-schedules/:id` | [manager/InspectionSchedule.jsx](../../web/src/pages/manager/InspectionSchedule.jsx) |
| SCR-BIL-20 | Block Finance | `/manager/finance` | 61:707 | `GET /finance/summary`<br>`GET /refunds`<br>`POST /refunds/:id/decision`<br>`GET /finance/overdue`<br>`POST /finance/reminders`<br>`GET /invoices` | [manager/BlockFinance.jsx](../../web/src/pages/manager/BlockFinance.jsx) |
| SCR-AUTH-10 | Block Staff | `/manager/staff` | 69:554 | `GET /block-staff`<br>`PUT /block-staff/:id`<br>`POST /staff-account-requests` | [manager/BlockStaff.jsx](../../web/src/pages/manager/BlockStaff.jsx) |
| SCR-REQ-20 | Request Routing Rules | `/manager/routing-rules` | 69:949 | `GET /routing-rules`<br>`POST /routing-rules`<br>`PUT /routing-rules/:id`<br>`PUT /routing-rules/timers` | [manager/RoutingRules.jsx](../../web/src/pages/manager/RoutingRules.jsx) |
| SCR-REQ-21 | Escalations | `/manager/escalations` | 69:1335 | `GET /escalations`<br>`POST /escalations/:id/actions` | [manager/Escalations.jsx](../../web/src/pages/manager/Escalations.jsx) |
| SCR-RPT-10 | Block Reports | `/manager/reports` | 70:1180 | `GET /reports/block`<br>`GET /exports/block-occupancy` | [manager/BlockReports.jsx](../../web/src/pages/manager/BlockReports.jsx) |
| SCR-CFG-20 | Block Settings | `/manager/block-settings` | 70:1488 | `GET /block-settings`<br>`PUT /block-settings` | [manager/BlockSettings.jsx](../../web/src/pages/manager/BlockSettings.jsx) |

## Admin — Figma page 08 Web – Admin

| Code | Screen | Route | Figma | API calls | Page |
|---|---|---|---|---|---|
| SCR-HOME-04 | Admin Dashboard | `/admin` | 63:1768 | `GET /dashboards/admin` | [admin/AdminDashboard.jsx](../../web/src/pages/admin/AdminDashboard.jsx) |
| SCR-CFG-01 | Terms and Windows | `/admin/terms` | 24:2 | `GET /admin/terms`<br>`POST /admin/terms`<br>`PUT /admin/terms/:id`<br>`POST /admin/terms/:id/publish` | [admin/TermsWindows.jsx](../../web/src/pages/admin/TermsWindows.jsx) |
| SCR-CFG-02 | Room Types | `/admin/room-types` | 24:520 | `GET /admin/room-types`<br>`POST /admin/room-types`<br>`PUT /admin/room-types/:id` | [admin/RoomTypes.jsx](../../web/src/pages/admin/RoomTypes.jsx) |
| SCR-CFG-03 | Room Classes | `/admin/room-classes` | 25:837 | `GET /admin/room-classes`<br>`POST /admin/room-classes`<br>`PUT /admin/room-classes/:id` | [admin/RoomClasses.jsx](../../web/src/pages/admin/RoomClasses.jsx) |
| SCR-CFG-04 | Fees, Deposit and Refund Rules | `/admin/fees` | 25:1221 | `GET /admin/fees`<br>`PUT /admin/fees` | [admin/FeesRules.jsx](../../web/src/pages/admin/FeesRules.jsx) |
| SCR-CFG-20 | Utility | `/admin/utility` | 100:3830 | `GET /admin/utility`<br>`PUT /admin/utility` | [admin/UtilitySettings.jsx](../../web/src/pages/admin/UtilitySettings.jsx) |
| SCR-CFG-05 | Eligibility Rules | `/admin/eligibility` | 71:2607 | `GET /admin/eligibility`<br>`PUT /admin/eligibility` | [admin/EligibilityRules.jsx](../../web/src/pages/admin/EligibilityRules.jsx) |
| SCR-CFG-06 | Matching Criteria | `/admin/matching` | 38:1552 | `GET /admin/matching`<br>`PUT /admin/matching`<br>`POST /admin/matching/preview` | [admin/MatchingCriteria.jsx](../../web/src/pages/admin/MatchingCriteria.jsx) |
| SCR-CFG-21 | Inspection Checklists | `/admin/inspection-checklists` | 100:4252 | `GET /inspection-checklists`<br>`POST /inspection-checklists`<br>`POST /inspection-checklists/:id/publish`<br>`POST /inspection-checklists/:id/archive` | [admin/InspectionChecklists.jsx](../../web/src/pages/admin/InspectionChecklists.jsx) |
| SCR-CFG-07 | Notification Templates | `/admin/notifications` | 71:2940 | `GET /admin/notification-templates`<br>`PUT /admin/notification-templates/:key`<br>`POST /admin/notification-templates/:key/test` | [admin/NotificationTemplates.jsx](../../web/src/pages/admin/NotificationTemplates.jsx) |
| SCR-NTF-21 | Send Email | `/admin/notifications/send` | 100:4658 | `GET /admin/emails/options`<br>`POST /admin/emails/preview`<br>`POST /admin/emails` | [admin/SendEmail.jsx](../../web/src/pages/admin/SendEmail.jsx) |
| SCR-CFG-08 | System Parameters | `/admin/system-parameters` | 71:3286 | `GET /admin/system-parameters`<br>`PUT /admin/system-parameters` | [admin/SystemParameters.jsx](../../web/src/pages/admin/SystemParameters.jsx) |
| SCR-INV-01 | Buildings and Structure | `/admin/buildings` | 25:1593 | `GET /admin/buildings`<br>`POST /admin/buildings`<br>`PUT /admin/buildings/:id`<br>`POST /admin/buildings/:id/rooms/bulk`<br>`GET /admin/buildings/:id/floors/:floor/rooms` | [admin/Buildings.jsx](../../web/src/pages/admin/Buildings.jsx) |
| SCR-AUTH-11 | Users and Roles | `/admin/users` | 63:2150 | `GET /admin/users`<br>`POST /admin/users`<br>`PUT /admin/users/:id`<br>`GET /admin/permissions` | [admin/UsersRoles.jsx](../../web/src/pages/admin/UsersRoles.jsx) |
| SCR-RPT-01 | Occupancy Report | `/admin/reports/occupancy` | 72:2988 | `GET /reports/occupancy`<br>`GET /exports/occupancy` | [admin/OccupancyReport.jsx](../../web/src/pages/admin/OccupancyReport.jsx) |
| SCR-RPT-02 | Financial Report | `/admin/reports/financial` | 72:3428 | `GET /reports/financial`<br>`GET /exports/financial` | [admin/FinancialReport.jsx](../../web/src/pages/admin/FinancialReport.jsx) |
| SCR-AUTH-12 | Audit Log | `/admin/audit-log` | 72:3772 | `GET /admin/audit-log`<br>`GET /exports/audit-log` | [admin/AuditLog.jsx](../../web/src/pages/admin/AuditLog.jsx) |

## Notes

- Detail pages (`…/:id`) open from their lists and are not in the development screen index (`Alt + D`).
- The Block Manager shares the Staff work queues (Applications, Inventory, Maintenance) for its Block; the same page then shows the Manager's scope.
- The back office is desktop-only (checked at 1440×900 and 1366×768); the Student portal also has a phone and tablet layout below 1024 px (`web/README.md`).
- The wizard steps share SCR-APP-01; the Manager's copies of Staff pages keep the Staff code.
- **Screen codes used by two different screens** (from the Figma frame names; settle against Figma before quoting them in a report): SCR-REQ-20 → `/manager/approvals`, `/manager/approvals/late-check-in`, `/manager/routing-rules`; SCR-CFG-20 → `/manager/block-settings`, `/admin/utility`.
