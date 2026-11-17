# Report 4 §3.10: Business rules enforced by the system

The catalogue of Report 4 (Software Design Document), section 3.10: 137 rules written from the backend code
(`backend/src/main/java`): every place a service refuses an action (`ApiException` with its error code, 162 codes),
the field checks that carry a business limit and the 11 scheduled jobs. Pure input-format checks ("Choose a value from
the list", maximum text lengths) are left out. Dotted names such as `stay.max_terms` are Admin settings; fixed limits
are written as numbers. The database constraints behind these rules are listed in section 2.1 of the report.

## Accounts, sign-in and access (AUTH)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-AUTH-01 | Sign-in is by email and password or by Google. An unknown email and a wrong password get the same answer in about the same time (no account enumeration). | SignInService |
| BR-AUTH-02 | After 5 failed password attempts (campusstay.auth.max-failed-attempts) the account is locked for 15 minutes (lock-duration); the lock and each failure are written to the Audit Log. | AccountStore · ACCOUNT_LOCKED / SIGN_IN_FAILED |
| BR-AUTH-03 | A disabled account cannot sign in or reset its password; a student account whose verification was rejected cannot sign in and is told the reason. | SignInService, PasswordService · ACCOUNT_DISABLED, ACCOUNT_REJECTED |
| BR-AUTH-04 | Google sign-in accepts only a verified Google ID token of the FPT Workspace domain (hd claim, not the email text); the token must be signed by Google, issued for CampusStay and not expired. | GoogleIdTokenVerifier · GOOGLE_DOMAIN_NOT_ALLOWED |
| BR-AUTH-05 | An account linked to one Google account cannot be used with another; the fictional demo accounts sign in only with their password, never with Google. | SignInService, StudentSignUp · GOOGLE_ACCOUNT_MISMATCH, GOOGLE_NOT_FOR_DEMO |
| BR-AUTH-06 | When Google sign-in is not configured or Google does not answer, it is refused with 503 and the user may sign in with email and password. | GoogleCodeExchanger · GOOGLE_SIGN_IN_DISABLED, GOOGLE_UNAVAILABLE |
| BR-AUTH-07 | Sessions are opaque bearer tokens; only their SHA-256 is stored. Idle timeout 12 hours (30 days with Remember me), never beyond 30 days after sign-in; sessions ended more than 30 days ago are purged daily at 03:15. | SessionService |
| BR-AUTH-08 | A password has 8 to 64 characters with at least one letter and one number and must not contain the email name. | PasswordPolicy · WEAK_PASSWORD |
| BR-AUTH-09 | Changing a password needs the current password; an account that already has a password cannot use the first-password link; reset and invitation links work once and expire; at most 3 reset emails per hour. | PasswordService · WRONG_PASSWORD, PASSWORD_ALREADY_SET, LINK_INVALID |
| BR-AUTH-10 | An account without a password (created by Google sign-up) must set one, and a student without a directory record must send the sign-up form, before any other action. | AccountSetupGate · PASSWORD_REQUIRED, PROFILE_REQUIRED |
| BR-AUTH-11 | The first Google sign-in of an unknown @fpt.edu.vn address creates a student account; when the address ends with an imported student code whose account is unused, that account is linked and Verified, otherwise it waits for the sign-up form. | StudentSignUp |
| BR-AUTH-12 | A student who signed up sends the directory fields once and waits for a Manager; while Pending the form can be corrected, once Verified it is locked; a student code belongs to one account only. | StudentVerificationService · ALREADY_VERIFIED |
| BR-AUTH-13 | A Manager verifies or rejects only accounts that are Pending verification; locking applies only to an unlocked account and unlocking only to a locked one; the reason is required (at most 500 characters). | StudentAccountService · NOT_PENDING, ALREADY_LOCKED, NOT_LOCKED, NO_PROFILE |
| BR-AUTH-14 | The student code cannot change once the account is verified and cannot be taken from another account. | StudentAccountService |
| BR-AUTH-15 | Student list import (CSV/XLSX, at most 10,000 lines): preview first (New, Update, Unchanged, Error), then confirm; lines match on the student code; missing columns are left unchanged; a file is applied once; fictional demo accounts are never matched or marked; every import is audited without personal data. | StudentImportService, StudentListFile · IMPORT_APPLIED |
| BR-AUTH-16 | Back-office accounts (Staff, Manager, Admin) are invited by email and become Active when the person sets a password; an Active account cannot return to Invited; an email belongs to one account and cannot be changed. | AdminUserService, StaffAccountService · ALREADY_ACTIVE, INVITE_PENDING, NOT_INVITED |
| BR-AUTH-17 | At least one active Admin must remain, and an Admin cannot remove their own Admin access or disable their own account. | AdminUserService · LAST_ADMIN, OWN_ACCOUNT |
| BR-AUTH-18 | Managers create and disable Staff accounts and choose their Blocks; Managers and Admins are managed only by the Admin. | StaffAccountService, AdminUserService |
| BR-AUTH-19 | Block scope: Staff and Managers see and change only the records of their assigned Blocks; a back-office user with no Block is refused; a record without a Bed (Application, Deposit) belongs to the Blocks of the student's gender. | BlockScope · BLOCK_OUT_OF_SCOPE, NO_BLOCK |
| BR-AUTH-20 | Every endpoint checks the caller's role and permission; a student only reads their own records (another student's code answers 404). | CurrentUser, BlockScope · FORBIDDEN |
| BR-AUTH-21 | A student keeps at most student.emergency_contacts_max emergency contacts; the first one is mirrored for Applications and the eligibility check. | StudentContactService · EMERGENCY_CONTACTS_FULL |
| BR-AUTH-22 | Refunds are paid to the bank account the student entered (6 to 20 digits, a listed Vietnamese bank); the student confirms that the account is theirs; a Manager cannot transfer a refund before the account is entered. | RefundAccountService |
| BR-AUTH-23 | Enrollment reconciliation of a Term: an enrolled list or a leavers list is compared with residents, continuing residents and applicants; "Not enrolled" cancels the next-Term Allocation, rejects the Application or terminates the stay; an item is resolved once, with an audited note. | ReconciliationService · ALREADY_RESOLVED |

## Settings, Terms and registration periods (CFG)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-CFG-01 | A Manager asks the Admin to open a Term (registration-period request); only one open request per Term name, and none for a name already published. | TermRequestService · TERM_REQUEST_OPEN, TERM_EXISTS |
| BR-CFG-02 | Only the requesting Manager edits the request, only while it is Submitted or Needs changes; the Admin takes a Submitted request In progress, sends it back, rejects it with a reason, or builds the Term from it; a closed request cannot change. | TermRequestService · NOT_REQUESTER, REQUEST_LOCKED, REQUEST_NOT_SUBMITTED, REQUEST_NOT_BUILDABLE, REQUEST_CLOSED |
| BR-CFG-03 | A Term built from a request needs a reason for every value that differs from the request. | TermWizardService, TermDifferences |
| BR-CFG-04 | Timeline (spec §5.2): registration closes after it opens; results come after registration closes and on or after the decision deadline; check-in ends on or after it starts and before the stay ends; check-out is after the stay starts; check-in starts on or after the check-out day of the Term before. | TermTimelines |
| BR-CFG-05 | Renewal milestones: M1 ≤ M2 < M3 < M4 ≤ M5 ≤ M6 < M7 < the end of the Term before; they need a Term before and are filled all together or not at all; the requests window cannot open before the Term is published. | TermTimelines, TermWizardService |
| BR-CFG-06 | Published Terms cannot overlap (also the database exclusion ex_term_no_overlap); a Term is published once. | TermWizardService, AdminTermService · TERM_OVERLAP, TERM_ALREADY_PUBLISHED |
| BR-CFG-07 | Publishing fixes the Term's price table (missing lines take the default price), Deposit rate, Utility Deposit, eligibility switches, priority-group order, matching snapshot and offered Room Types/Classes. A Term is published only when the Review step's checks pass (General and Timeline valid, every wizard step saved, a reason for each value changed from the Manager's request). | TermWizardService · TERM_NOT_READY, RULES_FIXED |
| BR-CFG-08 | After publication a passed date is fixed, an open deadline only moves later, the stay dates cannot change once the stay started, and money is locked once any Invoice of the Term exists; every change needs a reason (at most 500 characters) and becomes a change announcement to students. | TermWizardService · PRICES_LOCKED |
| BR-CFG-09 | A Term that has ended can no longer be changed. | TermWizardService, AdminTermService · TERM_CLOSED |
| BR-CFG-10 | Term price per Bed = Room Type base price × (1 + Room Class surcharge); prices are whole VND above 0, surcharges 0 % to 500 %, Deposit rate above 0 and up to 100 %, places 0 to 100,000 per line, reserved-for-new share 0 to 100 %. | AdminCatalogService, TermWizardService, TermRequestService |
| BR-CFG-11 | An Application keeps the price it was submitted with; catalog changes never alter issued Invoices. | AdminCatalogService, StudentCatalogService |
| BR-CFG-12 | A Room Type has 1 to 12 Beds; its Bed count cannot change while Rooms of the type hold active Allocations; only 2-bed Room Types may allow a mutual roommate invitation; names are unique. | AdminCatalogService · ROOM_TYPE_IN_USE |
| BR-CFG-13 | Fee policy: Deposit window 1 to 720 hours, Balance due 1 to 365 days; Utility: price per kWh 1 to 100,000 VND, per m³ 1 to 1,000,000 VND, reading day 1 to 28, Utility Deposit = estimate × 2 to 12 months held; changes apply from the next billing period. | AdminPolicyService, AdminUtilityService |
| BR-CFG-14 | Matching criteria are immutable snapshots (v1, v2 …): weights in use total 100 %, each 0 to 100 %, at least one criterion, boost 1 to 5; every assignment run records the snapshot it used. | MatchingService |
| BR-CFG-15 | Block settings: visitor and quiet hours must stay inside the Admin limits (block.*) and end after they start. | BlockSettingsService |
| BR-CFG-16 | Every saved setting is written to the Audit Log and announced to all students (old → new values). | AdminSettingsService, RegistrationPeriodListener |
| BR-CFG-17 | The demo reset runs only when DEMO_TOOLS=true, needs the base data, and loads stages 0, A, B or C in one transaction with one Audit Log entry. | DemoResetService · DEMO_TOOLS_OFF, DEMO_BASE_DATA_MISSING, DEMO_STAGE_NEEDED |

## Inventory, Room Classes, furniture and door codes (INV)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-INV-01 | A Block houses one gender; its gender cannot change and it cannot become Inactive while students live in it; its code is fixed. | AdminBuildingService · BLOCK_IN_USE |
| BR-INV-02 | Bulk Room generation needs an active Room Type and Room Class, only adds missing Rooms (codes <Block>-<Floor><nn>), and skips Floors where an Allocation holds a Bed. | AdminBuildingService · NO_ROOM_TYPE, NO_ROOM_CLASS |
| BR-INV-03 | A Room goes out of service only when no active Allocation holds one of its Beds (Beds are locked first), and only if it is in service; it returns to service only if it is out of service. | InventoryService · ROOM_OCCUPIED, ROOM_ALREADY_OUT_OF_SERVICE, ROOM_IN_SERVICE |
| BR-INV-04 | A Room's Room Class is set per Term, only for a Term whose stay has not started; a Room whose Beds are already promised in that Term or later keeps its class there (the change applies from a later Term, so no price gap arises). | RoomClassService · TERM_STARTED, ROOM_CLASS_LOCKED |
| BR-INV-05 | Furniture conformance: a Room matches its class when it has at least the required class-defining items and no more; items In use, Broken or In repair count, items in a store or disposed do not. | RoomConformance |
| BR-INV-06 | A Room Class change needs the missing class-defining items free in the Block store; they are then reserved. | JdbcRoomClassChanges · FURNITURE_MISSING |
| BR-INV-07 | A furniture type required by a Room Class stays active and class-defining; its code is fixed once created; requirements list each type once with a quantity 1 to 20. | AdminFurnitureService · TYPE_REQUIRED |
| BR-INV-08 | A disposed item cannot change; an item has at most one planned move; it cannot move where it already is; In use needs a Room and In store needs a store; Staff move items only inside their Blocks and only a Manager moves them to another Block. | FurnitureService · ITEM_DISPOSED, MOVE_PLANNED, SAME_LOCATION, MOVE_CLOSED, CROSS_BLOCK |
| BR-INV-09 | Door codes are 6 digits per Room, stored encrypted (AES-256-GCM); without the server key every door-code operation is refused with 503; every view of a code is audited. | DoorCodeCipher, DoorCodeService · DOOR_CODES_DISABLED |
| BR-INV-10 | A door code is proposed, set on the lock, then confirmed; only a proposed code can be confirmed; residents are told a new code exists (never the code). | DoorCodeService · NO_PROPOSED_CODE |
| BR-INV-11 | Whenever a resident leaves a Room (check-out or move) a rotation task opens in the same transaction and the Block's Staff are told; further departures join the open task. | DoorCodeRotation |
| BR-INV-12 | A student sees the door code only after it is released (BR-ASG-06); before that the request is refused. | DoorCodeService · DOOR_CODE_NOT_READY |

## Applications, eligibility and Round 2 (APP)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-APP-01 | A student applies only while a Term is open for registration and only for a Room Type × Room Class the Term offers. | ApplicationService · REGISTRATION_CLOSED |
| BR-APP-02 | Eligibility: student record exists, account verified, not already a continuing resident of the Term, plus every criterion the Admin switched on (enrolled, one live Application per Term, no overdue Invoice, a Block open for the gender); contact details are completed in the wizard. | EligibilityService · NOT_ELIGIBLE, NO_STUDENT_RECORD |
| BR-APP-03 | The stay length is 1 to stay.max_terms Terms, capped by the semesters the student has left; phone numbers have 8 to 15 digits; both consent boxes must be ticked. | EligibilityService, ApplicationService |
| BR-APP-04 | Creating an Application issues its Deposit Invoice (Term Deposit rate × price); unpaid within the Deposit window the Application expires. | ApplicationService, ApplicationExpiryJob |
| BR-APP-05 | A roommate can be invited only for a 2-bed Room Type; the invited code must be another enrolled student of the same gender with no live Application of the Term; every unusable code gets the same answer; checks per Term are limited (application.roommate_check_attempts). | ApplicationService · ROOMMATE_CHECKS_EXHAUSTED |
| BR-APP-06 | The invited student accepts within the roommate window and pays their own Deposit; whoever pays first waits as Awaiting Roommate; both become Submitted when both paid; a declined, expired or cancelled partner turns the other Application into "match me automatically"; a closed invitation cannot be answered. | ApplicationService · INVITATION_CLOSED |
| BR-APP-07 | A student cancels only while the Application may still be cancelled, and not while a payment claim waits for a Manager. | ApplicationService · CANNOT_CANCEL, CLAIM_WAITING |
| BR-APP-08 | Staff and Managers review only Applications of their Blocks' genders and only while undecided; a rejection needs a note the student sees and is made one at a time. | ApplicationReviewService · ALREADY_DECIDED, BLOCK_OUT_OF_SCOPE |
| BR-APP-09 | Round 2: each Waitlisted student not flagged ineligible is offered up to 3 free Beds of other kinds (one per Room Type and Class, nearest price first, partly filled Rooms first); the Beds are held for round2.offer_hours. | Round2Offers |
| BR-APP-10 | An offer is answered once, while open: accepting allocates the Bed at the option's Term price and issues the Balance; declining or letting it expire cancels the Application and refunds the paid Deposit after a Manager approves. | Round2Service · OFFER_CLOSED |
| BR-APP-11 | Only a Waitlisted Application can be withdrawn; waitlists end when the Term's check-in starts. | Round2Service · NOT_WAITLISTED |

## Assignment, check-in, residence and termination (ASG)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-ASG-01 | The engine is deterministic: not enrolled or an overdue Invoice → NOT_ELIGIBLE; order by priority group then Deposit time; invited pairs first into an empty 2-bed Room; others into the best-fit free Bed of their Room Type and Class in a Block of their gender; no Bed → NO_BED, partner not ready → PARTNER_NOT_READY, low fit → LOW_FIT. | AssignmentEngine |
| BR-ASG-02 | A run cannot start while a Round-1 proposal of the Term is in review, while another run is partly committed, while next-Term requests are open or can still be filed. | AssignmentService · ASSIGNMENT_IN_REVIEW, RUN_PARTLY_COMMITTED, RENEWAL_REQUESTS_OPEN, RENEWAL_FILING |
| BR-ASG-03 | A dry run is a preview only; a closed run cannot change; a submitted Block cannot change; a Block is submitted only with no open conflict; a Manager approves or returns only a submitted Block (a return needs a comment). | AssignmentService · DRY_RUN, RUN_CLOSED, BLOCK_SUBMITTED, CONFLICTS_LEFT, NOT_SUBMITTED |
| BR-ASG-04 | Approving a Block commits its Allocations, Balance Invoices and notifications in one transaction; a Bed is held by one Allocation per Term (ux_alloc_bed_term) and a student by one (ux_alloc_student_term). | AssignmentService · BED_TAKEN, NO_BED_LEFT |
| BR-ASG-05 | Forfeit: an Allocation whose Balance is unpaid at its deadline, with no claim waiting and no approved late check-in running, is cancelled; the Balance is voided, the Deposit kept (refund rule "Balance not paid"); residents are never forfeited. | ForfeitService (every 5 min) |
| BR-ASG-06 | Door code release makes the student a resident: Balance (or next-Term fee) paid, the check-in start reached, and the Room's code confirmed with no change waiting; the first release starts the Stay; a terminated student past move-out is never released a code. | DoorCodeRelease (every 15 min) |
| BR-ASG-07 | Desk check-in needs the Bed allocated, the Balance and Utility Deposit paid, and today within the check-in window or an approved late check-in; once only; Staff work inside their Blocks; a name matching several students must be narrowed. | DeskService · CHECK_IN_BLOCKED, ALREADY_CHECKED_IN, MANY_MATCHES |
| BR-ASG-08 | Check-out happens once; it records the final meter readings (not below the last one), the Room key and each damaged item once; the Utility Deposit settles the final share and unpaid Utility Invoices. | DeskService, CheckOutSettlements · ALREADY_CHECKED_OUT |
| BR-ASG-09 | Late check-in: one per student per Term (online or at the desk), while the check-in period is open, with a reason, day and evidence (JPEG, PNG or PDF); a Manager approves a deadline at most late_check_in.max_days after check-in ends, or rejects with a reason; decided once. | LateCheckInService · LATE_REQUEST_EXISTS, LATE_REQUEST_CLOSED, ALREADY_DECIDED |
| BR-ASG-10 | An approved late check-in moves the arrival deadline; the Balance is still paid before check-in, its deadline moving only when the Manager chooses a day up to the arrival day. | LateCheckInService |
| BR-ASG-11 | Operational move: Staff (inside their Blocks) or a Manager move a student to a free Bed in another Room of the same Term for a recorded reason; between Blocks only a Manager; nothing is charged or refunded. | OperationalMoveService · BED_NOT_AVAILABLE, CROSS_BLOCK, NO_PRICE |
| BR-ASG-12 | After next-Term fees are issued only a Manager moves a student: an unpaid fee is voided and reissued for the new Bed; a paid fee allows only a Bed of the same price; not while a fee claim waits. | OperationalMoveService · MANAGER_DECIDES, PRICE_DIFFERS, CLAIM_WAITING |
| BR-ASG-13 | Termination (Utility debt, not enrolled, or a Manager's decision with a reason): notice sent → check-out by the move-out date (termination.move_out_days); cancelled by a Manager with a reason; past the date it becomes Overdue, Managers and Staff are told and the door code rotates. | TerminationService · ALREADY_TERMINATED, TERMINATION_CLOSED |
| BR-ASG-14 | At a terminated check-out the unused room fee is refunded by the refund rule (Termination default 0 %; Not enrolled configurable). | TerminationService |
| BR-ASG-15 | A stay is at most stay.max_terms Terms. | JdbcStays · STAY_TOO_LONG |

## Term transition: next-Term requests and fees (REQ, ASG)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-TRN-01 | At M2 every resident gets a next-Term Allocation on the same Bed (Continuing, or Awaiting extension in the Stay's last Term); at M3 those still awaiting extension are cancelled; Managers are alerted before M4; unpaid next-Term fees after M7 cancel their Allocation. | RenewalService (every 15 min) |
| BR-TRN-02 | Students file next-Term requests only between M2 and M3 and only when they hold a next-Term Bed; Staff and Managers decide until the next-Term fees are issued, after which next-Term Beds are frozen. | NextTermContext · NO_NEXT_TERM_BED, REQUESTS_CLOSED, NO_WINDOW, FEES_ISSUED |
| BR-TRN-03 | In the last Term of a Stay the student must ask for an extension before a room change, swap or Room Class change. | RoomChangeService, SwapService, RoomClassChangeService · EXTEND_FIRST |
| BR-TRN-04 | A student with an overdue Invoice cannot ask for a room change or a swap. | RoomChangeService, SwapService · OVERDUE_INVOICE |
| BR-TRN-05 | Room change: one open request per student per Term; the student chooses a kind (same, another class, another type), never a Bed; Staff decide moves inside their Block and a Manager across Blocks, choosing a free Bed; free Beds kept for new students cannot be used. | RoomChangeService · OPEN_REQUEST, CROSS_BLOCK, BED_NOT_AVAILABLE, RESERVED_FOR_NEW_STUDENTS |
| BR-TRN-06 | A request is decided once; it fails if the student no longer holds the Bed it was made from; a rejection needs a reason. | RoomChangeService, SwapService, StayRequestService · ALREADY_DECIDED, ALLOCATION_ENDED |
| BR-TRN-07 | Swap: two continuing residents of the same gender exchange next-Term Beds by invitation or board match; one waiting swap per student; the invitee accepts while open; Staff decide inside a Block, a Manager across Blocks; the checks (both hold their Beds, both continue, no overdue Invoice) must still pass; each pays the price of the Bed they get. | SwapService · OPEN_SWAP, INVITATION_CLOSED, NOT_A_MATCH, MANAGER_DECIDES, SWAP_CHECKS_FAILED |
| BR-TRN-08 | Room Class change of a Room: one waiting per Room; every other continuing resident must consent; Staff check the furniture and decide by M4; it fails if Beds were already given to new students at the current price; only an approved change can be set back, with a reason. | RoomClassChangeService · OPEN_REQUEST, CONSENT_MISSING, CONSENT_CLOSED, ROOM_CLASS_LOCKED, NOT_APPROVED |
| BR-TRN-09 | Extension adds 1 to 9 Terms within the stay limit; one waiting extension; approved at once when stay.auto_extension is on, the student is enrolled and owes nothing overdue, otherwise Staff decide; ending the stay before the deadline cancels the next-Term Allocation free of charge. | StayRequestService · OPEN_REQUEST |
| BR-TRN-10 | Bulk decisions: at most 200 requests at once, each in its own transaction so one failure does not undo the others. | NextTermRequestsService |
| BR-TRN-11 | Next-Term fees are issued once filing has closed, no next-Term request is open and the enrolled list is reconciled with no open item of groups 1–2, and not before the requests window opened; one Invoice per continuing resident = 100 % of the next Term's price of their Bed (no Deposit); leavers receive the end-of-stay notice. | NextTermFeeService · FEES_BLOCKED, WINDOW_NOT_OPEN |
| BR-TRN-12 | A next-Term fee cannot be paid while a Utility Invoice is overdue. | PaymentClaimService · UTILITY_OVERDUE |

## Billing, payment claims, refunds and Utility (BIL)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-BIL-01 | Invoice codes INV-<term>-<id> and transfer contents CSTAY<id> are unique; a student sees only their own Invoices. | JdbcBilling, StudentInvoiceService |
| BR-BIL-02 | A payment claim ("I have transferred") is accepted only for a payable Invoice before its deadline, once at a time, and only when a bank account for transfers is configured; while it waits the Invoice deadline stops. | PaymentClaimService, StudentInvoiceService · INVOICE_NOT_PAYABLE, DEADLINE_PASSED, CLAIM_WAITING, ALREADY_PAID, NO_BANK_ACCOUNT |
| BR-BIL-03 | A Manager confirms a claim only with the transfer receipt attached (one by one, or in bulk up to 200 Invoices, skipping claims without a receipt), or rejects it with a reason; a claim must be waiting. | PaymentClaimService · NO_CLAIM_WAITING |
| BR-BIL-04 | After a rejection the deadline continues with the time left, at least payment.rejected_claim_min_hours; after payment.rejections_to_cancel rejections a Deposit, Balance or next-Term fee is cancelled with what depends on it; Utility and charge Invoices are debts and are never cancelled. | PaymentClaimService, ForfeitService |
| BR-BIL-05 | Payment reminders are sent payment.reminder_first_days and payment.reminder_second_days before a Balance or next-Term fee deadline, once each, never while a claim waits; Managers get one hourly summary of waiting claims. | PaymentReminders, PaymentReminderJob |
| BR-BIL-06 | An unpaid Utility or charge Invoice becomes Overdue the hour after its due date; Deposits, Balances and next-Term fees never become Overdue (the Application expires, the Allocation is forfeited or the next-Term Allocation is cancelled instead). | FinanceService, OverdueJob |
| BR-BIL-07 | A receipt is available only once the Invoice is paid. | StudentInvoiceService · NOT_PAID |
| BR-BIL-08 | Refunds follow the refund rules; each is decided once by its approver (Manager, Admin or the Block's Staff); an exception or a rejection needs a note; a transfer waits for the student's bank account; a student is reminded at most once a day. | FinanceService · ALREADY_DECIDED, NOT_REFUND_APPROVER, REFUND_CLOSED, ACCOUNT_ENTERED, ALREADY_REMINDED |
| BR-BIL-09 | Meter readings per Block and month: a reading cannot be lower than the last one; a reading far above the Room's usual use is marked Check value until confirmed; a period closes only with every reading entered and confirmed; a closed period cannot change. | MeterService · READINGS_MISSING, READINGS_TO_CHECK, READING_MISSING, PERIOD_CLOSED |
| BR-BIL-10 | Closing a period splits each Room's cost between its residents in proportion to the days each lived there (segments cut by readings taken when residents changed), rounds by the Admin rule and issues one Utility Invoice per student. | UtilitySplit, MeterService |
| BR-BIL-11 | Every active Block gets this month's meter period automatically; when a month ended more than utility.close_days ago and is still open, Staff are reminded once a day. | MeterReminders (hourly) |
| BR-BIL-12 | Utility debt: an overdue Utility Invoice without a claim gives warning 1; a new Utility Invoice while one is overdue, two overdue Invoices or a debt reaching the Utility Deposit gives the final warning; from termination.days_after_final_warning, overdue Invoices ≥ termination.overdue_months or the debt ≥ the Utility Deposit start the termination; paying everything closes the warnings. | UtilityDebtService (hourly) |
| BR-BIL-13 | Files: transfer receipts and evidence are JPEG, PNG or PDF; maintenance photos JPEG or PNG within upload.max_photo_mb. | FileStore · FILE_TYPE_NOT_ALLOWED |

## Maintenance, inspections, routing and escalation (MNT, REQ)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-MNT-01 | A student reports a problem only in the Room they are checked in to, with a title, description and limited photos. | MaintenanceService · NOT_CHECKED_IN |
| BR-MNT-02 | A new request goes to the Block's routing rule for its category (or the fallback while the assignee is off duty) and gets its SLA deadline from the Block's timers; timers may only be stricter than the Admin limits (sla.*); the fallback differs from the assignee. | MaintenanceRouting, RoutingService |
| BR-MNT-03 | Staff change a request only in their Blocks and only when it is assigned to them (or take it over); it must be assigned before In progress or Resolved; someone stays assigned while in progress; a closed request cannot change. | MaintenanceDeskService · ASSIGNED_TO_SOMEONE_ELSE, NOT_STARTED, REQUEST_CLOSED |
| BR-MNT-04 | Internal notes are never shown to the student; every other change notifies the reporter. | MaintenanceDeskService |
| BR-MNT-05 | The student confirms the fix or reopens only a Resolved request. | MaintenanceService · NOT_RESOLVED |
| BR-MNT-06 | Escalation: a Maintenance Request past its timer, unassigned or reopened, or a Room-Change Request undecided past its due time escalates; one open escalation per request, once per reason; it closes when the request is back on track; it is handled once (reassign, or a temporary Bed for a room change). | EscalationService (every 15 min) · ESCALATION_HANDLED, REQUEST_CLOSED |
| BR-MNT-07 | Checklists are versioned: editing a published one publishes the next version and keeps the old one as Replaced; an archived checklist cannot change; names are unique; 1 to 100 items. | ChecklistService · CHECKLIST_ARCHIVED |
| BR-MNT-08 | An inspection schedule needs a published checklist; runs start at 06:00 on their day and keep the checklist version and Rooms of that moment; a Room is inspected once and a submitted run cannot change; a failed item opens a Maintenance Request with the severity's priority. | InspectionScheduleService, InspectionRunService · CHECKLIST_NOT_PUBLISHED, ROOM_DONE, RUN_SUBMITTED |

## Notifications and announcements (NTF)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-NTF-01 | Notifications are written in the same transaction as the change they announce, in English and Vietnamese; push goes out only after commit. | InAppNotifier, PushDispatcher |
| BR-NTF-02 | Users only see and change their own notifications; a student sees the announcements whose audience includes them. | NotificationService, AnnouncementService |
| BR-NTF-03 | The Admin and Managers write announcements for any audience; Staff only for the residents of their Blocks; an announcement ends after it starts and after now. | AnnouncementService · FORBIDDEN |
| BR-NTF-04 | Emails go through an outbox; failures back off and stop after 5 attempts; only fictional accounts' emails may go to the demo mailbox. | EmailOutbox, EmailOutboxDispatcher |
| BR-NTF-05 | Admin emails: scheduled ones not after 20:00 that day; push goes out at once; push text at most 160 characters. | EmailCampaignService, NotificationTemplateService |

## Family Day (VIS)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-VIS-01 | A Manager creates a Family Day for one Block as a Draft (1 to 10 time slots, 1 to 10 guests per student, registration closing after it opens); only a Draft can be edited or published; publishing needs registration to close and the first slot to start in the future. | FamilyDayService · FAMILY_DAY_NOT_DRAFT, FAMILY_DAY_IN_THE_PAST |
| BR-VIS-02 | A Family Day can be cancelled (with a reason) only while no guest has come in; it is closed only when published, after its last slot ends and with no guest still inside; guests who never came become No-shows; an ended Family Day cannot change. | FamilyDayService · FAMILY_DAY_STARTED, FAMILY_DAY_NOT_OVER, FAMILY_DAY_GUESTS_INSIDE, FAMILY_DAY_NOT_PUBLISHED, FAMILY_DAY_ENDED |
| BR-VIS-03 | A resident registers once per Family Day of their Block, for a slot not yet started, with 1 to the allowed number of guests; a minor guest must come with an adult; the slot's places are taken atomically (refused with the places left when too few remain) and the registration is approved at once with one pass per guest. | StudentFamilyDayService · FAMILY_DAY_ALREADY_REGISTERED, FAMILY_DAY_SLOT_STARTED, FAMILY_DAY_SLOT_FULL |
| BR-VIS-04 | A registration is cancelled (by its student before the slot starts, or a Manager with a reason) only if no guest has come in and not twice. | Registrations · REGISTRATION_IN_USE, REGISTRATION_CANCELLED |
| BR-VIS-05 | At the desk a guest is checked in once, inside their time slot and with the identity paper checked, and out once; an unknown pass answers 404; a pass works once; refused passes are audited. | VisitorDeskService · VISITOR_PASS_UNKNOWN, VISITOR_ALREADY_IN, VISITOR_NOT_INSIDE |
| BR-VIS-06 | A guest still inside after their slot is checked out only after the student confirms the guest is safe; only a Manager may check such a guest out without it, writing why; reminders are sent only when such guests exist. | VisitorDeskService, StudentFamilyDayService · VISITOR_SAFETY_NOT_CONFIRMED, FAMILY_DAY_NO_OVERDUE_GUESTS, FAMILY_DAY_NOTHING_TO_CONFIRM |
| BR-VIS-07 | A cancelled Family Day has no statistics. | FamilyDayStatsService · FAMILY_DAY_CANCELLED_NO_STATS |

## Students' AI assistant (AST)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-AST-01 | Only students use the assistant, at most 30 questions per hour; a conversation ends with the student's question and keeps at most 12 turns; nothing is stored or logged. | AssistantService · ASSISTANT_LIMIT, ASSISTANT_NO_QUESTION |
| BR-AST-02 | The assistant answers from the user guide and the student's own data read through the student screens' services; door-code questions get a fixed answer without the model. | AssistantService, StudentData |
| BR-AST-03 | When the model is offline or gives no answer the request is refused with 503. | OllamaAssistantModel · ASSISTANT_OFFLINE, ASSISTANT_NO_ANSWER |

## Time-driven rules (scheduled jobs)

| ID | Business rule | Enforced by (class · error code) |
|---|---|---|
| BR-JOB-01 | Every 5 minutes: Applications whose Deposit window passed expire, unanswered roommate invitations and Round-2 offers expire, and waitlists of Terms whose check-in started end (their Deposits go to refund). | ApplicationExpiryJob |
| BR-JOB-02 | Every 5 minutes: Allocations whose Balance passed its deadline are forfeited (BR-ASG-05). | ResidenceJobs.forfeit |
| BR-JOB-03 | Every 15 minutes: door codes are released to paid residents whose check-in start has come (BR-ASG-06), and terminations past their move-out date become Overdue. | ResidenceJobs.release |
| BR-JOB-04 | Every 15 minutes: the requests-window steps M2, M3, the alert before M4 and the cancellation of unpaid next-Term fees after M7 (BR-TRN-01). | RenewalJobs |
| BR-JOB-05 | Every 5 minutes: unanswered swap invitations expire and old swap-board posts come down. | SwapExpiryJob |
| BR-JOB-06 | Every 15 minutes: requests past their Block's timers escalate and escalations of closed requests close (BR-MNT-06). | EscalationJob |
| BR-JOB-07 | Hourly: unpaid Invoices past their due date become Overdue, then the Utility debt rules run (BR-BIL-06, BR-BIL-12). | OverdueJob |
| BR-JOB-08 | Hourly: payment reminders before deadlines and the Managers' summary of waiting claims (BR-BIL-05). | PaymentReminderJob |
| BR-JOB-09 | Hourly: meter periods of the month open and Staff are reminded of months not closed (BR-BIL-11). | MeterReminderJob |
| BR-JOB-10 | Daily at 06:00 campus time: due inspection runs start (BR-MNT-08). | InspectionJob |
| BR-JOB-11 | Every 30 seconds: due outbox emails are sent; daily at 03:15 sessions ended more than 30 days ago are purged. | EmailOutboxDispatcher, SessionService |
