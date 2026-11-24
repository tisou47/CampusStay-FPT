The 182 business rules below are every refusal a service makes with its own error code (the user sees the message in English or Vietnamese, section 5.3). For each rule: the feature, the class that checks it, and the test cases of Report 5 whose test asserts that code. 114 of the 182 rules (63 %) are asserted by name; the others are covered by the tests of their endpoint without naming the code.

Table: Business Rule Matrix
| BR | Feature | Rule | Error code | Checked in | Test cases |
|---|---|---|---|---|---|
| BR-001 | AUTH | This account is disabled. Contact the dormitory office. | `ACCOUNT_DISABLED` | PasswordService |  |
| BR-002 | AUTH | Too many failed attempts. Try again after… | `ACCOUNT_LOCKED` | SignInService | TC-AUTH-005 |
| BR-003 | AUTH | Your student account was not verified:… | `ACCOUNT_REJECTED` | SignInService | TC-AUTH-041 |
| BR-004 | AUTH | An active account cannot go back to Invited. | `ALREADY_ACTIVE` | AdminUserService | TC-AUTH-050 |
| BR-005 | AUTH | This account is already locked. | `ALREADY_LOCKED` | StudentAccountService | TC-AUTH-045 |
| BR-006 | AUTH | This item is already resolved. | `ALREADY_RESOLVED` | ReconciliationService | TC-AUTH-054 |
| BR-007 | AUTH | Your account is already verified. Ask a Manager to correct your details. | `ALREADY_VERIFIED` | StudentVerificationService | TC-AUTH-039 |
| BR-008 | AUTH | You already have the most emergency contacts allowed. Edit or remove one first. | `EMERGENCY_CONTACTS_FULL` | StudentContactService | TC-AUTH-060 |
| BR-009 | AUTH | The gender cannot change while the student holds a Bed or a live Application. | `GENDER_LOCKED` | StudentAccountService | TC-AUTH-094 |
| BR-010 | AUTH | This account is linked to a different Google account. Contact the dormitory office. | `GOOGLE_ACCOUNT_MISMATCH` | SignInService |  |
| BR-011 | AUTH | Sign in with your @… | `GOOGLE_DOMAIN_NOT_ALLOWED` | GoogleIdTokenVerifier | TC-AUTH-092 |
| BR-012 | AUTH | This demo account signs in with its password, not with Google. | `GOOGLE_NOT_FOR_DEMO` | SignInService | TC-AUTH-059 |
| BR-013 | AUTH | Google sign-in is not available right now. | `GOOGLE_SIGN_IN_DISABLED` | GoogleCodeExchanger | TC-AUTH-052, TC-AUTH-010, TC-AUTH-033 |
| BR-014 | AUTH | Google sign-in failed. Try again. | `GOOGLE_TOKEN_INVALID` | GoogleCodeExchanger | TC-AUTH-030, TC-AUTH-093 |
| BR-015 | AUTH | Google sign-in is not working right now. Try again in a few minutes or use your email and password. | `GOOGLE_UNAVAILABLE` | GoogleCodeExchanger | TC-AUTH-031, TC-AUTH-032 |
| BR-016 | AUTH | This file was already imported. | `IMPORT_APPLIED` | StudentImportService | TC-AUTH-047 |
| BR-017 | AUTH | This user has not accepted the invitation yet. The account becomes Active when they set a password. | `INVITE_PENDING` | AdminUserService |  |
| BR-018 | AUTH | Some of this work was closed or moved meanwhile. Reload the list and try again. | `ITEM_CLOSED` | BlockStaffService | TC-AUTH-070 |
| BR-019 | AUTH | At least one active Admin must remain. | `LAST_ADMIN` | AdminUserService |  |
| BR-020 | AUTH | This link is invalid or has expired. Request a new one. | `LINK_INVALID` | PasswordService | TC-AUTH-012, TC-AUTH-023 |
| BR-021 | AUTH | This student has not sent their details yet. | `NO_PROFILE` | StudentAccountService |  |
| BR-022 | AUTH | This account is not locked. | `NOT_LOCKED` | StudentAccountService | TC-AUTH-045 |
| BR-023 | AUTH | This account is not waiting for verification. | `NOT_PENDING` | StudentAccountService | TC-AUTH-045 |
| BR-024 | AUTH | You cannot remove your own Admin access or disable your own account. | `OWN_ACCOUNT` | AdminUserService | TC-AUTH-015 |
| BR-025 | AUTH | This account already has a password. Use Change password instead. | `PASSWORD_ALREADY_SET` | PasswordService | TC-AUTH-038 |
| BR-026 | AUTH | Too many attempts from this device. Wait a few minutes and try again. | `TOO_MANY_ATTEMPTS` | AuthRateLimiter |  |
| BR-027 | AUTH | The password must not contain your email name. | `WEAK_PASSWORD` | PasswordPolicy | TC-AUTH-012, TC-AUTH-024, TC-AUTH-027, TC-AUTH-038 |
| BR-028 | AUTH | The current password is incorrect. | `WRONG_PASSWORD` | PasswordService | TC-AUTH-012, TC-AUTH-025 |
| BR-029 | CFG | The demo accounts of the base data are missing. Load the base data (db/seed) first. | `DEMO_BASE_DATA_MISSING` | DemoResetService | TC-CFG-027 |
| BR-030 | CFG | Load stage A, B or C first: this file lists the people of the next Term. | `DEMO_STAGE_NEEDED` | DemoResetService |  |
| BR-031 | CFG | The demo tools are off on this server. | `DEMO_TOOLS_OFF` | DemoResetService | TC-CFG-029 |
| BR-032 | CFG | Only the Manager who sent this request can change it. | `NOT_REQUESTER` | TermRequestService |  |
| BR-033 | CFG | Invoices of this Term exist, so its prices, Deposit and Utility Deposit can no longer change. | `PRICES_LOCKED` | TermWizardService | TC-CFG-021 |
| BR-034 | CFG | Only a submitted request can be taken in progress. | `REQUEST_NOT_SUBMITTED` | TermRequestService |  |
| BR-035 | CFG | Rooms of this type have active Allocations, so the number of Beds cannot change. | `ROOM_TYPE_IN_USE` | AdminCatalogService | TC-INV-005 |
| BR-036 | CFG | The refund of a rejected Application cannot be switched off. Change its percent instead. | `RULE_REQUIRED` | AdminPolicyService | TC-CFG-035 |
| BR-037 | CFG | A published Term keeps the rules it opened with. | `RULES_FIXED` | TermWizardService | TC-CFG-022 |
| BR-038 | CFG | This Term is already published. | `TERM_ALREADY_PUBLISHED` | TermWizardService | TC-CFG-034 |
| BR-039 | CFG | This Term has ended and can no longer be changed. | `TERM_CLOSED` | TermWizardService |  |
| BR-040 | CFG | A Term named… | `TERM_EXISTS` | TermRequestService |  |
| BR-041 | CFG | The stay dates overlap… | `TERM_OVERLAP` | TermWizardService | TC-CFG-034 |
| BR-042 | INV | Students live in or are placed in Block… | `BLOCK_IN_USE` | AdminBuildingService | TC-INV-005, TC-INV-031 |
| BR-043 | INV | Your door code is not ready yet. | `DOOR_CODE_NOT_READY` | DoorCodeService | TC-INV-023 |
| BR-044 | INV | Door codes are not set up on this server yet. | `DOOR_CODES_DISABLED` | DoorCodeCipher |  |
| BR-045 | INV | The store of Block… | `FURNITURE_MISSING` | JdbcRoomClassChanges |  |
| BR-046 | INV | Item… | `ITEM_DISPOSED` | FurnitureService | TC-INV-018 |
| BR-047 | INV | This move is already… | `MOVE_CLOSED` | FurnitureService | TC-INV-017 |
| BR-048 | INV | Item… | `MOVE_PLANNED` | FurnitureService | TC-INV-017 |
| BR-049 | INV | Room… | `NO_PROPOSED_CODE` | DoorCodeService | TC-INV-020 |
| BR-050 | INV | Create an active Room Class first. | `NO_ROOM_CLASS` | AdminBuildingService |  |
| BR-051 | INV | Create an active Room Type first. | `NO_ROOM_TYPE` | AdminBuildingService |  |
| BR-052 | INV | Room… | `ROOM_ALREADY_OUT_OF_SERVICE` | InventoryService | TC-INV-006 |
| BR-053 | INV | Beds of Room… | `ROOM_CLASS_LOCKED` | RoomClassService | TC-INV-010 |
| BR-054 | INV | Room… | `ROOM_IN_SERVICE` | InventoryService | TC-INV-006 |
| BR-055 | INV | Move the… | `ROOM_OCCUPIED` | InventoryService | TC-INV-005 |
| BR-056 | INV | Beds of Room… | `ROOM_PROMISED` | InventoryService | TC-INV-032 |
| BR-057 | INV | Item… | `SAME_LOCATION` | FurnitureService | TC-INV-017 |
| BR-058 | INV | The stay of… | `TERM_STARTED` | RoomClassService | TC-INV-010 |
| BR-059 | INV | A Room Class requires… | `TYPE_REQUIRED` | AdminFurnitureService | TC-INV-013 |
| BR-060 | APP | Application… | `ALREADY_DECIDED` | ApplicationReviewService | TC-APP-010, TC-BIL-021, TC-ASG-030, TC-REQ-002 (+1) |
| BR-061 | APP | Choose 24h or 7d. | `BAD_PARAMETER` | ApplicationReviewService | TC-AUTH-018, TC-NTF-001 |
| BR-062 | APP | This Application can no longer be cancelled here. | `CANNOT_CANCEL` | ApplicationService | TC-APP-007, TC-APP-025 |
| BR-063 | APP | A Manager is checking your transfer. Cancel once it is confirmed or rejected. | `CLAIM_WAITING` | ApplicationService | TC-BIL-034 |
| BR-064 | APP | This invitation is no longer open. | `INVITATION_CLOSED` | ApplicationService |  |
| BR-065 | APP | Your student record was not found. Contact the dormitory office. | `NO_STUDENT_RECORD` | EligibilityService |  |
| BR-066 | APP | You cannot apply for… | `NOT_ELIGIBLE` | ApplicationService | TC-APP-002, TC-APP-023, TC-ASG-033, TC-APP-022 (+1) |
| BR-067 | APP | Only an Application on the waitlist can be withdrawn. | `NOT_WAITLISTED` | Round2Service | TC-APP-025 |
| BR-068 | APP | This offer is no longer open. | `OFFER_CLOSED` | Round2Service | TC-APP-020, TC-APP-021 |
| BR-069 | APP | No Term is open for registration now. | `REGISTRATION_CLOSED` | ApplicationService |  |
| BR-070 | APP | You have used all roommate code checks for this Term. Choose Match me automatically. | `ROOMMATE_CHECKS_EXHAUSTED` | ApplicationService | TC-APP-004 |
| BR-071 | ASG | This student no longer holds the Bed. | `ALLOCATION_ENDED` | JdbcMoves |  |
| BR-072 | ASG | You have already checked in. | `ALREADY_CHECKED_IN` | LateCheckInService | TC-ASG-020, TC-ASG-060 |
| BR-073 | ASG | This student has already checked out. | `ALREADY_CHECKED_OUT` | CheckOutFurnitureService | TC-ASG-022 |
| BR-074 | ASG | This stay is already terminated. | `ALREADY_TERMINATED` | TerminationService | TC-ASG-035 |
| BR-075 | ASG | A Round-1 proposal of this Term is still in review. Commit or discard it before Round 2. | `ASSIGNMENT_IN_REVIEW` | AssignmentService |  |
| BR-076 | ASG | This Bed is not free any more. Choose another one. | `BED_NOT_AVAILABLE` | OperationalMoveService |  |
| BR-077 | ASG | This Bed was just taken. Choose another one. | `BED_TAKEN` | JdbcMoves |  |
| BR-078 | ASG | This Bed is no longer available. Ask Staff for another option. | `BED_UNAVAILABLE` | JdbcRound2Placements |  |
| BR-079 | ASG | This Block is with the Manager; it cannot change now. | `BLOCK_SUBMITTED` | AssignmentService |  |
| BR-080 | ASG | Check-in is blocked:… | `CHECK_IN_BLOCKED` | DeskService | TC-ASG-020, TC-ASG-060 |
| BR-081 | ASG | You cannot receive the Room yet:… | `CHECK_IN_NOT_READY` | StudentHandoverService | TC-ASG-053 |
| BR-082 | ASG | Resolve the… | `CONFLICTS_LEFT` | AssignmentService | TC-ASG-010 |
| BR-083 | ASG | A move to another Block is decided by a Manager. | `CROSS_BLOCK` | OperationalMoveService |  |
| BR-084 | ASG | A dry run is a preview: it cannot be changed or submitted. | `DRY_RUN` | AssignmentService | TC-ASG-011 |
| BR-085 | ASG | A final inventory cannot be cancelled. | `INVENTORY_FINAL` | HandoverDeskService |  |
| BR-086 | ASG | Start the check-in inventory first. | `INVENTORY_NOT_STARTED` | StudentHandoverService |  |
| BR-087 | ASG | Your check-in inventory is already started. | `INVENTORY_STARTED` | StudentHandoverService |  |
| BR-088 | ASG | Your check-in inventory is already submitted. | `INVENTORY_SUBMITTED` | StudentHandoverService |  |
| BR-089 | ASG | You already sent a late report. | `LATE_ALREADY_SENT` | StudentHandoverService |  |
| BR-090 | ASG | Only an inventory closed by its deadline takes a late report. | `LATE_NOT_ALLOWED` | StudentHandoverService |  |
| BR-091 | ASG | The check-in period has ended. Ask the dormitory desk about a late check-in. | `LATE_REQUEST_CLOSED` | LateCheckInService |  |
| BR-092 | ASG | This student already has a late check-in for this Term: one request per Term. | `LATE_REQUEST_EXISTS` | LateCheckInService | TC-ASG-030, TC-ASG-031, TC-ASG-037 |
| BR-093 | ASG | An inventory with a major difference is checked in the Room with the student: set a visit. | `MAJOR_NEEDS_VISIT` | HandoverDeskService | TC-ASG-056 |
| BR-094 | ASG | The next-Term fees are issued: only a Manager moves a student for the next Term now. | `MANAGER_DECIDES` | OperationalMoveService | TC-ASG-044, TC-REQ-012 |
| BR-095 | ASG | No free Bed of that kind is left. Choose another option or the waitlist. | `NO_BED_LEFT` | AssignmentService |  |
| BR-096 | ASG | You have no Room to receive with a check-in inventory. | `NO_INVENTORY_NEEDED` | StudentHandoverService |  |
| BR-097 | ASG | The student sent no late report. | `NO_LATE_REPORT` | HandoverDeskService |  |
| BR-098 | ASG | This student has no Bed for the next Term. | `NO_NEXT_TERM_BED` | JdbcStays | TC-REQ-001 |
| BR-099 | ASG | Room… | `NO_PRICE` | OperationalMoveService | TC-INV-033 |
| BR-100 | ASG | This student has not checked in yet and cannot check out. | `NOT_CHECKED_IN` | DeskService | TC-ASG-022, TC-MNT-001 |
| BR-101 | ASG | Block… | `NOT_SUBMITTED` | AssignmentService | TC-ASG-010 |
| BR-102 | ASG | Only a submitted inventory can be confirmed. | `NOT_TO_REVIEW` | HandoverDeskService |  |
| BR-103 | ASG | Ask for a visit before recording what you find. | `NOT_VERIFYING` | HandoverDeskService |  |
| BR-104 | ASG | Staff have not recorded your check-out yet. | `NOTHING_TO_AGREE` | CheckOutFurnitureService |  |
| BR-105 | ASG | This item is not waiting for a Manager. | `NOTHING_TO_REVIEW` | CheckOutFurnitureService |  |
| BR-106 | ASG | The next-Term fee is paid: move this student only to a… | `PRICE_DIFFERS` | OperationalMoveService | TC-ASG-044 |
| BR-107 | ASG | Continuing residents can still file next-Term requests… | `RENEWAL_FILING` | AssignmentService | TC-ASG-038 |
| BR-108 | ASG | This run is… | `RUN_CLOSED` | AssignmentService |  |
| BR-109 | ASG | Blocks of… | `RUN_PARTLY_COMMITTED` | AssignmentService |  |
| BR-110 | ASG | A stay can be at most… | `STAY_TOO_LONG` | JdbcStays |  |
| BR-111 | ASG | The student has not agreed with the furniture charges yet. Ask them to agree on the app. | `STUDENT_NOT_AGREED` | DeskService | TC-ASG-058 |
| BR-112 | ASG | This termination is already closed. | `TERMINATION_CLOSED` | TerminationService | TC-ASG-035 |
| BR-113 | ASG | This stay is being terminated. Cancel the termination before moving the student. | `TERMINATION_OPEN` | JdbcMoves |  |
| BR-114 | ASG | This termination is overdue: the next-Term Bed was… | `TERMINATION_OVERDUE` | TerminationService |  |
| BR-115 | ASG | The requests window of… | `WINDOW_NOT_OPEN` | NextTermFeeService |  |
| BR-116 | BIL | The student already entered their bank account. | `ACCOUNT_ENTERED` | FinanceService | TC-BIL-040 |
| BR-117 | BIL | This Invoice is already paid. | `ALREADY_PAID` | PaymentClaimService | TC-BIL-034, TC-BIL-011 |
| BR-118 | BIL | The student was reminded less than a day ago. | `ALREADY_REMINDED` | FinanceService | TC-BIL-040 |
| BR-119 | BIL | The deadline of this Invoice has passed. | `DEADLINE_PASSED` | PaymentClaimService | TC-BIL-034 |
| BR-120 | BIL | This Invoice cannot be paid: it is… | `INVOICE_NOT_PAYABLE` | PaymentClaimService | TC-BIL-034, TC-BIL-012 |
| BR-121 | BIL | No bank account is configured for transfers yet. | `NO_BANK_ACCOUNT` | StudentInvoiceService |  |
| BR-122 | BIL | No payment claim is waiting for this Invoice. | `NO_CLAIM_WAITING` | PaymentClaimService |  |
| BR-123 | BIL | A receipt is available once the Invoice is paid. | `NOT_PAID` | StudentInvoiceService |  |
| BR-124 | BIL | This refund is decided by… | `NOT_REFUND_APPROVER` | FinanceService |  |
| BR-125 | BIL | This period is closed: its Invoices are issued. | `PERIOD_CLOSED` | MeterService | TC-BIL-026 |
| BR-126 | BIL | This month has not ended yet. Close it from the first day of next month. | `PERIOD_NOT_ENDED` | MeterService | TC-BIL-045 |
| BR-127 | BIL | Enter the reading before you confirm it. | `READING_MISSING` | MeterService | TC-BIL-024 |
| BR-128 | BIL | Confirm the… | `READINGS_TO_CHECK` | MeterService | TC-BIL-024 |
| BR-129 | BIL | This refund no longer waits for a transfer. | `REFUND_CLOSED` | FinanceService |  |
| BR-130 | BIL | Only an approved refund can be marked paid. | `REFUND_NOT_APPROVED` | FinanceService | TC-BIL-047 |
| BR-131 | BIL | Pay your overdue Utility Invoice first, then the next-Term fee. | `UTILITY_OVERDUE` | PaymentClaimService | TC-ASG-040 |
| BR-132 | REQ | This escalation was already handled. | `ESCALATION_HANDLED` | EscalationService | TC-REQ-016 |
| BR-133 | REQ | This is the last Term of your stay: ask for an extension first. | `EXTEND_FIRST` | RoomChangeService | TC-REQ-001 |
| BR-134 | REQ | The next-Term fees are issued, so next-Term Beds are fixed. | `FEES_ISSUED` | NextTermContext | TC-REQ-012 |
| BR-135 | REQ | This request is not part of a requests window. | `NO_WINDOW` | NextTermContext |  |
| BR-136 | REQ | Your Bed is not what this student is looking for. | `NOT_A_MATCH` | SwapService | TC-REQ-011 |
| BR-137 | REQ | You already have an open Room-Change Request for this Term. | `OPEN_REQUEST` | RoomChangeService | TC-REQ-019, TC-REQ-001 |
| BR-138 | REQ | You already have a swap waiting. Wait for it or let it expire. | `OPEN_SWAP` | SwapService | TC-REQ-010 |
| BR-139 | REQ | Pay your overdue Invoice before you ask for a room change. | `OVERDUE_INVOICE` | RoomChangeService |  |
| BR-140 | REQ | Next-Term requests for… | `REQUESTS_CLOSED` | NextTermContext | TC-REQ-019 |
| BR-141 | REQ | The free Beds of this kind are kept for new students. | `RESERVED_FOR_NEW_STUDENTS` | RoomChangeService |  |
| BR-142 | REQ | The swap does not pass the rule check any more. | `SWAP_CHECKS_FAILED` | SwapService |  |
| BR-143 | MNT | This request is assigned to… | `ASSIGNED_TO_SOMEONE_ELSE` | MaintenanceDeskService | TC-MNT-009 |
| BR-144 | MNT | This checklist is archived. | `CHECKLIST_ARCHIVED` | ChecklistService |  |
| BR-145 | MNT | This checklist has already been used in inspection schedules or runs and cannot be deleted. Archive it instead to preserve history. | `CHECKLIST_IN_USE` | ChecklistService |  |
| BR-146 | MNT | The checklist of this schedule is not published. | `CHECKLIST_NOT_PUBLISHED` | InspectionScheduleService | TC-MNT-006 |
| BR-147 | MNT | This inspection run is assigned to another staff member. | `INSPECTION_NOT_ASSIGNED` | InspectionRunService | TC-MNT-005 |
| BR-148 | MNT | Only an archived checklist can be restored. | `NOT_ARCHIVED` | ChecklistService |  |
| BR-149 | MNT | Mark the request resolved before you close it. | `NOT_RESOLVED` | MaintenanceDeskService | TC-MNT-002 |
| BR-150 | MNT | Assign the request before you mark it resolved. | `NOT_STARTED` | MaintenanceDeskService |  |
| BR-151 | MNT | This request is no longer open. | `REQUEST_CLOSED` | JdbcMaintenanceRequests | TC-MNT-002, TC-CFG-018 |
| BR-152 | MNT | This Room is already… | `ROOM_DONE` | InspectionRunService | TC-MNT-005 |
| BR-153 | MNT | This inspection run is already submitted. | `RUN_SUBMITTED` | InspectionRunService | TC-MNT-005 |
| BR-154 | VIS | You have already registered guests for this Family Day. | `FAMILY_DAY_ALREADY_REGISTERED` | StudentFamilyDayService | TC-VIS-002 |
| BR-155 | VIS | This Family Day was cancelled, so it has no statistics. | `FAMILY_DAY_CANCELLED_NO_STATS` | FamilyDayStatsService |  |
| BR-156 | VIS | This Family Day is already cancelled or completed. | `FAMILY_DAY_ENDED` | FamilyDayService |  |
| BR-157 | VIS | Registration must close and the first time slot must start in the future. Edit the dates first. | `FAMILY_DAY_IN_THE_PAST` | FamilyDayService |  |
| BR-158 | VIS | No guest is waiting for a reminder: nobody is inside after their time slot without a confirmation. | `FAMILY_DAY_NO_OVERDUE_GUESTS` | VisitorDeskService | TC-VIS-009 |
| BR-159 | VIS | Only a Draft can be edited. Cancel this Family Day and create a new one instead. | `FAMILY_DAY_NOT_DRAFT` | FamilyDayService | TC-VIS-001 |
| BR-160 | VIS | The last time slot ends at… | `FAMILY_DAY_NOT_OVER` | FamilyDayService | TC-VIS-006 |
| BR-161 | VIS | Only a published Family Day can be closed. | `FAMILY_DAY_NOT_PUBLISHED` | FamilyDayService |  |
| BR-162 | VIS | None of your guests is inside after their time slot, so there is nothing to confirm. | `FAMILY_DAY_NOTHING_TO_CONFIRM` | StudentFamilyDayService | TC-VIS-009 |
| BR-163 | VIS | This time slot has already started. Choose a later one. | `FAMILY_DAY_SLOT_STARTED` | StudentFamilyDayService |  |
| BR-164 | VIS | Guests have already come in. Close the Family Day instead of cancelling it. | `FAMILY_DAY_STARTED` | FamilyDayService | TC-VIS-006 |
| BR-165 | VIS | This registration is already cancelled. | `REGISTRATION_CANCELLED` | Registrations |  |
| BR-166 | VIS | A guest of this registration has already come in, so it cannot be cancelled. | `REGISTRATION_IN_USE` | Registrations |  |
| BR-167 | VIS | This guest is already checked in. | `VISITOR_ALREADY_IN` | VisitorDeskService | TC-VIS-004 |
| BR-168 | VIS | This guest is not checked in. | `VISITOR_NOT_INSIDE` | VisitorDeskService | TC-VIS-004 |
| BR-169 | VIS | The student has not confirmed yet that this guest is safe. Send a reminder and check the guest… | `VISITOR_SAFETY_NOT_CONFIRMED` | VisitorDeskService | TC-VIS-006, TC-VIS-009 |
| BR-170 | AST | You have asked many questions in the last hour. Try again later. | `ASSISTANT_LIMIT` | AssistantService | TC-AST-004 |
| BR-171 | AST | The assistant could not answer. Ask in other words. | `ASSISTANT_NO_ANSWER` | AssistantService | TC-AST-008 |
| BR-172 | AST | End the conversation with your question. | `ASSISTANT_NO_QUESTION` | AssistantService | TC-AST-002 |
| BR-173 | AST | The assistant is offline right now. Try again later. | `ASSISTANT_OFFLINE` | OllamaAssistantModel | TC-AST-005, TC-AST-007 |
| BR-174 | Platform | Page must be 1 or more and page size between 1 and… | `BAD_PAGE` | PageQuery |  |
| BR-175 | Platform | You do not have access to Block… | `BLOCK_OUT_OF_SCOPE` | BlockScope | TC-NTF-042, TC-INV-020, TC-INV-003, TC-MNT-002 (+3) |
| BR-176 | Platform | The workbook is too large once unpacked. Keep only the list in it and upload it again. | `FILE_TOO_LARGE` | SheetFile |  |
| BR-177 | Platform | You do not have permission to do this. | `FORBIDDEN` | BlockScope | TC-AUTH-016, TC-AUTH-004 |
| BR-178 | Platform | No Block is assigned to your account. Contact the administrator. | `NO_BLOCK` | BlockScope |  |
| BR-179 | Platform | Set a CampusStay password before you continue. | `PASSWORD_REQUIRED` | AccountSetupGate | TC-AUTH-038 |
| BR-180 | Platform | Send your student details before you continue. | `PROFILE_REQUIRED` | AccountSetupGate | TC-AUTH-038 |
| BR-181 | Platform | Your session has ended. Sign in again. | `UNAUTHENTICATED` | CurrentUser | TC-AUTH-003, TC-AUTH-022, TC-AUTH-026 |
| BR-182 | Platform | Google sign-in could not start. Try again. | `VALIDATION_FAILED` | AuthController | TC-AUTH-013, TC-APP-003, TC-APP-010, TC-AST-002 (+3) |
