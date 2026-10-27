### 2.2 Accounts and access (AUTH)

![Logical ERD: Accounts and access (AUTH)](../../diagrams/out/erd-auth.png)

| No | Table | Description | Keys |
|---|---|---|---|
| 01 | auth_action_token | One-time tokens (hashed) for password reset and account invitation links. | PK: id<br>FK: user_id → auth_user |
| 02 | auth_reconciliation | An enrollment reconciliation run of a Term: the uploaded enrolled list or leavers list. | PK: id<br>FK: term_id → cfg_term<br>created_by → auth_user |
| 03 | auth_reconciliation_item | One difference found by a reconciliation (groups 1-4) with its resolution and note. | PK: id<br>FK: reconciliation_id → auth_reconciliation<br>student_id → auth_user<br>resolved_by → auth_user |
| 04 | auth_session | Sign-in sessions (hashed bearer token, method, expiry, revocation). | PK: id<br>FK: user_id → auth_user |
| 05 | auth_staff_account_request | A Manager's request to create a Staff account for a Block. | PK: id<br>FK: building_id → inv_building<br>requested_by → auth_user<br>decided_by → auth_user |
| 06 | auth_staff_profile | Staff handles (request types they take) and on-duty flag, used by routing and workload. | PK: user_id<br>FK: user_id → auth_user |
| 07 | auth_student | Student directory record: student code, gender, major, cohort, region, enrollment status, priority groups, contact and verification state. | PK: user_id<br>FK: user_id → auth_user<br>verified_by → auth_user |
| 08 | auth_student_import | A student list import (CSV or XLSX): preview counts and the applied result. | PK: id<br>FK: uploaded_by → auth_user<br>applied_by → auth_user |
| 09 | auth_student_import_row | One line of a student list import with its outcome (new, updated, unchanged, error). | PK: id<br>FK: import_id → auth_student_import<br>user_id → auth_user |
| 10 | auth_user | Every account (student, Staff, Manager, Admin): email, password hash or Google subject, role, status, lock, locale, demo flag. | PK: id |
| 11 | auth_user_block | Blocks a Staff account works for (Block scope). | PK: user_id, building_id<br>FK: user_id → auth_user<br>building_id → inv_building |

### 2.3 Settings and Terms (CFG)

![Logical ERD: Settings and Terms (CFG)](../../diagrams/out/erd-cfg.png)

| No | Table | Description | Keys |
|---|---|---|---|
| 01 | cfg_block_settings | Per-Block desk hours, visiting hours, quiet hours and house rules (within the Admin limits). | PK: building_id<br>FK: building_id → inv_building<br>edited_by → auth_user |
| 02 | cfg_eligibility_criterion | Eligibility checks the Admin switches on or off (e.g. enrolled, verified, no debt). | PK: key |
| 03 | cfg_fee_policy | Default Deposit percentage, Deposit window and Balance days for new Terms. | PK: id<br>FK: updated_by → auth_user |
| 04 | cfg_lookup | Option lists (majors, regions, out-of-service reasons, request categories...). | PK: list_key, code |
| 05 | cfg_matching_snapshot | Versioned roommate-matching settings (hard constraints, criteria order, weights) used by assignment runs. | PK: id<br>FK: created_by → auth_user |
| 06 | cfg_parameter | System parameters (limits, windows, timers) grouped by settings page. | PK: key<br>FK: updated_by → auth_user |
| 07 | cfg_priority_group | Priority groups (first year, far from campus, scholarship, policy beneficiary) and whether they apply. | PK: id |
| 08 | cfg_refund_rule | Refund rules per trigger: percentage and approver role. | PK: id |
| 09 | cfg_room_class | Room Classes (Basic, Standard, Premium): surcharge rate and amenities. | PK: id |
| 10 | cfg_room_type | Room Types (2, 4, 6, 8 Beds): base price per Bed and roommate selection rule. | PK: id |
| 11 | cfg_term | A Term (FA26, SP27...): stay dates, registration milestones, renewal milestones M1-M7, Deposit and Utility Deposit fixed at publication, rules. | PK: id<br>FK: matching_snapshot_id → cfg_matching_snapshot |
| 12 | cfg_term_block | Blocks a Term uses. | PK: term_id, building_id<br>FK: term_id → cfg_term<br>building_id → inv_building |
| 13 | cfg_term_price | The Term's price per Bed for each Room Type and Room Class, fixed when the Term is published. | PK: term_id, room_type_id, room_class_id<br>FK: term_id → cfg_term<br>room_type_id → cfg_room_type<br>room_class_id → cfg_room_class |
| 14 | cfg_term_request | A Manager's registration-period request to the Admin (dates, Blocks, Rooms left out, places, prices); status Submitted to Done. | PK: id<br>FK: requested_by → auth_user<br>term_id → cfg_term |
| 15 | cfg_term_request_event | History and comments of a registration-period request. | PK: id<br>FK: request_id → cfg_term_request<br>actor_id → auth_user |
| 16 | cfg_term_room_excluded | Rooms a Term leaves out of the assignment and Round 2. | PK: term_id, room_id<br>FK: term_id → cfg_term<br>room_id → inv_room |
| 17 | cfg_utility_policy | Utility prices per kWh and m3, reading day, payment days, rounding, reminders and the Utility Deposit estimate. | PK: id<br>FK: updated_by → auth_user |

### 2.4 Inventory: Blocks, Rooms, Beds, furniture, door codes (INV)

![Logical ERD: Inventory: Blocks, Rooms, Beds, furniture, door codes (INV)](../../diagrams/out/erd-inv.png)

| No | Table | Description | Keys |
|---|---|---|---|
| 01 | inv_bed | A Bed of a Room (label A, B...), in service or not. | PK: id<br>FK: room_id → inv_room |
| 02 | inv_building | A Block (Building): code, name, gender, status. | PK: id |
| 03 | inv_door_code | Door codes of a Room, stored encrypted: proposed, active (confirmed on the lock) or retired. | PK: id<br>FK: room_id → inv_room<br>proposed_by → auth_user<br>confirmed_by → auth_user |
| 04 | inv_door_code_task | A door code to change after someone left the Room. | PK: id<br>FK: room_id → inv_room<br>door_code_id → inv_door_code |
| 05 | inv_floor | A Floor of a Block with the Room Class new Rooms start with. | PK: id<br>FK: building_id → inv_building<br>room_class_id → cfg_room_class |
| 06 | inv_floor_layout | How many Rooms of each Room Type a Floor has (used to generate Rooms). | PK: floor_id, room_type_id<br>FK: floor_id → inv_floor<br>room_type_id → cfg_room_type |
| 07 | inv_furniture_event | History of a furniture item (status changes, repairs, damage, moves). | PK: id<br>FK: item_id → inv_furniture_item<br>by_user → auth_user |
| 08 | inv_furniture_item | A furniture item with its asset code, type, status and place (a Room or a Block store). | PK: id<br>FK: furniture_type_id → inv_furniture_type<br>room_id → inv_room<br>store_building_id → inv_building |
| 09 | inv_furniture_move | A move of a furniture item between Rooms and stores. | PK: id<br>FK: item_id → inv_furniture_item<br>from_room_id → inv_room<br>from_store_building_id → inv_building<br>to_room_id → inv_room<br>to_store_building_id → inv_building<br>created_by → auth_user<br>closed_by → auth_user |
| 10 | inv_furniture_type | Furniture types (bed, wardrobe, desk, air conditioner, fridge...) and whether they define a Room Class. | PK: id |
| 11 | inv_room | A Room: code, Block, Floor, Room Type, the Room Class it was built with, out-of-service state. | PK: id<br>FK: building_id → inv_building<br>floor_id → inv_floor<br>room_type_id → cfg_room_type<br>oos_by → auth_user<br>room_class_id → cfg_room_class |
| 12 | inv_room_class_requirement | Furniture a Room Class requires (type and quantity). | PK: room_class_id, furniture_type_id<br>FK: furniture_type_id → inv_furniture_type<br>room_class_id → cfg_room_class |
| 13 | inv_room_class_term | A Room's Room Class from a given Term on. | PK: room_id, term_id<br>FK: room_id → inv_room<br>term_id → cfg_term<br>room_class_id → cfg_room_class<br>set_by → auth_user |

### 2.5 Applications (APP)

![Logical ERD: Applications (APP)](../../diagrams/out/erd-app.png)

| No | Table | Description | Keys |
|---|---|---|---|
| 01 | app_application | A student's Application for one Term: chosen Room Type and Room Class, price and Deposit fixed at submission, roommate mode, Gia hạn (stay_terms), status from Awaiting Deposit to Allocated, Forfeited, Rejected, Expired or Cancelled. | PK: id<br>FK: term_id → cfg_term<br>student_id → auth_user<br>room_type_id → cfg_room_type<br>room_class_id → cfg_room_class<br>partner_application_id → app_application<br>reviewed_by → auth_user |
| 02 | app_application_event | History of an Application (status changes and notes) shown on the student's Application page. | PK: id<br>FK: application_id → app_application<br>actor_id → auth_user |
| 03 | app_roommate_check | Rate limit for roommate code checks (privacy: the same answer for every unusable code, limited attempts). | PK: id<br>FK: term_id → cfg_term<br>student_id → auth_user |
| 04 | app_roommate_invitation | Invitation of a 2-bed roommate by student code: pending, accepted, declined or expired within roommate_hours. | PK: id<br>FK: term_id → cfg_term<br>inviter_application_id → app_application<br>invitee_student_id → auth_user<br>invitee_application_id → app_application |
| 05 | app_round2_offer | Round-2 offer to a Waitlisted Application: up to three held Beds, accepted or declined before it expires. | PK: id<br>FK: application_id → app_application |
| 06 | app_round2_option | One held Bed (Room Type, Room Class, Block, price difference) of a Round-2 offer. | PK: id<br>FK: offer_id → app_round2_offer<br>room_type_id → cfg_room_type<br>room_class_id → cfg_room_class<br>building_id → inv_building<br>bed_id → inv_bed |

### 2.6 Assignment and residence (ASG)

![Logical ERD: Assignment and residence (ASG)](../../diagrams/out/erd-asg.png)

| No | Table | Description | Keys |
|---|---|---|---|
| 01 | asg_allocation | A student's Bed in a Term: from the assignment, a Round-2 offer, a renewal (next-Term Allocation) or a move. Status Active, Ended or Cancelled; resident_at and code_released_at mark residence; renewal = Awaiting extension or Continuing. | PK: id<br>FK: term_id → cfg_term<br>application_id → app_application<br>student_id → auth_user<br>bed_id → inv_bed<br>run_id → asg_run<br>previous_allocation_id → asg_allocation<br>allocated_by → auth_user<br>checked_in_by → auth_user<br>stay_id → asg_stay |
| 02 | asg_check_out | Check-out at the desk: meter readings, key, condition, damage charge, Utility Deposit settlement and refund. | PK: id<br>FK: allocation_id → asg_allocation<br>completed_by → auth_user<br>draft_by → auth_user |
| 03 | asg_check_out_damage | Damage recorded per furniture item at a check-out (amount and note). | PK: check_out_id, furniture_item_id<br>FK: check_out_id → asg_check_out<br>furniture_item_id → inv_furniture_item |
| 04 | asg_late_check_in | Late check-in asked online or recorded at the desk: requested date, evidence, decision and the new Balance deadline. | PK: id<br>FK: allocation_id → asg_allocation<br>received_by → auth_user<br>evidence_file_id → shared_file<br>decided_by → auth_user |
| 05 | asg_move | Operational move between Beds (or Rooms) by Staff or a Manager, with reason, meter cut and no price difference. | PK: id<br>FK: term_id → cfg_term<br>student_id → auth_user<br>from_allocation_id → asg_allocation<br>to_allocation_id → asg_allocation<br>from_bed_id → inv_bed<br>to_bed_id → inv_bed<br>moved_by → auth_user |
| 06 | asg_proposal_item | One proposed placement of an assignment run: Application, Bed, fit score, conflict code and resolution. | PK: id<br>FK: run_id → asg_run<br>application_id → app_application<br>building_id → inv_building<br>bed_id → inv_bed |
| 07 | asg_renewal | The requests window of a Term (M2 to M7): when it opened, closed filing, alerted Managers, issued and closed next-Term fees. | PK: term_id<br>FK: term_id → cfg_term<br>previous_term_id → cfg_term<br>fees_issued_by → auth_user |
| 08 | asg_run | An assignment run of a Term (dry run or real): matching snapshot used, counts, average fit and status. | PK: id<br>FK: term_id → cfg_term<br>matching_snapshot_id → cfg_matching_snapshot<br>started_by → auth_user |
| 09 | asg_run_block | Per-Block review state of a real run: submitted, approved or returned, committed. | PK: run_id, building_id<br>FK: run_id → asg_run<br>building_id → inv_building<br>submitted_by → auth_user<br>decided_by → auth_user |
| 10 | asg_stay | A student's continuous stay: Terms committed (Gia hạn, grown by extensions) and used, Active or Ended. | PK: id<br>FK: student_id → auth_user<br>first_term_id → cfg_term<br>last_term_id → cfg_term |
| 11 | asg_termination | Termination of a stay (Utility debt, discipline, not enrolled): notice sent, move-out date, overdue, checked out or cancelled. | PK: id<br>FK: allocation_id → asg_allocation<br>term_id → cfg_term<br>student_id → auth_user<br>started_by → auth_user<br>ended_by → auth_user |

### 2.7 Billing and Utility (BIL)

![Logical ERD: Billing and Utility (BIL)](../../diagrams/out/erd-bil.png)

| No | Table | Description | Keys |
|---|---|---|---|
| 01 | bil_bank_transaction_archive | Archive of bank transactions received from SePay before payment claims replaced it (read only since v2 phase 5). | PK: id<br>FK: invoice_id → bil_invoice |
| 02 | bil_invoice | An Invoice: Deposit, Balance (with the Utility Deposit), next-Term fee, Utility, charge or credit; amount fixed once issued; status Unpaid, Awaiting confirmation, Paid, Overdue, Void or Refunded. | PK: id<br>FK: term_id → cfg_term<br>student_id → auth_user<br>application_id → app_application<br>allocation_id → asg_allocation<br>building_id → inv_building |
| 03 | bil_meter_cut | Meter values recorded when a resident leaves or moves mid-period, to split Utility by time. | PK: id<br>FK: room_id → inv_room<br>allocation_id → asg_allocation<br>recorded_by → auth_user |
| 04 | bil_meter_period | A monthly meter-reading period of a Block (open, then closed when readings are confirmed and Utility Invoices issued). | PK: id<br>FK: building_id → inv_building<br>closed_by → auth_user |
| 05 | bil_meter_reading | Electricity and water readings of one Room in a period (missing, entered, check value, confirmed). | PK: id<br>FK: confirmed_by → auth_user<br>period_id → bil_meter_period<br>room_id → inv_room<br>entered_by → auth_user |
| 06 | bil_payment | A confirmed payment of an Invoice (method, reference, receipt file, who confirmed it, its claim). | PK: id<br>FK: invoice_id → bil_invoice<br>bank_transaction_id → bil_bank_transaction_archive<br>receipt_file_id → shared_file<br>confirmed_by → auth_user<br>claim_id → bil_payment_claim |
| 07 | bil_payment_claim | A student's 'I have transferred' claim: stops the Invoice's clock; confirmed or rejected by a Manager. | PK: id<br>FK: invoice_id → bil_invoice<br>student_id → auth_user<br>claimed_by → auth_user<br>decided_by → auth_user |
| 08 | bil_refund | A refund to decide or pay (Deposit, Balance, check-out, termination) with the rule and the amount. | PK: id<br>FK: term_id → cfg_term<br>student_id → auth_user<br>building_id → inv_building<br>rule_id → cfg_refund_rule<br>decided_by → auth_user<br>invoice_id → bil_invoice |
| 09 | bil_utility_warning | Utility debt warnings (first, final with termination date) of an Allocation and how they closed. | PK: id<br>FK: allocation_id → asg_allocation<br>student_id → auth_user<br>term_id → cfg_term<br>building_id → inv_building<br>invoice_id → bil_invoice |

### 2.8 Requests, routing and escalations (REQ)

![Logical ERD: Requests, routing and escalations (REQ)](../../diagrams/out/erd-req.png)

| No | Table | Description | Keys |
|---|---|---|---|
| 01 | req_escalation | An escalation opened by the SLA scan (overdue or unassigned request) and how it was handled. | PK: id<br>FK: building_id → inv_building<br>term_id → cfg_term<br>owner_id → auth_user<br>handled_by → auth_user |
| 02 | req_escalation_event | History of an escalation. | PK: id<br>FK: escalation_id → req_escalation |
| 03 | req_room_change | A next-Term room change request (same Block, other Block or Room Class) with its decision and target Bed. | PK: id<br>FK: term_id → cfg_term<br>student_id → auth_user<br>allocation_id → asg_allocation<br>target_room_type_id → cfg_room_type<br>target_room_class_id → cfg_room_class<br>assignee_id → auth_user<br>target_bed_id → inv_bed<br>decided_by → auth_user<br>invoice_id → bil_invoice<br>building_id → inv_building |
| 04 | req_room_class_change | A request to change a Room's Room Class from the next Term, with every continuing resident's consent and the furniture check. | PK: id<br>FK: to_class_id → cfg_room_class<br>requested_by → auth_user<br>decided_by → auth_user<br>term_id → cfg_term<br>room_id → inv_room<br>building_id → inv_building<br>from_class_id → cfg_room_class |
| 05 | req_room_class_consent | One continuing resident's answer to a Room Class change. | PK: change_id, student_id<br>FK: change_id → req_room_class_change<br>student_id → auth_user<br>allocation_id → asg_allocation |
| 06 | req_routing_rule | Rules that assign requests of a Block to Staff by type and condition. | PK: id<br>FK: building_id → inv_building<br>assignee_id → auth_user<br>fallback_id → auth_user |
| 07 | req_sla_policy | Per-Block time limits: urgent and normal maintenance, room changes. | PK: building_id<br>FK: building_id → inv_building<br>updated_by → auth_user |
| 08 | req_stay_request | Extension (more Terms) or end-of-stay request for the next Term. | PK: id<br>FK: term_id → cfg_term<br>student_id → auth_user<br>allocation_id → asg_allocation<br>building_id → inv_building<br>decided_by → auth_user |
| 09 | req_swap | A swap of two residents' next-Term Beds (direct or from the swap board) with both agreements and Staff's decision. | PK: id<br>FK: term_id → cfg_term<br>post_id → req_swap_post<br>a_allocation_id → asg_allocation<br>b_allocation_id → asg_allocation<br>decided_by → auth_user<br>a_building_id → inv_building<br>b_building_id → inv_building<br>staff_decided_by → auth_user |
| 10 | req_swap_post | A swap board post: what Bed a resident wants in exchange. | PK: id<br>FK: term_id → cfg_term<br>allocation_id → asg_allocation<br>wanted_building_id → inv_building<br>wanted_room_type_id → cfg_room_type<br>wanted_room_class_id → cfg_room_class<br>building_id → inv_building |

### 2.9 Maintenance and inspections (MNT)

![Logical ERD: Maintenance and inspections (MNT)](../../diagrams/out/erd-mnt.png)

| No | Table | Description | Keys |
|---|---|---|---|
| 01 | mnt_checklist | Inspection checklists (versioned): draft, published, archived. | PK: id |
| 02 | mnt_checklist_item | One item of an inspection checklist (category, severity). | PK: id<br>FK: checklist_id → mnt_checklist |
| 03 | mnt_inspection_result | The answer to a checklist item for one Room of an inspection run. | PK: inspection_room_id, item_id<br>FK: inspection_room_id → mnt_inspection_room<br>item_id → mnt_checklist_item<br>created_request_id → mnt_request |
| 04 | mnt_inspection_room | One Room of an inspection run and its state. | PK: id<br>FK: run_id → mnt_inspection_run<br>room_id → inv_room |
| 05 | mnt_inspection_room_check | The Room's own checks of an inspection (number of people, each required furniture item). | PK: inspection_room_id, check_key<br>FK: inspection_room_id → mnt_inspection_room<br>created_request_id → mnt_request |
| 06 | mnt_inspection_run | An inspection run of a Block on a date by an inspector. | PK: id<br>FK: schedule_id → mnt_inspection_schedule<br>building_id → inv_building<br>checklist_id → mnt_checklist<br>inspector_id → auth_user |
| 07 | mnt_inspection_schedule | A recurring inspection schedule of a Block (scope, floors, repeat, assignee). | PK: id<br>FK: building_id → inv_building<br>assignee_id → auth_user |
| 08 | mnt_request | A Maintenance Request: Room, reporter, category, urgency, furniture item, assignee, SLA deadline, status Submitted to Closed. | PK: id<br>FK: term_id → cfg_term<br>room_id → inv_room<br>bed_id → inv_bed<br>reporter_id → auth_user<br>assignee_id → auth_user<br>building_id → inv_building<br>furniture_item_id → inv_furniture_item |
| 09 | mnt_request_event | History and messages of a Maintenance Request. | PK: id<br>FK: request_id → mnt_request<br>actor_id → auth_user |
| 10 | mnt_request_photo | Photos attached to a Maintenance Request. | PK: request_id, file_id<br>FK: request_id → mnt_request<br>file_id → shared_file |

### 2.10 Notifications and announcements (NTF)

![Logical ERD: Notifications and announcements (NTF)](../../diagrams/out/erd-ntf.png)

| No | Table | Description | Keys |
|---|---|---|---|
| 01 | ntf_announcement | Announcements of the dormitory board (Term published, price changes, operations), in English and Vietnamese. | PK: id<br>FK: term_id → cfg_term<br>created_by → auth_user |
| 02 | ntf_announcement_block | Blocks an announcement is shown to. | PK: announcement_id, building_id<br>FK: announcement_id → ntf_announcement<br>building_id → inv_building |
| 03 | ntf_announcement_read | Which student read which announcement. | PK: announcement_id, user_id<br>FK: announcement_id → ntf_announcement<br>user_id → auth_user |
| 04 | ntf_device | Push device tokens (FCM) per user. | PK: id<br>FK: user_id → auth_user |
| 05 | ntf_email_campaign | Emails the Admin sends to a group of students. | PK: id<br>FK: created_by → auth_user<br>term_id → cfg_term<br>building_id → inv_building<br>student_id → auth_user<br>template_key → ntf_email_template |
| 06 | ntf_email_outbox | Outgoing emails (queued, sent, failed) dispatched every 30 seconds. | PK: id<br>FK: campaign_id → ntf_email_campaign |
| 07 | ntf_email_template | Email templates (English and Vietnamese). | PK: key |
| 08 | ntf_notification | In-app notifications of a user (read state). | PK: id<br>FK: user_id → auth_user |
| 09 | ntf_template | Notification texts per event (push, in-app; English and Vietnamese). | PK: key<br>FK: updated_by → auth_user |

### 2.11 Shared: Audit Log and files

![Logical ERD: Shared: Audit Log and files](../../diagrams/out/erd-shared.png)

| No | Table | Description | Keys |
|---|---|---|---|
| 01 | shared_audit_log | Audit Log of every configuration change, irreversible action, export and door-code view. | PK: id |
| 02 | shared_file | Uploaded files (photos, receipts, evidence) stored on the server volume and served through signed links. | PK: id |

