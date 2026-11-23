**Refund rules** (setting table cfg_refund_rule: the percentage of the money paid that is refunded, and who approves)

| Trigger | Rule | Refund | Approver |
|---|---|---|---|
| CANCEL_BEFORE_RESULTS | Application cancelled before results are published | 100 % | SYSTEM |
| CANCEL_AFTER_RESULTS | Application cancelled after results, before Check-in | 50 % | MANAGER |
| EARLY_CHECK_OUT | Check-out before the end of the Term (unused days) | 30 % | MANAGER |
| UTILITY_DEPOSIT | Utility Deposit at Check-out, minus unpaid Utility and damage | 100 % | STAFF |
| BALANCE_NOT_PAID | Balance not paid by its deadline (the Deposit is kept) | 0 % | SYSTEM |
| NOT_ENROLLED | Stay ended because the student is no longer enrolled (unused room fee) | 30 % | MANAGER |
| TERMINATION | Stay terminated for Utility debt or by a Manager (unused room fee) | 0 % | SYSTEM |
| APPLICATION_REJECTED | Application not approved by the dormitory office (the whole Deposit) | 100 % | SYSTEM |

**Settings** (cfg_parameter, 55 values the Administrator changes; the value shown is the base value)

| Setting | Section | Meaning | Type | Base value |
|---|---|---|---|---|
| `application.cancel_until` | Applications | Students may cancel until | CHOICE | RESULTS_PUBLISHED |
| `application.roommate_check_attempts` | Applications | Roommate code checks per Term | INT | 5 |
| `round2.offer_hours` | Assignment | Round-2 offer valid for (hours) | INT | 48 |
| `audit.retention_months` | Audit | Audit Log retention (months) | INT | 24 |
| `block.quiet_from_latest` | Blocks | Quiet hours start by (latest) | CHOICE | 23:30 |
| `block.visit_from_earliest` | Blocks | Visitors may come from (earliest) | CHOICE | 07:00 |
| `block.visit_until_latest` | Blocks | Visitors must leave by (latest) | CHOICE | 22:00 |
| `family_day.adult_age` | Deadlines and reminders | Age from which a Family Day guest counts as an adult | INT | 18 |
| `family_day.early_minutes` | Deadlines and reminders | Minutes before a Family Day time slot when guests may be checked in | INT | 15 |
| `payment.rejected_claim_min_hours` | Deadlines and reminders | Time left after a rejected payment claim, at least (hours) | INT | 12 |
| `payment.rejections_to_cancel` | Deadlines and reminders | Rejected claims that cancel the Invoice | INT | 2 |
| `payment.reminder_first_days` | Deadlines and reminders | First payment reminder (days before the deadline) | INT | 3 |
| `payment.reminder_second_days` | Deadlines and reminders | Second payment reminder (days before the deadline) | INT | 1 |
| `utility.close_before_month_end` | Deadlines and reminders | Allow closing a meter period before its month ends | BOOL | false |
| `utility.close_days` | Deadlines and reminders | Days after a month ends to close its meter period | INT | 3 |
| `inventory.max_floor` | Inventory | Highest Floor for bulk Room generation | INT | 10 |
| `maintenance.sla_target_percent` | Maintenance | SLA target (%) | INT | 90 |
| `payment.qr_minutes` | Payments | VietQR code valid for (minutes) | INT | 15 |
| `pricing.rounding_vnd` | Pricing | Round term prices to (VND) | INT | 1000 |
| `late_check_in.max_days` | Refunds, penalties and terminations | Longest late check-in after the check-in end (days) | INT | 14 |
| `termination.days_after_final_warning` | Refunds, penalties and terminations | Days between the final warning and the termination | INT | 3 |
| `termination.debt_reaches_deposit` | Refunds, penalties and terminations | End a stay when the Utility debt reaches the Utility Deposit | BOOL | true |
| `termination.move_out_days` | Refunds, penalties and terminations | Days to move out after a termination notice | INT | 3 |
| `termination.overdue_months` | Refunds, penalties and terminations | Overdue Utility months that end a stay | INT | 2 |
| `sla.normal_max_hours` | Requests | Longest escalation timer for normal requests (hours) | INT | 72 |
| `sla.room_change_max_hours` | Requests | Longest decision time for Room-Change Requests (hours) | INT | 96 |
| `sla.unassigned_max_hours` | Requests | Escalate a Maintenance Request still unassigned after (hours) | INT | 1 |
| `sla.urgent_max_hours` | Requests | Longest escalation timer for urgent requests (hours) | INT | 8 |
| `swap.invitation_hours` | Requests | Swap invitation valid for (hours) | INT | 48 |
| `swap.post_days` | Requests | Swap board post valid for (days) | INT | 14 |
| `handover.acknowledge_hours` | Room handover | Hours a student has to acknowledge damage to a shared item | INT | 48 |
| `handover.electricity_per_person_hour` | Room handover | Electricity use accepted per resident and hour (kWh) | DECIMAL | 0.25 |
| `handover.electricity_tolerance` | Room handover | Electricity difference always accepted (kWh) | DECIMAL | 2 |
| `handover.major_mismatches` | Room handover | Items that differ from the record before the inventory needs a visit | INT | 3 |
| `handover.max_photos` | Room handover | Photos per item or meter, at most | INT | 3 |
| `handover.photos_required` | Room handover | Photos are required for Damaged and Missing items and the meters | BOOL | false |
| `handover.required` | Room handover | New residents file a check-in inventory before they receive the door code | BOOL | true |
| `handover.submit_hours` | Room handover | Hours to file the check-in inventory after receiving the door code | INT | 48 |
| `handover.visit_from_hour` | Room handover | Room visits start at (hour, 1–24) | INT | 8 |
| `handover.visit_to_hour` | Room handover | Room visits end at (hour, 1–24) | INT | 17 |
| `handover.visit_within_days` | Room handover | A Room visit is set within (days) | INT | 3 |
| `handover.water_per_person_hour` | Room handover | Water use accepted per resident and hour (m³) | DECIMAL | 0.01 |
| `handover.water_tolerance` | Room handover | Water difference always accepted (m³) | DECIMAL | 0.2 |
| `workload.duty_idle_minutes` | Staff | Minutes without using the app before a staff member goes off duty | INT | 30 |
| `workload.max_open_per_staff` | Staff | Open items a staff member may hold before they show as overloaded | INT | 8 |
| `workload.schedule_reminder_day` | Staff | Day Managers are reminded to send next week's schedule | CHOICE | 7 |
| `workload.schedule_reminder_hour` | Staff | Hour Managers are reminded to send next week's schedule | CHOICE | 9 |
| `student.emergency_contacts_max` | Stay | Emergency contacts a student may keep | INT | 3 |
| `stay.auto_extension` | Stay and renewal | Approve extension requests of eligible students automatically | BOOL | true |
| `stay.escalate_before_hours` | Stay and renewal | Alert Managers about undecided requests before the decision deadline (hours) | INT | 48 |
| `stay.max_terms` | Stay and renewal | Most Terms a student may commit to (stay length) | INT | 9 |
| `stay.program_semesters` | Stay and renewal | Semesters of a study programme (the stay length stops at the last one) | INT | 9 |
| `stay.reserved_new_percent` | Stay and renewal | Share of Beds kept for new students in new Terms (%) | INT | 0 |
| `upload.max_photo_mb` | Uploads | Max photo size (MB) | INT | 5 |
| `upload.max_photos` | Uploads | Max photos per Maintenance Request | INT | 5 |
