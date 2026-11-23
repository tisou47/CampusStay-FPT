| Status column | Allowed values | State diagram |
|---|---|---|
| app_application.status | DRAFT, AWAITING_ROOMMATE, AWAITING_DEPOSIT, SUBMITTED, UNDER_REVIEW, APPROVED, WAITLISTED, ALLOCATED, REJECTED, CANCELLED, EXPIRED, FORFEITED | 08_State_Machine/state-app_application |
| app_roommate_invitation.status | PENDING, ACCEPTED, DECLINED, EXPIRED, CANCELLED | 08_State_Machine/state-app_roommate_invitation |
| app_round2_offer.status | PENDING, ACCEPTED, DECLINED, EXPIRED, WITHDRAWN | 08_State_Machine/state-app_round2_offer |
| asg_allocation.status | ACTIVE, ENDED, CANCELLED | 08_State_Machine/state-asg_allocation |
| asg_check_out.refund_status | NONE, PENDING, APPROVED, PAID, REJECTED | 08_State_Machine/state-asg_check_out-refund_status |
| asg_check_out.status | PENDING, DRAFT, COMPLETED | 08_State_Machine/state-asg_check_out |
| asg_damage_claim.status | PENDING, ACKNOWLEDGED, DECLINED, EXPIRED, SETTLED | 08_State_Machine/state-asg_damage_claim |
| asg_handover.status | DRAFT, SUBMITTED, VERIFYING, FINAL, CANCELLED | 08_State_Machine/state-asg_handover |
| asg_late_check_in.status | PENDING, APPROVED, REJECTED | 08_State_Machine/state-asg_late_check_in |
| asg_run.status | RUNNING, PROPOSED, IN_REVIEW, COMMITTED, FAILED, DISCARDED | 08_State_Machine/state-asg_run |
| asg_run_block.status | REVIEW, SUBMITTED, APPROVED, RETURNED, COMMITTED | 08_State_Machine/state-asg_run_block |
| asg_stay.status | ACTIVE, ENDED | 08_State_Machine/state-asg_stay |
| asg_termination.status | NOTICE_SENT, OVERDUE, CHECKED_OUT, CANCELLED | 08_State_Machine/state-asg_termination |
| auth_reconciliation_item.status | OPEN, RESOLVED, INFO | 08_State_Machine/state-auth_reconciliation_item |
| auth_staff_account_request.status | PENDING, APPROVED, REJECTED | a value list: no change after the insert |
| auth_student.enrollment_status | ENROLLED, SUSPENDED, GRADUATED, WITHDRAWN, NOT_ENROLLED | 08_State_Machine/state-auth_student-enrollment_status |
| auth_student_import.status | PREVIEW, APPLIED | 08_State_Machine/state-auth_student_import |
| auth_user.status | INVITED, ACTIVE, DISABLED | 08_State_Machine/state-auth_user |
| bil_bank_transaction_archive.match_status | PENDING, MATCHED, UNMATCHED, AMOUNT_MISMATCH, ALREADY_PAID, IGNORED | a value list: no change after the insert |
| bil_invoice.status | UPCOMING, UNPAID, AWAITING_CONFIRMATION, PAID, OVERDUE, REFUNDED, VOID | 08_State_Machine/state-bil_invoice |
| bil_meter_reading.status | MISSING, ENTERED, CHECK_VALUE, CONFIRMED | 08_State_Machine/state-bil_meter_reading |
| bil_payment.status | CONFIRMED, REVERSED | a value list: no change after the insert |
| bil_payment_claim.status | CLAIMED, CONFIRMED, REJECTED | 08_State_Machine/state-bil_payment_claim |
| bil_refund.status | PENDING, APPROVED, REJECTED, PAID | 08_State_Machine/state-bil_refund |
| cfg_room_class.status | ACTIVE, INACTIVE | 08_State_Machine/state-cfg_room_class |
| cfg_room_type.status | ACTIVE, INACTIVE | 08_State_Machine/state-cfg_room_type |
| cfg_term.status | DRAFT, PUBLISHED, CLOSED | 08_State_Machine/state-cfg_term |
| cfg_term_request.status | SUBMITTED, IN_PROGRESS, NEEDS_CHANGES, DONE, REJECTED | 08_State_Machine/state-cfg_term_request |
| inv_bed.status | IN_SERVICE, OUT_OF_SERVICE, RETIRED | 08_State_Machine/state-inv_bed |
| inv_building.status | ACTIVE, INACTIVE | 08_State_Machine/state-inv_building |
| inv_door_code.status | PROPOSED, ACTIVE, RETIRED, CANCELLED | 08_State_Machine/state-inv_door_code |
| inv_furniture_item.status | IN_USE, BROKEN, IN_REPAIR, IN_STORE, DISPOSED | 08_State_Machine/state-inv_furniture_item |
| inv_furniture_move.status | PLANNED, DONE, CANCELLED | 08_State_Machine/state-inv_furniture_move |
| inv_furniture_type.status | ACTIVE, INACTIVE | 08_State_Machine/state-inv_furniture_type |
| inv_room.status | IN_SERVICE, OUT_OF_SERVICE, RETIRED | 08_State_Machine/state-inv_room |
| mnt_checklist.status | DRAFT, PUBLISHED, REPLACED, ARCHIVED | 08_State_Machine/state-mnt_checklist |
| mnt_inspection_room.status | PENDING, INSPECTED, UNREACHABLE | 08_State_Machine/state-mnt_inspection_room |
| mnt_inspection_run.status | SCHEDULED, IN_PROGRESS, SUBMITTED | 08_State_Machine/state-mnt_inspection_run |
| mnt_inspection_schedule.status | ACTIVE, PAUSED, COMPLETED | 08_State_Machine/state-mnt_inspection_schedule |
| mnt_request.status | SUBMITTED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED | 08_State_Machine/state-mnt_request |
| ntf_email_campaign.status | QUEUED, SENDING, SENT, FAILED | a value list: no change after the insert |
| ntf_email_outbox.status | PENDING, SENT, FAILED | 08_State_Machine/state-ntf_email_outbox |
| req_escalation.status | OPEN, HANDLED | 08_State_Machine/state-req_escalation |
| req_room_change.status | SUBMITTED, PENDING, APPROVED, REJECTED, CANCELLED | 08_State_Machine/state-req_room_change |
| req_room_class_change.status | AWAITING_CONSENT, SUBMITTED, APPROVED, REJECTED, CANCELLED, SET_BACK | a value list: no change after the insert |
| req_room_class_consent.status | PENDING, AGREED, DECLINED | a value list: no change after the insert |
| req_stay_request.status | SUBMITTED, APPROVED, REJECTED, CANCELLED | 08_State_Machine/state-req_stay_request |
| req_swap.status | INVITED, DECLINED, EXPIRED, PENDING, TO_MANAGER, APPROVED, REJECTED, CANCELLED | 08_State_Machine/state-req_swap |
| req_swap_post.status | ACTIVE, CLOSED | 08_State_Machine/state-req_swap_post |
| vis_family_day.status | DRAFT, PUBLISHED, CANCELLED, COMPLETED | 08_State_Machine/state-vis_family_day |
| vis_registration.status | APPROVED, CANCELLED | 08_State_Machine/state-vis_registration |
| vis_visitor.status | NOT_ARRIVED, CHECKED_IN, CHECKED_OUT, NO_SHOW, CANCELLED | 08_State_Machine/state-vis_visitor |
