**Public pages** (5 pages)

| # | Screen | Route | Page title | Feature | Fields | Transactions |
|---|---|---|---|---|---|---|
| 1 | Sign In | `/signin` |  | Accounts | 1 | 0 |
| 2 | Forgot Password | `/forgot-password` |  | Accounts | 0 | 1 |
| 3 | Reset Password | `/reset-password` |  | Accounts | 0 | 1 |
| 4 | Reset Password | `/set-password` |  | Accounts | 0 | 1 |
| 5 | First Password | `/account/password` |  | Accounts | 0 | 1 |

**Student portal** (26 pages)

| # | Screen | Route | Page title | Feature | Fields | Transactions |
|---|---|---|---|---|---|---|
| 1 | Student Home | `/student` |  | Reports and dashboards | 0 | 0 |
| 2 | Apply Term | `/student/apply/term` |  | Applications | 0 | 0 |
| 3 | Apply Room | `/student/apply/room` |  | Assignment and residence | 1 | 0 |
| 4 | Apply Roommate | `/student/apply/roommate` |  | Applications | 8 | 1 |
| 5 | Apply Personal | `/student/apply/personal` |  | Applications | 2 | 0 |
| 6 | Apply Review | `/student/apply/review` |  | Applications | 1 | 1 |
| 7 | My Applications | `/student/applications` |  | Applications | 0 | 0 |
| 8 | Application Detail | `/student/applications/:id` |  | Applications | 1 | 2 |
| 9 | Roommate Invitation | `/student/roommate-invitation` |  | Applications | 3 | 1 |
| 10 | Round2 Offer | `/student/round-2-offer` |  | Assignment and residence | 1 | 1 |
| 11 | My Invoices | `/student/invoices` |  | Billing | 0 | 0 |
| 12 | Invoice Detail | `/student/invoices/:id` |  | Billing | 0 | 1 |
| 13 | Invoice Payment | `/student/invoices/:id/pay` |  | Billing | 2 | 2 |
| 14 | My Room | `/student/room` |  | Assignment and residence | 0 | 0 |
| 15 | Check In Inventory | `/student/room/inventory` |  | Assignment and residence | 9 | 9 |
| 16 | My Requests | `/student/requests` |  | Requests and Term transition | 0 | 1 |
| 17 | New Maintenance Request | `/student/requests/maintenance/new` |  | Requests and Term transition | 12 | 1 |
| 18 | New Room Change Request | `/student/requests/room-change/new` |  | Requests and Term transition | 9 | 1 |
| 19 | Swap Specific | `/student/requests/swap/new` |  | Requests and Term transition | 4 | 1 |
| 20 | Swap Board | `/student/requests/swap/board` |  | Requests and Term transition | 6 | 2 |
| 21 | Swap Invitation | `/student/requests/swap/invitations/:id` |  | Requests and Term transition | 0 | 1 |
| 22 | Notifications | `/student/notifications` |  | Notifications | 0 | 2 |
| 23 | Verification | `/student/verification` |  | Accounts | 13 | 1 |
| 24 | Registration Period | `/student/registration-periods/:termId` |  | Terms and settings | 0 | 0 |
| 25 | My Family Days | `/student/family-days` |  | Family Day | 0 | 0 |
| 26 | My Family Day | `/student/family-days/:id` |  | Family Day | 0 | 0 |

**Staff portal** (26 pages)

| # | Screen | Route | Page title | Feature | Fields | Transactions |
|---|---|---|---|---|---|---|
| 1 | Staff Dashboard | `/staff` |  | Reports and dashboards | 0 | 1 |
| 2 | My Schedule | `/staff/schedule` | My schedule | Accounts | 0 | 0 |
| 3 | Inventory | `/staff/inventory` | Rooms and beds | Inventory | 4 | 3 |
| 4 | Room Hub | `/staff/rooms/:code` |  | Inventory | 0 | 0 |
| 5 | Door Codes | `/staff/door-codes` | Door codes | Inventory | 3 | 6 |
| 6 | Furniture | `/staff/furniture` | Furniture | Inventory | 23 | 5 |
| 7 | Meter Readings | `/staff/meter-readings` | Meter readings | Billing | 9 | 5 |
| 8 | Maintenance Queue | `/staff/maintenance` | Maintenance | Maintenance and inspections | 4 | 1 |
| 9 | Maintenance Detail | `/staff/maintenance/:id` |  | Maintenance and inspections | 7 | 5 |
| 10 | Inspection Checklist | `/staff/inspections` | Inspections | Maintenance and inspections | 9 | 4 |
| 11 | Room Change Queue | `/staff/room-changes` | Next-term room changes | Requests and Term transition | 5 | 3 |
| 12 | Swap Requests | `/staff/room-changes/swaps` | Next-term swaps | Requests and Term transition | 3 | 1 |
| 13 | Term Transition | `/staff/next-term` |  | Requests and Term transition | 1 | 0 |
| 14 | Term Transition | `/staff/next-term/:tab` |  | Requests and Term transition | 1 | 0 |
| 15 | Operational Moves | `/staff/moves` | Operational moves | Assignment and residence | 9 | 1 |
| 16 | Check In Desk | `/staff/check-in` | Check-in desk | Assignment and residence | 3 | 2 |
| 17 | Handover Review | `/staff/check-in/inventories` | Check-in inventories | Assignment and residence | 10 | 5 |
| 18 | Check Out Desk | `/staff/check-out` | Check-out desk | Assignment and residence | 8 | 5 |
| 19 | Students | `/staff/students` | Students | Accounts | 6 | 0 |
| 20 | Student Hub | `/staff/students/:id` |  | Accounts | 24 | 4 |
| 21 | Family Days | `/staff/family-days` | Family Days | Family Day | 1 | 1 |
| 22 | Family Day Detail | `/staff/family-days/:id` |  | Family Day | 3 | 5 |
| 23 | Visitor Desk | `/staff/family-days/:id/desk` |  | Family Day | 6 | 4 |
| 24 | Family Day Stats | `/staff/family-day-stats` | Family Day statistics | Family Day | 0 | 0 |
| 25 | Family Day Stats Detail | `/staff/family-day-stats/:id` |  | Family Day | 0 | 0 |
| 26 | Announcements | `/staff/announcements` | Announcements | Notifications | 14 | 2 |

**Manager portal** (47 pages)

| # | Screen | Route | Page title | Feature | Fields | Transactions |
|---|---|---|---|---|---|---|
| 1 | Manager Dashboard | `/manager` |  | Reports and dashboards | 0 | 0 |
| 2 | Check Out Reviews | `/manager/approvals/check-out-charges` | Check-out charges | Assignment and residence | 1 | 1 |
| 3 | Application Queue | `/manager/applications` | Applications | Applications | 6 | 2 |
| 4 | Application Review | `/manager/applications/:id` |  | Applications | 0 | 1 |
| 5 | Assignment Runs | `/manager/assignment` | Assignment | Assignment and residence | 0 | 2 |
| 6 | Proposal Review | `/manager/assignment/:runId` |  | Assignment and residence | 3 | 3 |
| 7 | Payments | `/manager/payments` | Payments | Billing | 7 | 2 |
| 8 | Payment Claims | `/manager/payment-claims` | Payment confirmations | Billing | 6 | 3 |
| 9 | Terminations | `/manager/terminations` | Terminations | Assignment and residence | 7 | 2 |
| 10 | Family Days | `/manager/family-days` | Family Days | Family Day | 1 | 1 |
| 11 | Family Day Detail | `/manager/family-days/:id` |  | Family Day | 3 | 5 |
| 12 | Visitor Desk | `/manager/family-days/:id/desk` |  | Family Day | 6 | 4 |
| 13 | Family Day Stats | `/manager/family-day-stats` | Family Day statistics | Family Day | 0 | 0 |
| 14 | Family Day Stats Detail | `/manager/family-day-stats/:id` |  | Family Day | 0 | 0 |
| 15 | Room Change Queue | `/manager/room-changes` | Next-term room changes | Requests and Term transition | 5 | 3 |
| 16 | Swap Requests | `/manager/room-changes/swaps` | Next-term swaps | Requests and Term transition | 3 | 1 |
| 17 | Term Transition | `/manager/next-term` |  | Requests and Term transition | 1 | 0 |
| 18 | Term Transition | `/manager/next-term/:tab` |  | Requests and Term transition | 1 | 0 |
| 19 | Operational Moves | `/manager/moves` | Operational moves | Assignment and residence | 9 | 1 |
| 20 | Reconciliation | `/manager/reconciliation` | Reconciliation | Assignment and residence | 4 | 3 |
| 21 | Inventory | `/manager/inventory` | Rooms and beds | Inventory | 4 | 3 |
| 22 | Room Hub | `/manager/rooms/:code` |  | Inventory | 0 | 0 |
| 23 | Room Classes By Term | `/manager/room-classes` | Room tiers by term | Assignment and residence | 8 | 1 |
| 24 | Door Codes | `/manager/door-codes` | Door codes | Inventory | 3 | 6 |
| 25 | Furniture | `/manager/furniture` | Furniture | Inventory | 23 | 5 |
| 26 | Maintenance Queue | `/manager/maintenance` | Maintenance | Maintenance and inspections | 4 | 1 |
| 27 | Maintenance Detail | `/manager/maintenance/:id` |  | Maintenance and inspections | 7 | 5 |
| 28 | Inspection Schedule | `/manager/inspections` |  | Maintenance and inspections | 15 | 4 |
| 29 | Handover Review | `/manager/check-in/inventories` | Check-in inventories | Assignment and residence | 10 | 5 |
| 30 | Block Finance | `/manager/finance` |  | Billing | 4 | 5 |
| 31 | Block Staff | `/manager/staff` |  | Accounts | 10 | 3 |
| 32 | Routing Rules | `/manager/routing-rules` |  | Maintenance and inspections | 11 | 3 |
| 33 | Escalations | `/manager/escalations` |  | Maintenance and inspections | 2 | 1 |
| 34 | Block Reports | `/manager/reports` |  | Reports and dashboards | 0 | 1 |
| 35 | Occupancy Report | `/manager/reports/occupancy` | Occupancy report | Reports and dashboards | 0 | 1 |
| 36 | Financial Report | `/manager/reports/financial` | Financial report | Reports and dashboards | 0 | 1 |
| 37 | Block Settings | `/manager/block-settings` |  | Terms and settings | 7 | 1 |
| 38 | Students | `/manager/students` | Students | Accounts | 6 | 0 |
| 39 | Student Hub | `/manager/students/:id` |  | Accounts | 24 | 4 |
| 40 | Student Import | `/manager/student-import` |  | Accounts | 2 | 3 |
| 41 | Staff Accounts | `/manager/staff-accounts` | Staff accounts | Accounts | 11 | 2 |
| 42 | Staff Activity | `/manager/staff-activity` | Staff activity | Accounts | 6 | 0 |
| 43 | Staff Schedule | `/manager/staff-schedule` | Work schedule | Accounts | 2 | 4 |
| 44 | Term Requests | `/manager/term-requests` | Registration-period requests | Terms and settings | 26 | 5 |
| 45 | Term Dashboard | `/manager/terms` |  | Terms and settings | 1 | 0 |
| 46 | Term Dashboard | `/manager/terms/:id` |  | Terms and settings | 1 | 0 |
| 47 | Announcements | `/manager/announcements` | Announcements | Notifications | 14 | 2 |

**Admin portal** (27 pages)

| # | Screen | Route | Page title | Feature | Fields | Transactions |
|---|---|---|---|---|---|---|
| 1 | Admin Dashboard | `/admin` | System overview | Reports and dashboards | 0 | 0 |
| 2 | Terms | `/admin/terms` | Terms | Terms and settings | 0 | 0 |
| 3 | New Term | `/admin/terms/new` | New term | Terms and settings | 4 | 1 |
| 4 | Term Wizard | `/admin/terms/:id` |  | Terms and settings | 16 | 2 |
| 5 | Term Requests | `/admin/term-requests` | Registration-period requests | Terms and settings | 26 | 5 |
| 6 | Deadlines | `/admin/deadlines` |  | Terms and settings | 0 | 0 |
| 7 | Refunds Terminations | `/admin/refunds` |  | Billing | 6 | 0 |
| 8 | Stay Renewal | `/admin/stay` |  | Requests and Term transition | 0 | 0 |
| 9 | Announcements | `/admin/announcements` | Announcements | Notifications | 14 | 2 |
| 10 | Room Types | `/admin/room-types` | Room types | Assignment and residence | 10 | 1 |
| 11 | Room Classes | `/admin/room-classes` | Room tiers | Assignment and residence | 10 | 2 |
| 12 | Fees Rules | `/admin/fees` |  | Terms and settings | 2 | 0 |
| 13 | Utility Settings | `/admin/utility` |  | Billing | 5 | 0 |
| 14 | Eligibility Rules | `/admin/eligibility` |  | Terms and settings | 4 | 0 |
| 15 | Matching Criteria | `/admin/matching` |  | Terms and settings | 2 | 1 |
| 16 | Inspection Checklists | `/admin/inspection-checklists` | Inspection checklists | Maintenance and inspections | 10 | 6 |
| 17 | Notification Templates | `/admin/notifications` | Notification Templates | Notifications | 8 | 2 |
| 18 | Send Email | `/admin/notifications/send` |  | Notifications | 18 | 1 |
| 19 | System Parameters | `/admin/system-parameters` |  | Terms and settings | 4 | 0 |
| 20 | Demo Data | `/admin/demo` | Demo data | Terms and settings | 2 | 2 |
| 21 | Buildings | `/admin/buildings` | Buildings | Inventory | 12 | 2 |
| 22 | Furniture Types | `/admin/furniture-types` | Furniture types | Inventory | 17 | 2 |
| 23 | Users Roles | `/admin/users` | Users and Roles | Accounts | 15 | 1 |
| 24 | Audit Log | `/admin/audit-log` | Audit log | Accounts | 4 | 1 |
| 25 | Students | `/admin/students` | Students | Accounts | 6 | 0 |
| 26 | Student Hub | `/admin/students/:id` |  | Accounts | 24 | 4 |
| 27 | Student Import | `/admin/student-import` |  | Accounts | 2 | 3 |

**Student mobile app** (30 screens)

| # | Screen | File |
|---|---|---|
| 1 | Verification | `screens/account.dart` |
| 2 | Change Password | `screens/account.dart` |
| 3 | Account | `screens/account.dart` |
| 4 | Applications Page | `screens/activity.dart` |
| 5 | Requests Page | `screens/activity.dart` |
| 6 | Payments Page | `screens/activity.dart` |
| 7 | Application | `screens/applications.dart` |
| 8 | Roommate Invitation | `screens/applications.dart` |
| 9 | Round2 Offer | `screens/applications.dart` |
| 10 | Apply | `screens/apply.dart` |
| 11 | Assistant | `screens/assistant.dart` |
| 12 | Family Days | `screens/family_day.dart` |
| 13 | Family Day | `screens/family_day.dart` |
| 14 | Handover | `screens/handover.dart` |
| 15 | Home | `screens/home.dart` |
| 16 | Board | `screens/home.dart` |
| 17 | Notifications | `screens/notifications.dart` |
| 18 | Payments | `screens/payments.dart` |
| 19 | Refunds | `screens/payments.dart` |
| 20 | Invoice Detail | `screens/payments.dart` |
| 21 | Invoice | `screens/payments.dart` |
| 22 | Registration Period | `screens/registration.dart` |
| 23 | Maintenance | `screens/requests.dart` |
| 24 | New Maintenance | `screens/requests.dart` |
| 25 | New Room Change | `screens/requests.dart` |
| 26 | Swap | `screens/requests.dart` |
| 27 | Swap Invitation | `screens/requests.dart` |
| 28 | Room | `screens/room.dart` |
| 29 | Sign In | `screens/sign_in.dart` |
| 30 | Set Password | `screens/sign_in.dart` |
