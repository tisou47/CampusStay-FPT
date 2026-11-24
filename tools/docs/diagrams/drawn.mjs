// Diagrams drawn by hand from the code: context, architecture, class, sequence and activity diagrams. Every message
// of a sequence names the endpoint or the Class.method it is (checked by build.mjs: each `Class.method` in a message
// must exist in backend/src/main/java, each "METHOD /path" in endpoints.json).

const seq = (name, title, participants, items) => ({ name: `07_Sequence/${name}`, kind: 'sequence', title, autonumber: true, participants, items })
const msg = (from, to, text, dashed = false) => ({ type: 'msg', from, to, text, dashed })
const reply = (from, to, text) => msg(from, to, text, true)
const alt = (label) => ({ type: 'start', kind: 'alt', label })
const opt = (label) => ({ type: 'start', kind: 'opt', label })
const loop = (label) => ({ type: 'start', kind: 'loop', label })
const els = (label) => ({ type: 'else', label })
const end = { type: 'end' }
const note = (over, text) => ({ type: 'note', over, text })

const STUDENT = { id: 'st', label: 'Student', actor: true }
const MANAGER = { id: 'mg', label: 'Manager', actor: true }
const STAFF = { id: 'sf', label: 'Staff', actor: true }
const ADMIN = { id: 'ad', label: 'Admin', actor: true }
const APP = { id: 'ui', label: 'Web / mobile app' }
const DB = { id: 'db', label: 'PostgreSQL' }

const rawSequences = [
  seq('seq-01-google-sign-in', 'Google sign-in and sign-up', [
    STUDENT, APP, { id: 'google', label: 'Google' }, { id: 'ctl', label: 'AuthController' },
    { id: 'svc', label: 'SignInService' }, { id: 'up', label: 'StudentSignUp' }, { id: 'ses', label: 'SessionService' }, DB,
  ], [
    msg('st', 'ui', 'Sign in with Google'),
    msg('ui', 'google', 'Google popup (web) / Google Sign-In (Android)'),
    reply('google', 'ui', 'authorization code / ID token'),
    msg('ui', 'ctl', 'POST /auth/google'),
    msg('ctl', 'svc', 'SignInService.signInWithGoogleCode / signInWithGoogle'),
    msg('svc', 'google', 'GoogleCodeExchanger.exchange + GoogleIdTokenVerifier.verify'),
    reply('google', 'svc', 'identity (subject, email @fpt.edu.vn)'),
    msg('svc', 'db', 'find the user by Google subject or email'),
    alt('no account yet'),
    msg('svc', 'up', 'StudentSignUp.signUp(identity)'),
    msg('up', 'db', 'INSERT auth_user (no password) + auth_student (verification PENDING)'),
    els('a fictional back-office account'),
    reply('svc', 'ctl', '403 GOOGLE_NOT_FOR_DEMO'),
    end,
    msg('svc', 'ses', 'SessionService.create(user, remember, GOOGLE)'),
    msg('ses', 'db', 'INSERT auth_session'),
    reply('ctl', 'ui', '200 { token, user }'),
    note(['ui', 'ctl'], 'Until a password is set and the sign-up form is sent, AccountSetupGate answers 403 PASSWORD_REQUIRED / PROFILE_REQUIRED'),
    msg('ui', 'ctl', 'POST /auth/password/set, then PUT /students/me/verification'),
  ]),

  seq('seq-02-apply-with-deposit', 'Apply for a Bed with the Deposit', [
    STUDENT, APP, { id: 'ctl', label: 'ApplicationController' }, { id: 'svc', label: 'ApplicationService' },
    { id: 'bil', label: 'Billing (BIL)' }, { id: 'ntf', label: 'Notifications (NTF)' }, DB,
  ], [
    msg('st', 'ui', 'Apply: Term, Room Type, Room Class, roommate, contact, consents'),
    msg('ui', 'ctl', 'GET /applications/eligibility'),
    reply('ctl', 'ui', 'eligible, or the checks that failed'),
    msg('ui', 'ctl', 'POST /applications'),
    msg('ctl', 'svc', 'ApplicationService.create(cmd)'),
    msg('svc', 'db', 'INSERT app_application (AWAITING_DEPOSIT)'),
    msg('svc', 'bil', 'Billing.issueDeposit (Deposit Invoice, due date)'),
    msg('svc', 'ntf', 'ApplicationCreated'),
    reply('ctl', 'ui', '201 { id, depositInvoiceId, depositDueAt }'),
    note(['st', 'bil'], 'The Deposit is paid by bank transfer and claimed (sequence 04); the Manager\'s confirmation publishes PaymentConfirmed'),
    msg('bil', 'svc', 'PaymentConfirmed → ApplicationService.on(PaymentConfirmed)'),
    alt('a roommate pair still waiting for the partner'),
    msg('svc', 'db', 'AWAITING_DEPOSIT → AWAITING_ROOMMATE'),
    els('otherwise'),
    msg('svc', 'db', 'AWAITING_DEPOSIT (and the partner\'s AWAITING_ROOMMATE) → SUBMITTED'),
    msg('svc', 'ntf', 'ApplicationSubmitted'),
    end,
    opt('Deposit not paid by the due time'),
    msg('svc', 'db', 'ApplicationService.expireOverdue: AWAITING_DEPOSIT → EXPIRED'),
    end,
  ]),

  seq('seq-03-roommate-invitation', 'Roommate invitation', [
    { id: 'a', label: 'Student A', actor: true }, { id: 'b', label: 'Student B', actor: true },
    { id: 'ctl', label: 'ApplicationController' }, { id: 'svc', label: 'ApplicationService' }, { id: 'ntf', label: 'Notifications (NTF)' }, DB,
  ], [
    msg('a', 'ctl', 'POST /applications/roommate-check (B\'s student code)'),
    reply('ctl', 'a', '{ valid, checksLeft }'),
    msg('a', 'ctl', 'POST /applications (roommate mode INVITE)'),
    msg('ctl', 'svc', 'ApplicationService.create'),
    msg('svc', 'db', 'INSERT app_application + app_roommate_invitation (PENDING)'),
    msg('svc', 'ntf', 'RoommateInvited → B'),
    msg('b', 'ctl', 'POST /roommate-invitations/{id}/respond'),
    msg('ctl', 'svc', 'ApplicationService.respond(invitation, accept)'),
    alt('accept'),
    msg('svc', 'db', 'INSERT B\'s app_application (same Room Type and Class, own Deposit Invoice); invitation ACCEPTED; partners linked'),
    msg('svc', 'ntf', 'ApplicationCreated'),
    els('decline'),
    msg('svc', 'db', 'invitation DECLINED; A is matched automatically (dropRoommate)'),
    end,
    opt('no answer before it expires'),
    msg('svc', 'db', 'ApplicationService.expireOverdue: invitation EXPIRED'),
    end,
  ]),

  seq('seq-04-payment-claim', 'Payment claim and Manager confirmation', [
    STUDENT, APP, { id: 'ctl', label: 'PaymentClaimController' }, { id: 'svc', label: 'PaymentClaimService' }, MANAGER,
    { id: 'lst', label: 'Listeners (APP, ASG, NTF)' }, DB,
  ], [
    msg('st', 'ui', 'Open the Invoice: VietQR and transfer content'),
    msg('ui', 'ctl', 'GET /invoices/{id}/payment'),
    note(['st', 'ui'], 'The student transfers the money in their bank app'),
    msg('st', 'ctl', 'POST /invoices/{id}/claim (bank reference)'),
    msg('ctl', 'svc', 'PaymentClaimService.claim'),
    msg('svc', 'db', 'INSERT bil_payment_claim (CLAIMED); Invoice UNPAID/OVERDUE → AWAITING_CONFIRMATION'),
    msg('mg', 'ctl', 'GET /payment-claims (checks the bank statement)'),
    alt('the money arrived'),
    msg('mg', 'ctl', 'POST /payment-claims/confirm (one or many)'),
    msg('ctl', 'svc', 'PaymentClaimService.confirm'),
    msg('svc', 'db', 'INSERT bil_payment; claim CONFIRMED; Invoice → PAID'),
    msg('svc', 'lst', 'PaymentConfirmed (Application submitted, door code released, receipt notification)'),
    els('not found'),
    msg('mg', 'ctl', 'POST /payment-claims/reject (reason)'),
    msg('ctl', 'svc', 'PaymentClaimService.reject'),
    msg('svc', 'db', 'claim REJECTED; Invoice back to UNPAID / OVERDUE, or VOID after the last allowed attempt'),
    msg('svc', 'lst', 'PaymentClaimRejected'),
    end,
  ]),

  seq('seq-05-assignment-run', 'Assignment run, review and commit', [
    MANAGER, { id: 'ctl', label: 'AssignmentController' }, { id: 'svc', label: 'AssignmentService' },
    { id: 'eng', label: 'Assignment engine' }, { id: 'ntf', label: 'Notifications (NTF)' }, DB,
  ], [
    msg('mg', 'ctl', 'POST /assignment-runs (Term, dry run or real)'),
    msg('ctl', 'svc', 'AssignmentService.start'),
    msg('svc', 'db', 'earlier open runs → DISCARDED'),
    msg('svc', 'eng', 'match approved Applications to assignable Beds (Term snapshot of the criteria)'),
    reply('eng', 'svc', 'proposal + conflicts'),
    msg('svc', 'db', 'INSERT asg_run (PROPOSED), asg_run_block per Block, asg_proposal_item'),
    loop('each conflict'),
    msg('mg', 'ctl', 'POST /assignment-runs/{runId}/conflicts/{applicationId}/resolve'),
    msg('ctl', 'svc', 'AssignmentService.resolve (a Bed, or waitlist)'),
    end,
    msg('mg', 'ctl', 'POST /assignment-runs/{runId}/commit (per Block)'),
    msg('ctl', 'svc', 'AssignmentService.submit: block REVIEW → SUBMITTED; run → IN_REVIEW'),
    alt('approve'),
    msg('mg', 'ctl', 'POST /assignment-runs/{runId}/approve'),
    msg('ctl', 'svc', 'AssignmentService.approve'),
    msg('svc', 'db', 'INSERT asg_allocation per Bed; Application → ALLOCATED; Balance Invoice; block COMMITTED (run COMMITTED when all are)'),
    msg('svc', 'ntf', 'AllocationCreated'),
    els('return'),
    msg('mg', 'ctl', 'POST /assignment-runs/{runId}/return (comment)'),
    msg('ctl', 'svc', 'AssignmentService.returnToStaff: block → RETURNED'),
    end,
  ]),

  seq('seq-06-round2-offer', 'Round 2 offer to a waitlisted student', [
    MANAGER, STUDENT, { id: 'ac', label: 'AssignmentController' }, { id: 'asg', label: 'AssignmentService' },
    { id: 'rc', label: 'Round2Controller' }, { id: 'r2', label: 'Round2Service' }, DB,
  ], [
    msg('mg', 'ac', 'POST /round2/run'),
    msg('ac', 'asg', 'AssignmentService.runRound2'),
    msg('asg', 'db', 'INSERT app_round2_offer (PENDING) + options holding free Beds'),
    msg('st', 'rc', 'GET /students/me/round2-offer'),
    msg('st', 'rc', 'POST /round2-offers/{id}/respond'),
    msg('rc', 'r2', 'Round2Service.respond(offer, accept, option)'),
    alt('accept an option'),
    msg('r2', 'db', 'offer ACCEPTED; the Bed placed (Allocation, Balance Invoice)'),
    els('decline'),
    msg('r2', 'db', 'offer DECLINED; Application WAITLISTED → CANCELLED; Deposit refunded in full'),
    end,
    opt('the offer expires'),
    msg('r2', 'db', 'Round2Service.expire: offer EXPIRED; Beds released; Application cancelled with refund'),
    end,
  ]),

  seq('seq-07-check-in-handover', 'Check-in with the hand-over report', [
    STUDENT, { id: 'hc', label: 'HandoverController' }, { id: 'sh', label: 'StudentHandoverService' },
    STAFF, { id: 'hd', label: 'HandoverDeskService' }, { id: 'core', label: 'HandoverCore' }, DB,
  ], [
    msg('st', 'hc', 'POST /students/me/handover/start'),
    msg('hc', 'sh', 'StudentHandoverService.start'),
    msg('sh', 'db', 'asg_handover DRAFT (items of the Room, due time)'),
    msg('st', 'hc', 'PUT /students/me/handover (item conditions, photos, meters)'),
    msg('st', 'hc', 'POST /students/me/handover/submit'),
    msg('hc', 'sh', 'StudentHandoverService.submit: DRAFT → SUBMITTED'),
    alt('the report matches the baseline'),
    msg('sh', 'core', 'HandoverCore.finalize (source STUDENT): FINAL'),
    els('differences'),
    msg('sf', 'hd', 'POST /handovers/{id}/visit'),
    msg('hd', 'db', 'HandoverDeskService.requestVisit: SUBMITTED → VERIFYING'),
    msg('sf', 'hd', 'PUT /handovers/{id}/verification (conditions found on site)'),
    msg('hd', 'core', 'HandoverCore.finalize (source VERIFIED): FINAL'),
    end,
    opt('the student does nothing before the due time'),
    msg('core', 'db', 'HandoverJobService: DRAFT → FINAL (source AUTO)'),
    end,
  ]),

  seq('seq-08-door-code-release', 'Door code release', [
    MANAGER, { id: 'bil', label: 'PaymentClaimService' }, { id: 'rel', label: 'DoorCodeRelease' },
    STAFF, { id: 'dc', label: 'DoorCodeService' }, STUDENT, DB,
  ], [
    msg('mg', 'bil', 'POST /payment-claims/confirm (Balance Invoice)'),
    msg('bil', 'rel', 'PaymentConfirmed → DoorCodeRelease.on(PaymentConfirmed)'),
    alt('the Room needs a new code first (someone left it)'),
    msg('rel', 'db', 'wait: inv_door_code_task open'),
    msg('sf', 'dc', 'POST /door-codes/{room} (propose a code)'),
    msg('sf', 'dc', 'POST /door-codes/{room}/confirm'),
    msg('dc', 'db', 'old code RETIRED; new code ACTIVE'),
    msg('dc', 'rel', 'DoorCodeActivated → DoorCodeRelease.on(DoorCodeActivated)'),
    end,
    msg('rel', 'db', 'DoorCodeRelease.releaseAllocations: code_released_at, resident_at'),
    msg('rel', 'st', 'DoorCodeReleased, CheckInAvailable (push and in-app)'),
    msg('st', 'dc', 'the student reads the code in the app (My Room)'),
  ]),

  seq('seq-09-maintenance-routing-sla', 'Maintenance Request: routing and SLA', [
    STUDENT, { id: 'mc', label: 'MaintenanceController' }, { id: 'ms', label: 'MaintenanceService' },
    { id: 'rt', label: 'MaintenanceRouting' }, STAFF, { id: 'md', label: 'MaintenanceDeskService' }, { id: 'esc', label: 'EscalationService' }, DB,
  ], [
    msg('st', 'mc', 'POST /maintenance-requests (category, urgency, photos, furniture item)'),
    msg('mc', 'ms', 'MaintenanceService.report'),
    msg('ms', 'db', 'INSERT mnt_request (SUBMITTED)'),
    msg('ms', 'rt', 'MaintenanceReported → MaintenanceRouting.on(MaintenanceReported)'),
    msg('rt', 'db', 'sla_due_at = now + the Block\'s urgent / normal timer'),
    opt('a routing rule matches the Block and category'),
    msg('rt', 'db', 'assignee set: SUBMITTED → ASSIGNED'),
    end,
    msg('sf', 'mc', 'PATCH /maintenance-requests/{id} (status In progress, Resolved)'),
    msg('mc', 'md', 'MaintenanceDeskService.update'),
    msg('md', 'st', 'MaintenanceUpdated (notification)'),
    msg('st', 'mc', 'POST /maintenance-requests/{id}/confirm'),
    msg('mc', 'ms', 'MaintenanceService.confirm: fixed → CLOSED, not fixed → reopened'),
    opt('the SLA time passes with the request still open'),
    msg('esc', 'db', 'EscalationService.scan: req_escalation OPEN for the Manager'),
    end,
  ]),

  seq('seq-10-inspection-run', 'Room inspection run', [
    { id: 'job', label: 'InspectionScheduleService' }, STAFF, { id: 'ic', label: 'InspectionController' },
    { id: 'run', label: 'InspectionRunService' }, { id: 'ntf', label: 'Notifications (NTF)' }, DB,
  ], [
    msg('job', 'db', 'InspectionScheduleService.startDue: INSERT mnt_inspection_run (SCHEDULED) + its Rooms (PENDING)'),
    msg('job', 'ntf', 'InspectionAssigned (inspector), InspectionScheduled (residents)'),
    msg('sf', 'ic', 'GET /inspection-runs/current'),
    loop('each Room of the run'),
    alt('inspected'),
    msg('sf', 'run', 'InspectionRunService.saveRoom (checklist results, people, furniture, photos)'),
    msg('run', 'db', 'Room PENDING → INSPECTED; run SCHEDULED → IN_PROGRESS'),
    opt('a failed item'),
    msg('run', 'db', 'INSERT mnt_request (source INSPECTION); MaintenanceReported'),
    end,
    els('nobody there'),
    msg('sf', 'run', 'InspectionRunService.unreachable: Room → UNREACHABLE'),
    end,
    end,
    msg('sf', 'run', 'InspectionRunService.submit: run → SUBMITTED'),
  ]),

  seq('seq-11-room-change', 'Room-Change Request', [
    STUDENT, { id: 'rc', label: 'RoomChangeController' }, { id: 'svc', label: 'RoomChangeService' },
    STAFF, { id: 'mv', label: 'Moves (ASG)' }, DB,
  ], [
    msg('st', 'rc', 'GET /room-changes/options'),
    msg('st', 'rc', 'POST /room-changes (wanted Room Type / Class, reason)'),
    msg('rc', 'svc', 'RoomChangeService.create'),
    msg('svc', 'db', 'INSERT req_room_change (SUBMITTED, SLA due)'),
    msg('sf', 'rc', 'GET /room-changes/{id}/matching-beds'),
    msg('sf', 'rc', 'POST /room-changes/{id}/decision'),
    msg('rc', 'svc', 'RoomChangeService.decide'),
    alt('approve with a Bed'),
    msg('svc', 'mv', 'move the next-Term Allocation to the Bed'),
    msg('svc', 'db', 'request APPROVED; RoomChangeDecided'),
    els('reject'),
    msg('svc', 'db', 'request REJECTED (reason); RoomChangeDecided'),
    end,
  ]),

  seq('seq-12-swap', 'Swap: board and direct', [
    { id: 'a', label: 'Student A', actor: true }, { id: 'b', label: 'Student B', actor: true },
    { id: 'sc', label: 'SwapController' }, { id: 'svc', label: 'SwapService' }, STAFF, MANAGER, DB,
  ], [
    alt('direct (A knows B)'),
    msg('a', 'sc', 'POST /swaps (B\'s student code)'),
    msg('sc', 'svc', 'SwapService.direct'),
    els('board'),
    msg('b', 'sc', 'PUT /swap-board/my-post'),
    msg('a', 'sc', 'POST /swap-board/posts/{id}/request'),
    msg('sc', 'svc', 'SwapService.requestPost'),
    end,
    msg('svc', 'db', 'INSERT req_swap (INVITED); SwapInvited → B'),
    msg('b', 'sc', 'POST /swap-invitations/{id}/respond'),
    msg('sc', 'svc', 'SwapService.respond: INVITED → PENDING (accept) or DECLINED'),
    msg('sf', 'sc', 'POST /swaps/{id}/decision'),
    msg('sc', 'svc', 'SwapService.decide'),
    alt('the two Beds are in different Blocks'),
    msg('svc', 'db', 'PENDING → TO_MANAGER'),
    msg('mg', 'sc', 'POST /swaps/{id}/decision'),
    end,
    msg('svc', 'db', 'APPROVED: the two next-Term Allocations change Beds; other open requests closed (closeOthers)'),
  ]),

  seq('seq-13-term-wizard-publish', 'Registration-period request, Term wizard and publish', [
    MANAGER, { id: 'trc', label: 'TermRequestController' }, { id: 'trs', label: 'TermRequestService' }, ADMIN,
    { id: 'atc', label: 'AdminTermController' }, { id: 'wiz', label: 'TermWizardService' }, { id: 'ntf', label: 'Notifications (NTF)' }, DB,
  ], [
    msg('mg', 'trc', 'POST /term-requests (Term name, stay dates, Blocks, prices)'),
    msg('trc', 'trs', 'TermRequestService.create: SUBMITTED; TermRequestSubmitted'),
    alt('changes needed'),
    msg('ad', 'trc', 'POST /term-requests/{id}/decision (NEEDS_CHANGES, note)'),
    msg('mg', 'trc', 'PUT /term-requests/{id} (resubmitted)'),
    end,
    msg('ad', 'atc', 'POST /admin/terms/drafts (from the request)'),
    msg('atc', 'wiz', 'TermWizardService.createDraft: cfg_term DRAFT; request IN_PROGRESS'),
    loop('steps: timeline, Blocks, prices, Deposit, rules, documents'),
    msg('ad', 'atc', 'PUT /admin/terms/{id}/wizard/{step}'),
    msg('atc', 'wiz', 'TermWizardService.save (TermTimelines checks the milestones)'),
    end,
    msg('ad', 'atc', 'POST /admin/terms/{id}/publish'),
    msg('atc', 'wiz', 'TermWizardService.publish'),
    msg('wiz', 'db', 'cfg_term PUBLISHED; prices, Deposit, eligibility and matching snapshot fixed; request DONE'),
    msg('wiz', 'ntf', 'TermPublished'),
  ]),

  seq('seq-14-renewal-next-term-fee', 'Renewal and the next-Term fee', [
    { id: 'job', label: 'RenewalService' }, STUDENT, { id: 'nc', label: 'NextTermRequestController' },
    MANAGER, { id: 'fee', label: 'NextTermFeeService' }, { id: 'bil', label: 'Billing (BIL)' }, DB,
  ], [
    msg('job', 'db', 'RenewalService.openDue (M2): next-Term Allocation on the same Bed (renewal AWAITING_EXTENSION / CONTINUING)'),
    msg('job', 'st', 'RequestsWindowOpened, NextTermBedTaken'),
    alt('stay longer'),
    msg('st', 'nc', 'POST /students/me/stay/extension'),
    els('leave'),
    msg('st', 'nc', 'POST /students/me/stay/end'),
    end,
    msg('mg', 'nc', 'POST /next-term-requests/decision (bulk)'),
    msg('job', 'db', 'RenewalService.closeDue (M3): filing closed'),
    msg('mg', 'fee', 'POST /next-term-fees/issue'),
    msg('fee', 'bil', 'NextTermFeeService.issue: one TERM_FEE Invoice per live next-Term Allocation'),
    note(['st', 'bil'], 'Paid through a claim (sequence 04)'),
    opt('unpaid at M7'),
    msg('job', 'db', 'RenewalService.cancelUnpaidFees: next-Term Allocation cancelled, the Bed released'),
    end,
  ]),

  seq('seq-15-utility-meter-invoice', 'Utility: meter readings, cuts and Invoices', [
    STAFF, { id: 'mc', label: 'MeterController' }, { id: 'svc', label: 'MeterService' },
    { id: 'tv', label: 'TurnoverService' }, { id: 'bil', label: 'JdbcBilling' }, STUDENT, DB,
  ], [
    opt('a resident moves in or out during the month'),
    msg('sf', 'tv', 'POST /turnover/meter-cuts → TurnoverService.meterCut'),
    msg('tv', 'db', 'INSERT bil_meter_cut (reading at that moment)'),
    end,
    msg('sf', 'mc', 'POST /meter-periods/{id}/import (CSV) or PUT /meter-periods/{id}/readings/{room}'),
    msg('mc', 'svc', 'MeterService.importCsv / save: MISSING → ENTERED, or CHECK_VALUE when unusual'),
    msg('sf', 'mc', 'POST /meter-periods/{id}/readings/{room}/confirm'),
    msg('mc', 'svc', 'MeterService.confirm: → CONFIRMED'),
    msg('sf', 'mc', 'POST /meter-periods/{id}/close'),
    msg('mc', 'svc', 'MeterService.close: split each Room\'s use by time between the cuts and the residents'),
    msg('svc', 'bil', 'JdbcBilling.issueUtility per student'),
    msg('bil', 'st', 'Utility Invoice (notification)'),
    opt('unpaid Utility Invoices'),
    msg('bil', 'st', 'UtilityDebtService.evaluateAll: UtilityWarningIssued; at the last level UtilityTerminationDue'),
    end,
  ]),

  seq('seq-16-termination', 'Termination of a stay', [
    MANAGER, { id: 'tc', label: 'TerminationController' }, { id: 'svc', label: 'TerminationService' },
    STUDENT, STAFF, { id: 'desk', label: 'DeskService' }, DB,
  ], [
    msg('mg', 'tc', 'POST /terminations (Allocation, reason, move-out date)'),
    msg('tc', 'svc', 'TerminationService.start'),
    msg('svc', 'db', 'INSERT asg_termination (NOTICE_SENT)'),
    msg('svc', 'st', 'TerminationStarted (notice)'),
    alt('the Manager cancels'),
    msg('mg', 'tc', 'POST /terminations/{id}/cancel'),
    msg('tc', 'svc', 'TerminationService.cancel: → CANCELLED'),
    els('the student checks out'),
    msg('sf', 'desk', 'POST /check-out/{allocationId}'),
    msg('desk', 'svc', 'TerminationService.checkedOut: → CHECKED_OUT; unused fee refunded'),
    els('the move-out date passes'),
    msg('svc', 'db', 'TerminationService.markOverdue: → OVERDUE; next-Term Bed released; ResidentLeftRoom (door code rotated)'),
    end,
  ]),

  seq('seq-17-reconciliation', 'Enrollment reconciliation', [
    MANAGER, { id: 'rc', label: 'ReconciliationController' }, { id: 'svc', label: 'ReconciliationService' },
    { id: 'asg', label: 'RenewalService' }, { id: 'app', label: 'ApplicationReviewService' }, DB,
  ], [
    msg('mg', 'rc', 'GET /reconciliations/template'),
    msg('mg', 'rc', 'POST /reconciliations (the school\'s enrolled list, CSV / XLSX)'),
    msg('rc', 'svc', 'ReconciliationService.upload'),
    msg('svc', 'db', 'enrollment_status updated from the file; items OPEN (residents or applicants not listed) and INFO'),
    loop('each open item'),
    msg('mg', 'rc', 'POST /reconciliations/{id}/items/{itemId}/resolve'),
    msg('rc', 'svc', 'ReconciliationService.resolve: OPEN → RESOLVED'),
    opt('outcome: not enrolled'),
    msg('svc', 'db', 'enrollment_status → NOT_ENROLLED'),
    msg('svc', 'asg', 'StudentNotEnrolled → next-Term Allocation cancelled'),
    msg('svc', 'app', 'StudentNotEnrolled → Application rejected'),
    end,
    end,
  ]),

  seq('seq-18-family-day', 'Family Day: registration, pass and gate', [
    MANAGER, { id: 'fd', label: 'FamilyDayService' }, STUDENT, { id: 'sfd', label: 'StudentFamilyDayService' },
    STAFF, { id: 'desk', label: 'VisitorDeskService' }, DB,
  ], [
    msg('mg', 'fd', 'POST /family-days, then POST /family-days/{id}/publish'),
    msg('fd', 'db', 'vis_family_day DRAFT → PUBLISHED; FamilyDayPublished to the Block\'s residents'),
    msg('st', 'sfd', 'POST /students/me/family-days/{id}/registration (time slot, guests)'),
    msg('sfd', 'db', 'one conditional UPDATE takes the places (booked ≤ capacity); vis_registration APPROVED; a pass per guest'),
    msg('sf', 'desk', 'POST /family-day-visitors/verify (pass token)'),
    msg('sf', 'desk', 'POST /family-day-visitors/{id}/check-in (identity checked)'),
    msg('desk', 'db', 'NOT_ARRIVED → CHECKED_IN'),
    opt('the guest stays past the slot'),
    msg('sf', 'desk', 'POST /family-days/{id}/overdue-reminders'),
    msg('st', 'sfd', 'POST /students/me/family-days/{id}/registration/safety-confirmation'),
    end,
    msg('sf', 'desk', 'POST /family-day-visitors/{id}/check-out: → CHECKED_OUT'),
    msg('mg', 'fd', 'POST /family-days/{id}/close: → COMPLETED; guests not arrived → NO_SHOW'),
  ]),

  seq('seq-19-ai-assistant', 'AI assistant question', [
    STUDENT, APP, { id: 'ac', label: 'AssistantController' }, { id: 'svc', label: 'AssistantService' },
    { id: 'data', label: 'StudentData' }, { id: 'model', label: 'OllamaAssistantModel' },
  ], [
    msg('st', 'ui', 'Ask a question'),
    msg('ui', 'ac', 'POST /students/me/assistant/chat (the conversation; nothing stored on the server)'),
    msg('ac', 'svc', 'AssistantService.chat'),
    alt('a door-code question'),
    reply('svc', 'ac', 'fixed answer: read the code in My Room (no model call)'),
    els('hourly limit reached'),
    reply('svc', 'ac', '429 ASSISTANT_LIMIT'),
    els('otherwise'),
    msg('svc', 'data', 'the student\'s own data, read through the student screens\' services'),
    msg('svc', 'model', 'OllamaAssistantModel.chat (guide + data + question, temperature 0)'),
    reply('model', 'svc', 'answer'),
    opt('the answer has CJK script'),
    msg('svc', 'model', 'ask again once; still CJK → 503 ASSISTANT_NO_ANSWER'),
    end,
    reply('svc', 'ac', 'answer'),
    end,
    reply('ac', 'ui', '200 { reply }'),
  ]),

  seq('seq-20-push-notification', 'Push notification', [
    STUDENT, { id: 'mob', label: 'Mobile app' }, { id: 'dc', label: 'DeviceController' }, { id: 'ds', label: 'DeviceService' },
    { id: 'lst', label: 'StudentNotificationListener' }, { id: 'in', label: 'InAppNotifier' }, { id: 'pd', label: 'PushDispatcher' },
    { id: 'fcm', label: 'Firebase Cloud Messaging' }, DB,
  ], [
    msg('mob', 'dc', 'POST /devices (FCM token, ANDROID)'),
    msg('dc', 'ds', 'DeviceService.register'),
    msg('ds', 'db', 'INSERT ntf_device'),
    note(['lst', 'pd'], 'Any domain event, e.g. AllocationCreated'),
    msg('lst', 'in', 'StudentNotificationListener.on(event) → InAppNotifier.notify(template, values, link)'),
    msg('in', 'db', 'INSERT ntf_notification (the student\'s language)'),
    msg('in', 'pd', 'PushDispatcher.afterCommit'),
    msg('pd', 'fcm', 'FcmPushSender.send (each device token)'),
    msg('fcm', 'mob', 'push'),
    msg('st', 'mob', 'tap: the deep link opens the screen (links.dart)'),
  ]),

  seq('seq-21-staff-shift-gate', 'Staff shift gate', [
    STAFF, { id: 'ui', label: 'Web app' }, { id: 'gate', label: 'ShiftGate' }, { id: 'sh', label: 'StaffShifts' },
    { id: 'ctl', label: 'Any Staff endpoint' }, { id: 'act', label: 'StaffActivityService' }, DB,
  ], [
    msg('sf', 'ui', 'a change, e.g. confirm a door code'),
    msg('ui', 'gate', 'POST /door-codes/{room}/confirm'),
    msg('gate', 'sh', 'StaffShifts.nowOf(user): in this week\'s shift? handles this kind of work?'),
    alt('outside the shift or not their kind of work, not acknowledged'),
    reply('gate', 'ui', '428 SHIFT_CONFIRM_REQUIRED (details)'),
    msg('sf', 'ui', 'confirm'),
    msg('ui', 'gate', 'same request with X-Shift-Acknowledged: true'),
    end,
    msg('gate', 'ctl', 'the request runs'),
    msg('gate', 'act', 'ShiftGate.afterCompletion → StaffActivityService.record'),
    msg('act', 'db', 'INSERT auth_staff_activity (own transaction)'),
  ]),
]

// The page each actor works on in a sequence (the web route's screen, or the Android screen). An actor only talks to
// its page; the page calls the API (UML: actor → Page → controller → service → data access).
const PAGES = {
  'seq-01-google-sign-in': { st: 'Sign-in Page' },
  'seq-02-apply-with-deposit': { st: 'Application Wizard Page' },
  'seq-03-roommate-invitation': { a: 'Application Wizard Page', b: 'Roommate Invitation Page' },
  'seq-04-payment-claim': { st: 'Invoice Payment Page', mg: 'Payment Confirmations Page' },
  'seq-05-assignment-run': { mg: 'Assignment Page' },
  'seq-06-round2-offer': { mg: 'Assignment Page', st: 'Round 2 Offer Page' },
  'seq-07-check-in-handover': { st: 'Check-in Inventory Page', sf: 'Check-in Inventories Page' },
  'seq-08-door-code-release': { mg: 'Payment Confirmations Page', sf: 'Door Codes Page', st: 'My Room Page' },
  'seq-09-maintenance-routing-sla': { st: 'New Maintenance Request Page', sf: 'Maintenance Page' },
  'seq-10-inspection-run': { sf: 'Inspections Page' },
  'seq-11-room-change': { st: 'New Room Change Page', sf: 'Room Changes Page' },
  'seq-12-swap': { a: 'Swap Board Page', b: 'Swap Invitation Page', sf: 'Swaps Page', mg: 'Swaps Page' },
  'seq-13-term-wizard-publish': { mg: 'Registration-period Requests Page', ad: 'Term Wizard Page' },
  'seq-14-renewal-next-term-fee': { st: 'Requests Page', mg: 'Term Transition Page' },
  'seq-15-utility-meter-invoice': { sf: 'Meter Readings Page', st: 'Payments Page' },
  'seq-16-termination': { mg: 'Terminations Page', st: 'My Room Page', sf: 'Check-out Desk Page' },
  'seq-17-reconciliation': { mg: 'Reconciliation Page' },
  'seq-18-family-day': { mg: 'Family Days Page', st: 'Family Day Page', sf: 'Family Day Desk Page' },
  'seq-19-ai-assistant': { st: 'Assistant Chat Panel' },
  'seq-20-push-notification': {},
  'seq-21-staff-shift-gate': { sf: 'Staff Page (any change)' },
}

/** One sequence in UML form: a page per actor in place of "Web / mobile app", every object named ":Name". */
export function normalizeSequence(s, pages) {
  const actors = new Set(s.participants.filter((p) => p.actor).map((p) => p.id))
  const page = (a) => (pages[a] ? `pg_${a}` : null)
  const participants = []
  for (const p of s.participants) {
    if (p.id === 'ui') continue
    if (p.actor) {
      participants.push(p)
      if (pages[p.id] && !participants.some((q) => q.label === `:${pages[p.id]}`)) participants.push({ id: `pg_${p.id}`, label: `:${pages[p.id]}` })
      continue
    }
    participants.push({ ...p, label: p.id === 'db' ? ':JdbcClient (PostgreSQL)' : `:${p.label}` })
  }
  // Two actors sharing a page (Staff and Manager on the swaps page) use the first one's lifeline.
  const shared = new Map(Object.entries(pages).map(([a, l]) => [a, `pg_${Object.keys(pages).find((b) => pages[b] === l)}`]))
  const pg = (a) => (page(a) ? shared.get(a) : null)
  let cur = [...actors][0]
  const items = []
  for (const it of s.items) {
    if (it.type === 'note') { items.push({ ...it, over: it.over.map((o) => (o === 'ui' ? pg(cur) ?? o : o)) }); continue }
    if (it.type !== 'msg') { items.push(it); continue }
    if (actors.has(it.from)) cur = it.from
    let { from, to } = it
    if (from === 'ui') from = pg(cur)
    if (to === 'ui') to = pg(cur)
    if (actors.has(from) && pg(from) && to !== pg(from)) {
      // The actor acts on the page; the page makes the call.
      const verb = /^GET\b/.test(it.text) ? 'Opens the page' : /^(POST|PUT|PATCH|DELETE)\b/.test(it.text) ? 'Submits the form' : it.text
      items.push({ ...it, from, to: pg(from), text: verb })
      from = pg(from)
    }
    if (actors.has(to) && pg(to) && from !== pg(to)) to = pg(to)
    items.push({ ...it, from, to })
  }
  return { ...s, participants, items }
}

export const sequences = rawSequences.map((s) => normalizeSequence(s, PAGES[s.name.split('/')[1]] ?? {}))


// Activity diagrams with swimlanes: nodes [id, lane, label, shape?], edges [from, to, guard?]; 'i' / 'f1', 'f2' … are
// the initial and final nodes.
const activity = (name, title, lanes, nodes, edges) => ({
  name: `09_Activity/${name}`, kind: 'activity', title,
  groups: lanes.map(([id, label]) => ({ id, label })),
  nodes: nodes.map(([id, parent, label, shape]) => ({ id, parent, label: label ?? '', shape: shape ?? (id === 'i' ? 'initial' : /^f\d+$/.test(id) ? 'final' : 'action') })),
  edges: edges.map(([from, to, label]) => ({ from, to, ...(label ? { label } : {}) })),
})

export const activities = [
  activity('act-01-registration', 'Registration: apply, pay, review, assign', [['st', 'Student'], ['mg', 'Manager'], ['sys', 'System']], [
    ['i', 'st'], ['apply', 'st', 'Fill in the Application (Term, Room Type, Room Class, roommate)'],
    ['elig', 'sys', 'Eligible?', 'decision'], ['dep', 'sys', 'Create the Application (Awaiting Deposit) and the Deposit Invoice'],
    ['pay', 'st', 'Transfer the Deposit and claim it'], ['conf', 'mg', 'Money arrived?', 'decision'],
    ['submit', 'sys', 'Submit the Application'], ['rej', 'sys', 'Claim rejected: pay again'], ['exp', 'sys', 'Deposit due time passed: Expired'],
    ['review', 'mg', 'Review: approve or reject'], ['run', 'mg', 'Run the assignment, resolve conflicts, approve'],
    ['alloc', 'sys', 'Allocations and Balance Invoices'], ['wait', 'sys', 'Waitlisted: Round 2 offer later'], ['f1', 'st'], ['f2', 'st'], ['f3', 'sys'], ['f4', 'sys'],
  ], [
    ['i', 'apply'], ['apply', 'elig'], ['elig', 'f1', 'not eligible'], ['elig', 'dep', 'eligible'], ['dep', 'pay'], ['dep', 'exp', 'not paid in time'], ['exp', 'f3'],
    ['pay', 'conf'], ['conf', 'submit', 'yes'], ['conf', 'rej', 'no'], ['rej', 'pay'], ['submit', 'review'], ['review', 'f2', 'rejected'], ['review', 'run', 'approved'],
    ['run', 'alloc', 'Bed found'], ['run', 'wait', 'no Bed'], ['alloc', 'f4'], ['wait', 'f4'],
  ]),

  activity('act-02-term-opening', 'Opening a Term', [['mg', 'Manager'], ['ad', 'Admin']], [
    ['i', 'mg'], ['req', 'mg', 'Request a registration period (dates, Blocks, prices)'], ['check', 'ad', 'Request complete?', 'decision'],
    ['fix', 'mg', 'Change and resubmit'], ['rej', 'ad', 'Reject (reason)'], ['draft', 'ad', 'Create the Term draft from the request'],
    ['steps', 'ad', 'Wizard: timeline, Blocks, prices, Deposit, rules, documents'], ['ok', 'ad', 'Milestones valid?', 'decision'],
    ['pub', 'ad', 'Publish: prices and rules fixed, request Done'], ['f1', 'ad'], ['f2', 'ad'],
  ], [
    ['i', 'req'], ['req', 'check'], ['check', 'fix', 'needs changes'], ['fix', 'check'], ['check', 'rej', 'rejected'], ['rej', 'f1'], ['check', 'draft', 'yes'],
    ['draft', 'steps'], ['steps', 'ok'], ['ok', 'steps', 'no'], ['ok', 'pub', 'yes'], ['pub', 'f2'],
  ]),

  activity('act-03-term-transition', 'Term transition: renewal, requests, fees, turnover', [['st', 'Student'], ['sf', 'Staff'], ['mg', 'Manager'], ['job', 'System jobs']], [
    ['i', 'job'], ['open', 'job', 'M2: next-Term Allocation on the same Bed for every resident not leaving'],
    ['choose', 'st', 'Stay, extend, change Room, swap or leave?', 'decision'], ['ext', 'st', 'Ask to extend / end the stay'],
    ['chg', 'st', 'Room-change or swap request'], ['dec', 'sf', 'Decide the requests in their Blocks'], ['close', 'job', 'M3: filing closed'],
    ['recon', 'mg', 'Reconcile the enrolled list'], ['fee', 'mg', 'Issue the next-Term fees'], ['paid', 'st', 'Fee paid by M7?', 'decision'],
    ['cancel', 'job', 'M7: cancel the next-Term Allocation, release the Bed'], ['turn', 'sf', 'Turnover week: meter cuts, check-out, check-in'], ['f1', 'sf'], ['f2', 'job'],
  ], [
    ['i', 'open'], ['open', 'choose'], ['choose', 'ext', 'stay or leave'], ['choose', 'chg', 'move'], ['choose', 'close', 'keep the Bed'], ['ext', 'dec'], ['chg', 'dec'], ['dec', 'close'],
    ['close', 'recon'], ['recon', 'fee'], ['fee', 'paid'], ['paid', 'turn', 'yes'], ['paid', 'cancel', 'no'], ['cancel', 'f2'], ['turn', 'f1'],
  ]),

  activity('act-04-maintenance', 'Maintenance Request', [['st', 'Student'], ['sys', 'System'], ['sf', 'Staff'], ['mg', 'Manager']], [
    ['i', 'st'], ['rep', 'st', 'Report (category, urgency, photos, furniture item)'], ['route', 'sys', 'SLA due time from the Block\'s timer'],
    ['rule', 'sys', 'Routing rule matches?', 'decision'], ['assign', 'sys', 'Assign the rule\'s Staff'], ['queue', 'sf', 'Take it from the Block queue'],
    ['work', 'sf', 'Work: In progress, then Resolved'], ['sla', 'sys', 'SLA passed while open?', 'decision'], ['esc', 'mg', 'Escalation: reassign or handle'],
    ['conf', 'st', 'Fixed?', 'decision'], ['closed', 'sys', 'Closed'], ['reopen', 'sys', 'Reopened'], ['f1', 'sys'],
  ], [
    ['i', 'rep'], ['rep', 'route'], ['route', 'rule'], ['rule', 'assign', 'yes'], ['rule', 'queue', 'no'], ['assign', 'work'], ['queue', 'work'],
    ['work', 'sla'], ['sla', 'esc', 'yes'], ['esc', 'work'], ['sla', 'conf', 'no'], ['conf', 'closed', 'yes'], ['conf', 'reopen', 'no'], ['reopen', 'work'], ['closed', 'f1'],
  ]),

  activity('act-05-utility-billing', 'Utility billing', [['sf', 'Staff'], ['sys', 'System'], ['st', 'Student']], [
    ['i', 'sf'], ['cut', 'sf', 'Meter cut when a resident moves in or out'], ['read', 'sf', 'Enter or import the month\'s readings'],
    ['odd', 'sys', 'Reading unusual?', 'decision'], ['chk', 'sf', 'Check the value'], ['conf', 'sf', 'Confirm the readings'], ['closep', 'sf', 'Close the period'],
    ['split', 'sys', 'Split each Room\'s use by time and residents; issue Utility Invoices'], ['pay', 'st', 'Paid?', 'decision'], ['warn', 'sys', 'Warnings; at the last level, termination'],
    ['f1', 'st'], ['f2', 'sys'],
  ], [
    ['i', 'cut'], ['cut', 'read'], ['read', 'odd'], ['odd', 'chk', 'yes'], ['chk', 'conf'], ['odd', 'conf', 'no'], ['conf', 'closep'], ['closep', 'split'], ['split', 'pay'],
    ['pay', 'f1', 'yes'], ['pay', 'warn', 'no'], ['warn', 'f2'],
  ]),

  activity('act-06-check-in-out', 'Check-in and check-out with the hand-over', [['st', 'Student'], ['sf', 'Staff']], [
    ['i', 'st'], ['code', 'st', 'Balance paid: door code released, move in'], ['report', 'st', 'Hand-over report: item conditions, photos, meters'],
    ['match', 'sf', 'Matches the baseline?', 'decision'], ['visit', 'sf', 'Visit and verify on site'], ['final', 'sf', 'Hand-over final'],
    ['live', 'st', 'Live in the Room'], ['out', 'sf', 'Check-out: conditions, damages, meter readings'], ['agree', 'st', 'Agree to the charges?', 'decision'],
    ['review', 'sf', 'A Manager keeps or drops the charges'], ['settle', 'sf', 'Settle: refund of the Utility Deposit less charges'], ['f1', 'sf'],
  ], [
    ['i', 'code'], ['code', 'report'], ['report', 'match'], ['match', 'final', 'yes'], ['match', 'visit', 'no'], ['visit', 'final'], ['final', 'live'], ['live', 'out'],
    ['out', 'agree'], ['agree', 'settle', 'yes'], ['agree', 'review', 'no'], ['review', 'settle'], ['settle', 'f1'],
  ]),

  activity('act-07-family-day', 'Family Day', [['st', 'Student'], ['sf', 'Staff gate']], [
    ['i', 'st'], ['reg', 'st', 'Register guests for a time slot'], ['place', 'st', 'Places left?', 'decision'], ['pass', 'st', 'Passes sent to the guests'],
    ['verify', 'sf', 'Scan the pass, check identity'], ['in', 'sf', 'Check the guest in'], ['late', 'sf', 'Past the slot?', 'decision'],
    ['remind', 'sf', 'Remind the student'], ['safe', 'st', 'Confirm the guest is safe'], ['out', 'sf', 'Check the guest out'], ['f1', 'st'], ['f2', 'sf'],
  ], [
    ['i', 'reg'], ['reg', 'place'], ['place', 'f1', 'no'], ['place', 'pass', 'yes'], ['pass', 'verify'], ['verify', 'in'], ['in', 'late'], ['late', 'out', 'no'],
    ['late', 'remind', 'yes'], ['remind', 'safe'], ['safe', 'out'], ['out', 'f2'],
  ]),

  activity('act-08-staff-week', 'Staff week schedule', [['mg', 'Manager'], ['sf', 'Staff']], [
    ['i', 'mg'], ['remind', 'mg', 'Reminder on the day and hour Admin set'], ['plan', 'mg', 'Plan next week\'s shifts per person'],
    ['send', 'mg', 'Send the week\'s schedule'], ['see', 'sf', 'See my week'], ['work', 'sf', 'A change at work'], ['in', 'sf', 'In my shift and kind of work?', 'decision'],
    ['ack', 'sf', 'Confirm working outside the shift'], ['done', 'sf', 'Change saved and recorded'], ['f1', 'sf'],
  ], [
    ['i', 'remind'], ['remind', 'plan'], ['plan', 'send'], ['send', 'see'], ['see', 'work'], ['work', 'in'], ['in', 'done', 'yes'], ['in', 'ack', 'no'], ['ack', 'done'], ['done', 'f1'],
  ]),
]

const graph = (name, kind, title, dir, nodes, edges, groups) => ({
  name, kind, title, dir, groups,
  nodes: nodes.map(([id, label, shape, parent]) => ({ id, label, shape: shape ?? 'round', ...(parent ? { parent } : {}) })),
  edges: edges.map(([from, to, label, dashed, arrow]) => ({ from, to, ...(label ? { label } : {}), ...(dashed ? { dashed: true } : {}), ...(arrow ? { arrow } : {}) })),
})

// External systems: AuthProperties / GoogleIdTokenVerifier (Google), FcmPushSender, MailProperties (SMTP),
// PaymentProperties (VietQR image), AssistantProperties (Ollama), infra/prod (Vercel, Azure VM, managed PostgreSQL).
// Context diagram: every external entity is a rectangle; each flow is named by the data it carries (a noun), in both
// directions where data goes both ways.
export const context = graph('01_Context/context', 'flow', 'System context: CampusStay FPT', 'LR', [
  ['student', 'Student', 'rect'], ['staff', 'Staff', 'rect'], ['manager', 'Manager', 'rect'], ['admin', 'Admin', 'rect'], ['guest', 'Family Day guest', 'rect'],
  ['cs', 'CampusStay FPT\n(web app, student mobile app, API)', 'menu'],
  ['google', 'Google Sign-In\n(@fpt.edu.vn accounts)', 'rect'], ['fcm', 'Firebase Cloud Messaging\n(push to Android)', 'rect'],
  ['smtp', 'Email server (SMTP)', 'rect'], ['qr', 'VietQR image service\n(bank transfer QR)', 'rect'], ['bank', 'Bank\n(student transfers; Managers check the statement)', 'rect'],
  ['ai', 'Ollama\n(AI assistant model)', 'rect'], ['school', 'FPT University\n(enrolled-student list file)', 'rect'],
], [
  ['student', 'cs', 'application, payment claim, requests'], ['cs', 'student', 'invoices, allocation, notifications'],
  ['staff', 'cs', 'readings, inspections, desk records'], ['cs', 'staff', 'work queue, weekly schedule'],
  ['manager', 'cs', 'decisions, payment confirmations'], ['cs', 'manager', 'reports, pending approvals'],
  ['admin', 'cs', 'Terms, prices, settings'], ['cs', 'admin', 'audit log, dashboards'],
  ['cs', 'guest', 'guest pass'], ['guest', 'cs', 'pass at the desk'],
  ['cs', 'google', 'authorization code'], ['google', 'cs', 'identity token'],
  ['cs', 'fcm', 'push message'], ['cs', 'smtp', 'email message'],
  ['cs', 'qr', 'transfer details'], ['qr', 'cs', 'QR image'],
  ['cs', 'ai', 'question with the student\'s data'], ['ai', 'cs', 'answer'],
  // Laid out on the right with the other systems; the arrow (drawn at the source) shows the list coming in.
  ['student', 'bank', 'bank transfer', true], ['cs', 'school', 'enrolled-student list (uploaded by a Manager)', true, 'start'],
])

// Deployment architecture: a request and its response share one two-headed line ("request / response"); the browser and the Android app call the third parties they
// use directly (Google Sign-In, the VietQR image, Firebase push), the API the rest.
export const architecture = graph('03_Architecture/architecture', 'flow', 'Deployment architecture', 'LR', [
  ['browser', 'Browser\n(Student, Staff, Manager, Admin)', 'rect', 'client'], ['android', 'Android app\n(Flutter, students)', 'rect', 'client'],
  ['vercel', 'React + Vite web app\n(static build)', 'round', 'vercel'],
  ['caddy', 'Caddy\n(HTTPS, reverse proxy)', 'round', 'vm'], ['api', 'Spring Boot API\n(Java 21, /api)', 'round', 'vm'],
  ['files', 'File storage\n(volume api-files: receipts, photos)', 'cylinder', 'vm'],
  ['pg', 'Azure Database for PostgreSQL\n(Flyway migrations)', 'cylinder', 'azure'],
  ['gh', 'GitHub Actions\n(mvn verify, image to GHCR, deploy over SSH)', 'rect', 'ci'],
  ['google', 'Google Sign-In', 'rect', 'ext'], ['qr', 'VietQR image service', 'rect', 'ext'], ['fcm', 'Firebase Cloud Messaging', 'rect', 'ext'],
  ['smtp', 'Email server (SMTP)', 'rect', 'ext'], ['ollama', 'Ollama (AI model)', 'rect', 'ext'],
], [
  ['browser', 'vercel', 'HTTPS: page / HTML, JavaScript', false, 'both'],
  ['browser', 'caddy', 'HTTPS: REST request / JSON response', false, 'both'],
  ['android', 'caddy', 'HTTPS: REST request / JSON response', false, 'both'],
  ['caddy', 'api', 'HTTP request / response', false, 'both'],
  ['api', 'pg', 'SQL (JDBC) / rows', false, 'both'],
  ['api', 'files', 'write / read files', false, 'both'],
  ['browser', 'google', 'sign-in popup / authorization code', false, 'both'],
  ['android', 'google', 'Google Sign-In / ID token', false, 'both'],
  ['api', 'google', 'code exchange, token check / identity', false, 'both'],
  ['browser', 'qr', 'QR image request / image', false, 'both'],
  ['api', 'fcm', 'push request'], ['fcm', 'android', 'push message'],
  ['api', 'smtp', 'email (SMTP)'], ['api', 'ollama', 'question / answer', false, 'both'],
  ['gh', 'api', 'deploy', true],
], [
  { id: 'client', label: 'Clients' }, { id: 'vercel', label: 'Vercel' }, { id: 'vm', label: 'Azure VM (Docker Compose, /opt/campusstay)' },
  { id: 'azure', label: 'Azure' }, { id: 'ci', label: 'CI/CD' }, { id: 'ext', label: 'Third-party services' },
])

export const drawn = [...sequences, ...activities, context, architecture]
