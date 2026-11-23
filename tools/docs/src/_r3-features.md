### 3.2 Accounts, staff and audit (AUTH)

60 endpoints in 10 controllers.

#### 3.2.1 Admin User

Admin › Users and Roles, the permission matrix and the Audit Log (/admin/** is Admin only).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/admin/users` | ADMIN | List |
| POST | `/admin/users` | ADMIN | Invite |
| PUT | `/admin/users/{id}` | ADMIN | Update |
| GET | `/admin/permissions` | ADMIN | Permissions |
| GET | `/admin/audit-log` | ADMIN | Audit Log |

*Validation messages:* Enter the full name. · Use at most 150 characters. · Enter the email. · Enter a valid email. · Choose a role. · Choose a status.

*Rules and error conditions (code, message), 6 in total:*

| Code | Message |
|---|---|
| ALREADY_ACTIVE | An active account cannot go back to Invited. |
|  | BAD_PARAMETER |
| INVITE_PENDING | This user has not accepted the invitation yet. The account becomes Active when they set a password. |
| LAST_ADMIN | At least one active Admin must remain. |
|  | This user does not exist. |
| OWN_ACCOUNT | You cannot remove your own Admin access or disable your own account. |

#### 3.2.2 Auth

Session endpoints of the API contract plus the Google and password additions (see API contract changes).

| Method | Path | Access | Function |
|---|---|---|---|
| POST | `/auth/sign-in` | public | Sign In |
| POST | `/auth/google` | public | Google |
| POST | `/auth/sign-out` | signed in | Sign Out |
| GET | `/auth/me` | signed in | Me |
| PUT | `/auth/me/locale` | signed in | Locale |
| POST | `/auth/password/forgot` | public | Forgot |
| POST | `/auth/password/reset` | public | Reset |
| POST | `/auth/password/set` | signed in | Set First |
| POST | `/auth/password/change` | signed in | Change |

*Validation messages:* Enter your email. · Enter a valid email. · Enter your password. · Enter a new password. · Enter your current password. · Choose vi or en.

*Rules and error conditions (code, message), 9 in total:*

| Code | Message |
|---|---|
| ACCOUNT_DISABLED | This account is disabled. Contact the dormitory office. |
| ACCOUNT_LOCKED | Too many failed attempts. Try again after  |
| ACCOUNT_REJECTED | Your student account was not verified:  |
| GOOGLE_ACCOUNT_MISMATCH | This account is linked to a different Google account. Contact the dormitory office. |
| GOOGLE_NOT_FOR_DEMO | This demo account signs in with its password, not with Google. |
| LINK_INVALID | This link is invalid or has expired. Request a new one. |
|  | INVALID_CREDENTIALS |
| PASSWORD_ALREADY_SET | This account already has a password. Use Change password instead. |
| WRONG_PASSWORD | The current password is incorrect. |

#### 3.2.3 Block Staff

Manager › Staff and workload: handles, duty and work of the Block's staff, and requests for new accounts.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/block-staff` | signed in | List |
| GET | `/block-staff/me` | signed in | Me |
| PUT | `/block-staff/{id}` | signed in | Update |
| GET | `/block-staff/{id}/work` | signed in | Work |
| POST | `/block-staff/{id}/work/reassign` | signed in | Reassign |
| PUT | `/block-staff/{id}/shifts` | signed in | Set Shifts |
| GET | `/week-schedule` | signed in | Next Week |
| GET | `/week-schedule/plan` | signed in | Plan |
| PUT | `/week-schedule/plan/{staffId}` | signed in | Plan Week |
| DELETE | `/week-schedule/plan/{staffId}` | signed in | Reset Week |
| GET | `/week-schedule/me` | signed in | My Schedule |
| POST | `/week-schedule/send` | signed in | Send Week |
| GET | `/staff-activity` | signed in | Activity |
| POST | `/staff-account-requests` | signed in | Request Account |

*Validation messages:* Give at most 21 shifts a week. · Keep the note under 300 characters. · Use at most 150 characters.

*Rules and error conditions (code, message), 2 in total:*

| Code | Message |
|---|---|
| ITEM_CLOSED | Some of this work was closed or moved meanwhile. Reload the list and try again. |
|  | This staff member does not exist. |

#### 3.2.4 Reconciliation

Manager › Reconciliation: the enrolled list (or a leavers list) of a Term against its residents (D-28, spec §6.12).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/reconciliations` | signed in | Overview |
| GET | `/reconciliations/template` | signed in | Template |
| POST | `/reconciliations` | signed in | Upload |
| GET | `/reconciliations/{id}` | signed in | Detail |
| POST | `/reconciliations/{id}/items/{itemId}/resolve` | signed in | Resolve |

*Validation messages:* Keep the note under 500 characters.

*Rules and error conditions (code, message), 2 in total:*

| Code | Message |
|---|---|
| ALREADY_RESOLVED | This item is already resolved. |
|  | This reconciliation does not exist. |

#### 3.2.5 Refund Account

The student's own refund bank account (A-62) and the banks it can be at (R-22).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/refund-account` | STUDENT | Mine |
| PUT | `/students/me/refund-account` | STUDENT | Save |
| GET | `/banks` | signed in | Banks |

*Validation messages:* Use at most 100 characters. · Enter the account number: 6 to 20 digits. · Choose the bank from the list.

#### 3.2.6 Staff Account

Manager › Staff accounts: create, edit, disable Staff and choose their Blocks (spec §3; contract change A-21).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/staff-accounts` | signed in | List |
| POST | `/staff-accounts` | signed in | Create |
| PUT | `/staff-accounts/{id}` | signed in | Update |
| POST | `/staff-accounts/{id}/invitation` | signed in | Resend Invitation |

*Validation messages:* Use at most 150 characters. · Use at most 100 characters.

*Rules and error conditions (code, message), 2 in total:*

| Code | Message |
|---|---|
| BAD_PARAMETER | Choose a status from the list. |
|  | NOT_INVITED |

#### 3.2.7 Student Account

Manager › Students: the student list, the student hub, directory fields, verification and locking (spec §6.2, §11.3; contract change A-19).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/student-accounts` | signed in | List |
| GET | `/student-accounts/{id}` | signed in | Hub |
| PUT | `/student-accounts/{id}` | signed in | Edit |
| POST | `/student-accounts/{id}/verify` | signed in | Verify |
| POST | `/student-accounts/{id}/reject` | signed in | Reject |
| POST | `/student-accounts/{id}/lock` | signed in | Lock |
| POST | `/student-accounts/{id}/unlock` | signed in | Unlock |

*Validation messages:* Use at most 150 characters. · Use at most 100 characters. · Enter a phone number of 8 to 15 digits. · Use at most 500 characters.

*Rules and error conditions (code, message), 7 in total:*

| Code | Message |
|---|---|
| ALREADY_LOCKED | This account is already locked. |
| BAD_PARAMETER | Choose a cohort from the list. |
| GENDER_LOCKED | The gender cannot change while the student holds a Bed or a live Application. |
| NO_PROFILE | This student has not sent their details yet. |
| NOT_LOCKED | This account is not locked. |
| NOT_PENDING | This account is not waiting for verification. |
|  | This student does not exist. |

#### 3.2.8 Student Contact

The student's own contact details and emergency contacts on My profile (/students/** is Student only).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/contacts` | STUDENT | Mine |
| PUT | `/students/me/contacts` | STUDENT | Save |
| POST | `/students/me/contacts/emergency` | STUDENT | Add |
| PUT | `/students/me/contacts/emergency/{id}` | STUDENT | Update |
| POST | `/students/me/contacts/emergency/{id}/primary` | STUDENT | Primary |
| DELETE | `/students/me/contacts/emergency/{id}` | STUDENT | Remove |

*Validation messages:* Enter a phone number of 8 to 15 digits. · Enter a valid email address. · Enter the contact's full name. · Choose the relationship from the list.

*Rules and error conditions (code, message), 2 in total:*

| Code | Message |
|---|---|
| EMERGENCY_CONTACTS_FULL | You already have the most emergency contacts allowed. Edit or remove one first. |
|  | This emergency contact does not exist. |

#### 3.2.9 Student Import

Manager › Import student list: template, upload and preview, confirm, history (D-07, spec §6.2; contract change A-20).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/student-imports` | signed in | History |
| GET | `/student-imports/template` | signed in | Template |
| POST | `/student-imports` | signed in | Upload |
| GET | `/student-imports/{id}` | signed in | Get |
| POST | `/student-imports/{id}/confirm` | signed in | Confirm |

*Rules and error conditions (code, message), 3 in total:*

| Code | Message |
|---|---|
| BAD_PARAMETER | Choose New, Update, Unchanged or Error. |
| IMPORT_APPLIED | This file was already imported. |
|  | This import does not exist. |

#### 3.2.10 Student Verification

The student's own sign-up form and verification status (ADR-26, contract change A-18; /students/** is Student only).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/verification` | STUDENT | Get |
| PUT | `/students/me/verification` | STUDENT | Submit |

*Validation messages:* Use at most 150 characters. · Enter a phone number of 8 to 15 digits.

*Rules and error conditions (code, message), 1 in total:*

| Code | Message |
|---|---|
| ALREADY_VERIFIED | Your account is already verified. Ask a Manager to correct your details. |

### 3.3 Terms and settings (CFG)

40 endpoints in 9 controllers.

#### 3.3.1 Admin Catalog

Admin › Room Types and Admin › Room Classes.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/admin/room-types` | ADMIN | Room Types |
| POST | `/admin/room-types` | ADMIN | Create Room Type |
| PUT | `/admin/room-types/{id}` | ADMIN | Update Room Type |
| GET | `/admin/room-classes` | ADMIN | Room Classes |
| POST | `/admin/room-classes` | ADMIN | Create Room Class |
| PUT | `/admin/room-classes/{id}` | ADMIN | Update Room Class |

*Validation messages:* Use at most 50 characters.

*Rules and error conditions (code, message), 2 in total:*

| Code | Message |
|---|---|
|  | This Room Type does not exist. |
| ROOM_TYPE_IN_USE | Rooms of this type have active Allocations, so the number of Beds cannot change. |

#### 3.3.2 Admin Policy

Admin configuration screens that load and save one document each (GET|PUT, the PUT body has the GET shape): fees, eligibility, matching criteria, utility, system parameters and the settings groups (/admin/settings/{group}: deadlines, refunds, stay; A-31).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/admin/settings/{group}` | ADMIN | Settings |
| PUT | `/admin/settings/{group}` | ADMIN | Save Settings |
| GET | `/admin/utility` | ADMIN | Utility |
| PUT | `/admin/utility` | ADMIN | Save Utility |
| GET | `/admin/fees` | ADMIN | Fees |
| PUT | `/admin/fees` | ADMIN | Save Fees |
| GET | `/admin/eligibility` | ADMIN | Eligibility |
| PUT | `/admin/eligibility` | ADMIN | Save Eligibility |
| GET | `/admin/matching` | ADMIN | Matching |
| PUT | `/admin/matching` | ADMIN | Save Matching |
| POST | `/admin/matching/preview` | ADMIN | Preview Matching |
| GET | `/admin/system-parameters` | ADMIN | System Parameters |
| PUT | `/admin/system-parameters` | ADMIN | Save System Parameters |

*Rules and error conditions (code, message), 2 in total:*

| Code | Message |
|---|---|
|  | This settings group does not exist. |
| RULE_REQUIRED | The refund of a rejected Application cannot be switched off. Change its percent instead. |

#### 3.3.3 Admin Term

Admin › Registration periods › Terms.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/admin/terms` | ADMIN | List |
| POST | `/admin/terms/drafts` | ADMIN | Create Draft |
| GET | `/admin/terms/{id}/wizard` | ADMIN | Read |
| PUT | `/admin/terms/{id}/wizard/{step}` | ADMIN | Save Step |
| POST | `/admin/terms/{id}/publish` | ADMIN | Publish |

*Rules and error conditions (code, message), 6 in total:*

| Code | Message |
|---|---|
|  | This wizard step does not exist. |
| PRICES_LOCKED | Invoices of this Term exist, so its prices, Deposit and Utility Deposit can no longer change. |
| RULES_FIXED | A published Term keeps the rules it opened with. |
| TERM_ALREADY_PUBLISHED | This Term is already published. |
| TERM_CLOSED | This Term has ended and can no longer be changed. |
| TERM_OVERLAP | The stay dates overlap  |

#### 3.3.4 Block Settings

Block Manager › Block settings: desk, visitor and quiet hours and the house rules.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/block-settings` | signed in | Get |
| PUT | `/block-settings` | signed in | Save |

*Validation messages:* Keep the house rules under 4,000 characters.

#### 3.3.5 Catalog

GET /catalog?termId — every signed-in role.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/catalog` | signed in | Catalog |

#### 3.3.6 Demo

Admin › System › Reset demo data (demo servers only, DEMO_TOOLS=true).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/admin/demo` | ADMIN | Status |
| GET | `/admin/demo/files/{kind}` | ADMIN | File |
| POST | `/admin/demo/reset` | ADMIN | Reset |

*Rules and error conditions (code, message), 4 in total:*

| Code | Message |
|---|---|
| DEMO_BASE_DATA_MISSING | The demo accounts of the base data are missing. Load the base data (db/seed) first. |
| DEMO_STAGE_NEEDED | Load stage A, B or C first: no door code of Block A must change. |
| DEMO_TOOLS_OFF | The demo tools are off on this server. |
|  | This demo file does not exist. |

#### 3.3.7 Registration Period

/registration-periods — every signed-in role (A-29, spec §6.5): the registration period card of the dormitory board and the details of a published Term.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/registration-periods/current` | signed in | Current |
| GET | `/registration-periods/{termId}` | signed in | Details |

#### 3.3.8 Term

GET /terms — every signed-in role; for a student current is their own Term (C-19).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/terms` | signed in | List |

#### 3.3.9 Term Request

/term-requests — registration-period requests (A-28, spec §6.3): Managers send and change their requests; Managers and the Admin read them and comment; the Admin answers (/decision) and builds the Term from one in the wizard.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/term-requests` | signed in | List |
| GET | `/term-requests/defaults` | signed in | Defaults |
| GET | `/term-requests/{id}` | signed in | Get |
| POST | `/term-requests` | signed in | Create |
| PUT | `/term-requests/{id}` | signed in | Update |
| POST | `/term-requests/{id}/comments` | signed in | Comment |
| POST | `/term-requests/{id}/decision` | signed in | Decide |

*Rules and error conditions (code, message), 8 in total:*

| Code | Message |
|---|---|
| NOT_REQUESTER | Only the Manager who sent this request can change it. |
|  | REQUEST_LOCKED |
|  | REQUEST_NOT_BUILDABLE |
|  | TERM_REQUEST_OPEN |
|  | This registration-period request does not exist. |
| REQUEST_CLOSED | This request is closed. |
| REQUEST_NOT_SUBMITTED | Only a submitted request can be taken in progress. |
| TERM_EXISTS | A Term named  |

### 3.4 Inventory (INV)

40 endpoints in 7 controllers.

#### 3.4.1 Admin Building

Admin › Buildings (/admin/** is Admin only).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/admin/buildings` | ADMIN | List |
| POST | `/admin/buildings` | ADMIN | Create |
| PUT | `/admin/buildings/{id}` | ADMIN | Update |
| POST | `/admin/buildings/{id}/rooms/bulk` | ADMIN | Generate Rooms |
| GET | `/admin/buildings/{id}/floors/{floor}/rooms` | ADMIN | Floor Rooms |

*Validation messages:* Use at most 10 letters or digits.

*Rules and error conditions (code, message), 5 in total:*

| Code | Message |
|---|---|
| BLOCK_IN_USE | Students live in or are placed in Block  |
| NO_ROOM_CLASS | Create an active Room Class first. |
| NO_ROOM_TYPE | Create an active Room Type first. |
|  | This Block does not exist. |
|  | Floor  |

#### 3.4.2 Admin Furniture

Admin › Furniture: furniture types and Room Class requirements (/admin/** is Admin only).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/admin/furniture-types` | ADMIN | Types |
| POST | `/admin/furniture-types` | ADMIN | Create |
| PUT | `/admin/furniture-types/{id}` | ADMIN | Update |
| PUT | `/admin/furniture-conditions` | ADMIN | Set Conditions |
| GET | `/admin/room-class-requirements` | ADMIN | Requirements |
| PUT | `/admin/room-class-requirements/{roomClassId}` | ADMIN | Set Requirements |

*Rules and error conditions (code, message), 3 in total:*

| Code | Message |
|---|---|
|  | This furniture type does not exist. |
|  | This Room Class does not exist. |
| TYPE_REQUIRED | A Room Class requires  |

#### 3.4.3 Door Code

Staff and Manager › Door codes (ADR-23, spec §6.8): set, import, confirm and view the code of each Room.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/door-codes` | signed in | List |
| POST | `/door-codes/import` | signed in | Import Csv |
| POST | `/door-codes/{room}` | signed in | Propose |
| POST | `/door-codes/{room}/confirm` | signed in | Confirm |
| POST | `/door-codes/{room}/cancel` | signed in | Cancel |
| POST | `/door-codes/{room}/reveal` | signed in | Reveal |

*Rules and error conditions (code, message), 3 in total:*

| Code | Message |
|---|---|
| DOOR_CODE_NOT_READY | Your door code is not ready yet. |
| NO_PROPOSED_CODE | Room  |
|  | You do not hold a Bed this Term. |

#### 3.4.4 Furniture

Staff and Manager › Furniture: items, the Block stores, moves and transfers (spec §6.19).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/furniture` | signed in | List |
| GET | `/furniture/{id}` | signed in | Detail |
| POST | `/furniture` | signed in | Register |
| PUT | `/furniture/{id}` | signed in | Update |
| GET | `/furniture/stock` | signed in | Stock |
| GET | `/furniture/moves` | signed in | Moves |
| POST | `/furniture/moves` | signed in | Move |
| POST | `/furniture/moves/{id}/done` | signed in | Done |
| POST | `/furniture/moves/{id}/cancel` | signed in | Cancel |

*Rules and error conditions (code, message), 7 in total:*

| Code | Message |
|---|---|
| CROSS_BLOCK | Only a Manager moves furniture to another Block. |
| ITEM_DISPOSED | Item  |
| MOVE_CLOSED | This move is already  |
| MOVE_PLANNED | Item  |
|  | This furniture item does not exist. |
|  | This move does not exist. |
| SAME_LOCATION | Item  |

#### 3.4.5 Inventory

Staff and Manager › Inventory (Block-scoped).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/inventory/structure` | signed in | Structure |
| GET | `/inventory/rooms` | signed in | Rooms |
| POST | `/inventory/room-codes` | signed in | Room Codes |
| GET | `/inventory/rooms/{code}` | signed in | Room |
| GET | `/inventory/rooms/{code}/details` | signed in | Details |
| GET | `/inventory/rooms/{code}/hub` | signed in | Hub |
| POST | `/inventory/rooms/{code}/out-of-service` | signed in | Out Of Service |
| POST | `/inventory/rooms/{code}/back-in-service` | signed in | Back In Service |

*Validation messages:* Choose a reason. · Keep the note under 500 characters.

*Rules and error conditions (code, message), 5 in total:*

| Code | Message |
|---|---|
| BAD_PARAMETER | Choose a Block. |
| ROOM_ALREADY_OUT_OF_SERVICE | Room  |
| ROOM_IN_SERVICE | Room  |
| ROOM_OCCUPIED | Move the  |
| ROOM_PROMISED | Beds of Room  |

#### 3.4.6 Room Class

Manager › Room Classes: the Room Class of every Room per Term (ADR-24; reading also for Staff and the Admin).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/inventory/room-classes` | signed in | List |
| PUT | `/inventory/room-classes` | signed in | Set |

*Rules and error conditions (code, message), 2 in total:*

| Code | Message |
|---|---|
| ROOM_CLASS_LOCKED | Beds of Room  |
| TERM_STARTED | The stay of  |

#### 3.4.7 Student Room

Student › My Room: the door code of the student's Room and its furniture (web now, Android later).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/door-code` | STUDENT | Door Code |
| POST | `/students/me/door-code/reveal` | STUDENT | Reveal |
| GET | `/students/me/furniture` | STUDENT | Furniture |
| PUT | `/students/me/furniture/report` | STUDENT | Report |

*Rules and error conditions (code, message), 10 in total:*

| Code | Message |
|---|---|
| CROSS_BLOCK | Only a Manager moves furniture to another Block. |
| DOOR_CODE_NOT_READY | Your door code is not ready yet. |
| ITEM_DISPOSED | Item  |
| MOVE_CLOSED | This move is already  |
| MOVE_PLANNED | Item  |
| NO_PROPOSED_CODE | Room  |
|  | You do not hold a Bed this Term. |
|  | This furniture item does not exist. |
|  | This move does not exist. |
| SAME_LOCATION | Item  |

### 3.5 Applications (APP)

17 endpoints in 3 controllers.

#### 3.5.1 Application

Application wizard and the student's Application.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/applications/eligibility` | signed in | Eligibility |
| POST | `/applications/roommate-check` | signed in | Roommate Check |
| POST | `/applications` | signed in | Create |
| GET | `/applications/{id}` | signed in | Detail |
| GET | `/applications` | signed in | Queue |
| POST | `/applications/{id}/review` | signed in | Review |
| POST | `/applications/bulk-review` | signed in | Bulk Review |
| POST | `/applications/{id}/cancel` | signed in | Cancel |
| POST | `/roommate-invitations/{id}/respond` | signed in | Respond |

*Validation messages:* Enter the student code. · Enter a valid student code. · Enter a phone number of 8 to 15 digits. · Enter a valid email. · Use at most 150 characters. · Keep the reason under 500 characters. · Accept or decline the invitation. · Choose Approved or Rejected. · Keep the note under 500 characters. · Select at least one Application. · Choose a decision.

*Rules and error conditions (code, message), 15 in total:*

| Code | Message |
|---|---|
| ALREADY_DECIDED | Application  |
| BAD_PARAMETER | Unknown status  |
| BLOCK_OUT_OF_SCOPE | This Application belongs to a Block you do not manage. |
| CANNOT_CANCEL | This Application can no longer be cancelled here.  |
| CLAIM_WAITING | A Manager is checking your transfer. Cancel once it is confirmed or rejected. |
| INVITATION_CLOSED | This invitation is no longer open. |
| NO_STUDENT_RECORD | Your student record was not found. Contact the dormitory office. |
| NOT_ELIGIBLE | You cannot apply for  |
|  | This Application does not exist. |
|  | This Term does not exist. |

*+5 more in section 5.3.*

#### 3.5.2 Round2

A Waitlisted student's Round-2 offer, and the Managers' list of offers.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/round2/offers` | signed in | Offers |
| POST | `/applications/{id}/withdraw` | signed in | Withdraw |
| GET | `/students/me/round2-offer` | STUDENT | Mine |
| POST | `/round2-offers/{id}/respond` | signed in | Respond |

*Rules and error conditions (code, message), 3 in total:*

| Code | Message |
|---|---|
| NOT_WAITLISTED | Only an Application on the waitlist can be withdrawn. |
|  | This offer does not exist. |
| OFFER_CLOSED | This offer is no longer open. |

#### 3.5.3 Student

/students/me/** screens owned by Applications (/students/** is Student only).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/home` | STUDENT | Home |
| GET | `/students/me/profile` | STUDENT | Profile |
| GET | `/students/me/applications` | STUDENT | Applications |
| GET | `/students/me/roommate-invitation` | STUDENT | Roommate Invitation |

*Rules and error conditions (code, message), 1 in total:*

| Code | Message |
|---|---|
|  | Your student record was not found. |

### 3.6 Assignment and residence (ASG)

63 endpoints in 9 controllers.

#### 3.6.1 Assignment

Assignment runs: a Manager starts a run, resolves conflicts and commits a Block's proposal (ADR-19).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/assignment-runs` | signed in | Runs |
| POST | `/assignment-runs` | signed in | Start |
| GET | `/round2` | signed in | Round2 |
| POST | `/round2/run` | signed in | Run Round2 |
| GET | `/assignment-runs/{runId}/proposal` | signed in | Proposal |
| GET | `/assignment-runs/{runId}/conflicts/{applicationId}` | signed in | Conflict |
| POST | `/assignment-runs/{runId}/conflicts/{applicationId}/resolve` | signed in | Resolve |
| POST | `/assignment-runs/{runId}/commit` | signed in | Commit |
| GET | `/assignment-runs/{runId}/rooms` | signed in | Rooms |
| POST | `/assignment-runs/{runId}/approve` | signed in | Approve |
| POST | `/assignment-runs/{runId}/return` | signed in | Return To Staff |
| GET | `/approvals/assignment` | signed in | Approval |

*Validation messages:* Choose a Block. · Tell Staff what to change. · Keep the comment under 500 characters.

*Rules and error conditions (code, message), 12 in total:*

| Code | Message |
|---|---|
| ASSIGNMENT_IN_REVIEW | A Round-1 proposal of this Term is still in review. Commit or discard it before Round 2. |
| BLOCK_SUBMITTED | Block  |
|  | CONFLICTS_LEFT |
| DRY_RUN | A dry run is a preview: it cannot be changed or submitted. |
| NO_BED_LEFT | No free Bed of that kind is left. Choose another option or the waitlist. |
| NOT_SUBMITTED | Block  |
|  | This run does not exist. |
|  | This Application is not in the run. |
|  | RENEWAL_REQUESTS_OPEN |
| RENEWAL_FILING | Continuing residents can still file next-Term requests |

*+2 more in section 5.3.*

#### 3.6.2 Check Out Furniture

Furniture at check-out: Staff record conditions (/check-outs/{allocationId/furniture}), attribute shared damage (/check-outs/{allocationId/damage-claims}); Managers review items a student did not accept; the student reads, agrees and answers claims (/students/me/check-out).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/check-outs/{allocationId}/furniture` | signed in | View |
| PUT | `/check-outs/{allocationId}/furniture` | signed in | Record |
| POST | `/check-outs/{allocationId}/damage-claims` | signed in | Claim |
| GET | `/check-out-reviews` | signed in | Reviews |
| POST | `/check-out-reviews/{allocationId}/{itemId}` | signed in | Decide |
| GET | `/students/me/check-out` | STUDENT | Mine |
| POST | `/students/me/check-out/agree` | STUDENT | Agree |
| POST | `/students/me/damage-claims/{id}` | STUDENT | Answer |

*Validation messages:* Enter a reading of 0 or more. · Enter a valid reading. · Keep the note under 300 characters. · Keep the reason under 300 characters.

*Rules and error conditions (code, message), 7 in total:*

| Code | Message |
|---|---|
| ALREADY_CHECKED_OUT | This student has already checked out. |
| NOTHING_TO_AGREE | Staff have not recorded your check-out yet. |
| NOTHING_TO_REVIEW | This item is not waiting for a Manager. |
|  | No check-out to review. |
|  | This damage record does not exist. |
|  | This damage record does not exist or can no longer be answered. |
|  | This Allocation does not exist. |

#### 3.6.3 Desk

The Check-in and Check-out desk (Staff and Managers of the Block).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/check-in/today` | signed in | Today |
| GET | `/check-in/lookup` | signed in | Lookup |
| POST | `/check-in` | signed in | Check In |
| GET | `/check-out` | signed in | Check Out List |
| GET | `/check-out/{allocationId}` | signed in | Check Out Detail |
| POST | `/check-out/{allocationId}` | signed in | Check Out |
| GET | `/check-out/readings` | signed in | Room Readings |
| PUT | `/check-out/readings` | signed in | Save Room Readings |
| GET | `/check-out/readings/template` | signed in | Room Readings Template |
| POST | `/check-out/readings` | signed in | Upload Room Readings |

*Validation messages:* Look up the student first. · Keep the note under 500 characters. · Enter a reading of 0 or more. · Enter a valid reading. · The damage charge cannot be negative. · Enter a valid amount.

*Rules and error conditions (code, message), 7 in total:*

| Code | Message |
|---|---|
| CHECK_IN_BLOCKED | Check-in is blocked:  |
| NOT_CHECKED_IN | This student has not checked in yet and cannot check out. |
|  | No Bed is allocated to this student. |
|  | ALREADY_CHECKED_IN |
|  | MANY_MATCHES |
|  | This student does not live in the Room. |
| STUDENT_NOT_AGREED | The student has not agreed with the furniture charges yet. Ask them to agree on the app. |

#### 3.6.4 Handover

The check-in inventory: the student's own (/students/me/handover, mobile app) and Staff's review of their Blocks' inventories (/handovers, web).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/handover` | STUDENT | Mine |
| POST | `/students/me/handover/start` | STUDENT | Start |
| PUT | `/students/me/handover` | STUDENT | Save |
| POST | `/students/me/handover/photos` | STUDENT | Add Photo |
| DELETE | `/students/me/handover/photos/{id}` | STUDENT | Remove Photo |
| POST | `/students/me/handover/submit` | STUDENT | Submit |
| POST | `/students/me/handover/agree` | STUDENT | Agree |
| POST | `/students/me/handover/late` | STUDENT | Late |
| GET | `/handovers` | signed in | List |
| GET | `/handovers/{id}` | signed in | Detail |
| POST | `/handovers/{id}/confirm` | signed in | Confirm |
| POST | `/handovers/{id}/visit` | signed in | Visit |
| PUT | `/handovers/{id}/verification` | signed in | Verification |
| POST | `/handovers/{id}/cancel` | signed in | Cancel |
| POST | `/handovers/{id}/late` | signed in | Accept Late |

*Validation messages:* Keep your comment under 500 characters. · Describe what you found in at most 500 characters. · Keep the reason under 500 characters.

*Rules and error conditions (code, message), 16 in total:*

| Code | Message |
|---|---|
| CHECK_IN_NOT_READY | The door code cannot be released yet. Try again later. |
| INVENTORY_FINAL | A final inventory cannot be cancelled. |
| INVENTORY_NOT_STARTED | Start the check-in inventory first. |
| INVENTORY_STARTED | Your check-in inventory is already started. |
| INVENTORY_SUBMITTED | Your check-in inventory is already submitted. |
| LATE_ALREADY_SENT | You already sent a late report. |
| LATE_NOT_ALLOWED | Only an inventory closed by its deadline takes a late report. |
| MAJOR_NEEDS_VISIT | An inventory with a major difference is checked in the Room with the student: set a visit. |
| NO_INVENTORY_NEEDED | You have no Room to receive with a check-in inventory. |
| NO_LATE_REPORT | The student sent no late report. |

*+6 more in section 5.3.*

#### 3.6.5 Late Check In

Late check-ins: students ask online, Staff record them at the desk (A-12), a Manager decides.

| Method | Path | Access | Function |
|---|---|---|---|
| POST | `/late-check-ins` | signed in | Create |
| GET | `/students/me/late-check-in` | STUDENT | Mine |
| POST | `/students/me/late-check-in` | STUDENT | Request |
| GET | `/late-check-ins` | signed in | List |
| POST | `/late-check-ins/{id}/decision` | signed in | Decide |

*Validation messages:* Keep the reason under 500 characters.

*Rules and error conditions (code, message), 7 in total:*

| Code | Message |
|---|---|
| ALREADY_CHECKED_IN | You have already checked in. |
| ALREADY_DECIDED | This late check-in was already decided. |
| LATE_REQUEST_CLOSED | The check-in period has ended. Ask the dormitory desk about a late check-in. |
| LATE_REQUEST_EXISTS | You already asked for a late check-in this Term: one request per Term. |
|  | This student has no Bed waiting for check-in. |
|  | You do not hold a Bed waiting for check-in. |
|  | This late check-in does not exist. |

#### 3.6.6 Operational Move

Operational moves during a Term (spec §6.13): Staff inside their Blocks, Managers everywhere; nothing is charged.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/operational-moves/options` | signed in | Options |
| POST | `/operational-moves` | signed in | Move |
| GET | `/operational-moves` | signed in | List |

*Validation messages:* Keep the note under 500 characters.

*Rules and error conditions (code, message), 8 in total:*

| Code | Message |
|---|---|
| BED_NOT_AVAILABLE | This Bed is not free any more. Choose another one. |
| CLAIM_WAITING | The student said they paid the next-Term fee. Confirm or |
| CROSS_BLOCK | A move to another Block is decided by a Manager. |
| MANAGER_DECIDES | The next-Term fees are issued: only a Manager moves a student for the next Term now. |
| NO_PRICE | Room  |
|  | No student has this code. |
|  | This student holds no Bed. |
| PRICE_DIFFERS | The next-Term fee is paid: move this student only to a |

#### 3.6.7 Renewal

The Term transition for Staff and Managers (spec §5.1, §6.10): the requests windows and their overview, the next-Term fees (Managers) and the turnover between two Terms.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/renewals` | signed in | Windows |
| GET | `/renewals/overview` | signed in | Overview |
| GET | `/next-term-fees` | signed in | Preview |
| POST | `/next-term-fees/issue` | signed in | Issue |
| GET | `/turnover` | signed in | Turnover |
| POST | `/turnover/meter-cuts` | signed in | Meter Cut |

*Validation messages:* Choose a Term.

*Rules and error conditions (code, message), 4 in total:*

| Code | Message |
|---|---|
|  | FEES_BLOCKED |
|  | This Term has no requests window: it has no renewal milestones. |
|  | No Term has a requests window yet. |
| WINDOW_NOT_OPEN | The requests window of  |

#### 3.6.8 Student Allocation

The student's Room, Bed, roommates, Check-in window and Balance Invoice.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/allocation` | STUDENT | Mine |

#### 3.6.9 Termination

Terminations of stays (spec §6.15): Managers start and cancel them; Staff read those of their Blocks.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/terminations` | signed in | List |
| POST | `/terminations` | signed in | Start |
| POST | `/terminations/{id}/cancel` | signed in | Cancel |

*Validation messages:* Keep the note under 500 characters. · Keep the reason under 500 characters.

*Rules and error conditions (code, message), 5 in total:*

| Code | Message |
|---|---|
| ALREADY_TERMINATED | This stay is already terminated. |
|  | This student does not live in the dormitory. |
|  | This termination does not exist. |
| TERMINATION_CLOSED | This termination is already closed. |
| TERMINATION_OVERDUE | This termination is overdue: the next-Term Bed was  |

### 3.7 Billing (BIL)

30 endpoints in 5 controllers.

#### 3.7.1 Finance

Block Finance: figures, Invoices, overdue Invoices and reminders, refunds.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/finance/summary` | signed in | Summary |
| GET | `/finance/overdue` | signed in | Overdue |
| POST | `/finance/reminders` | signed in | Remind |
| GET | `/invoices` | signed in | Invoices |
| GET | `/refunds` | signed in | Refunds |
| POST | `/refunds/{id}/account-reminder` | signed in | Remind Account |
| GET | `/students/me/refunds` | STUDENT | My Refunds |
| POST | `/refunds/{id}/decision` | signed in | Decide Refund |
| POST | `/refunds/{id}/paid` | signed in | Mark Refund Paid |

*Validation messages:* Send at most 200 reminders at a time. · Keep the note under 500 characters. · Keep the reference under 100 characters.

*Rules and error conditions (code, message), 7 in total:*

| Code | Message |
|---|---|
| ACCOUNT_ENTERED | The student already entered their bank account. |
| ALREADY_DECIDED | This refund was already decided. |
| ALREADY_REMINDED | The student was reminded less than a day ago. |
| NOT_REFUND_APPROVER | This refund is decided by  |
|  | This refund does not exist. |
| REFUND_CLOSED | This refund no longer waits for a transfer. |
| REFUND_NOT_APPROVED | Only an approved refund can be marked paid. |

#### 3.7.2 Meter

Meter readings per Block and month; closing a period issues the Utility Invoices.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/meter-periods` | signed in | Periods |
| GET | `/meter-periods/{id}/readings` | signed in | Readings |
| GET | `/meter-periods/{id}/readings/{room}` | signed in | Room |
| PUT | `/meter-periods/{id}/readings/{room}` | signed in | Save |
| POST | `/meter-periods/{id}/readings/{room}/confirm` | signed in | Confirm |
| GET | `/meter-periods/{id}/template` | signed in | Template |
| POST | `/meter-periods/{id}/import` | signed in | Import Csv |
| POST | `/meter-periods/{id}/close` | signed in | Close |

*Validation messages:* Enter a valid reading.

*Rules and error conditions (code, message), 7 in total:*

| Code | Message |
|---|---|
|  | READINGS_MISSING |
|  | Room  |
|  | This period does not exist. |
| PERIOD_CLOSED | This period is closed: its Invoices are issued. |
| PERIOD_NOT_ENDED | This month has not ended yet. Close it from the first day of next month. |
| READING_MISSING | Enter the reading before you confirm it. |
| READINGS_TO_CHECK | Confirm the  |

#### 3.7.3 Payment Claim

Payment claims (ADR-22, spec §6.7): the student's "I have transferred" and the Managers' queue, where claims are confirmed or rejected one by one or in bulk.

| Method | Path | Access | Function |
|---|---|---|---|
| POST | `/invoices/{id}/claim` | signed in | Claim |
| GET | `/payment-claims` | signed in | List |
| POST | `/payment-claims/{invoiceId}/receipt` | signed in | Attach Receipt |
| POST | `/payment-claims/confirm` | signed in | Confirm |
| POST | `/payment-claims/reject` | signed in | Reject |

*Validation messages:* Keep the reference under 60 characters. · Select at most 200 Invoices at a time. · Keep the reason under 500 characters.

*Rules and error conditions (code, message), 7 in total:*

| Code | Message |
|---|---|
| ALREADY_PAID | This Invoice is already paid. |
| CLAIM_WAITING | You already said you transferred this Invoice. A Manager is checking it. |
| DEADLINE_PASSED | The deadline of this Invoice has passed. |
| INVOICE_NOT_PAYABLE | This Invoice cannot be paid: it is  |
| NO_CLAIM_WAITING | No payment claim is waiting for this Invoice. |
|  | This Invoice does not exist. |
| UTILITY_OVERDUE | Pay your overdue Utility Invoice first, then the next-Term fee. |

#### 3.7.4 Payment Desk

Manager › Payments: Invoices in scope and the confirmation of one Invoice with a receipt.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/payments` | signed in | List |
| POST | `/payments/{invoiceId}/confirm` | signed in | Confirm |
| GET | `/payments/{invoiceId}/receipt-file` | signed in | Receipt File |

*Rules and error conditions (code, message), 1 in total:*

| Code | Message |
|---|---|
|  | No receipt is attached to this Payment. |

#### 3.7.5 Student Invoice

Student › Payments.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/invoices` | STUDENT | Mine |
| GET | `/invoices/{id}` | signed in | Detail |
| GET | `/invoices/{id}/payment` | signed in | Payment |
| POST | `/invoices/{id}/payment/refresh` | signed in | Refresh |
| GET | `/invoices/{id}/receipt` | signed in | Receipt |

*Rules and error conditions (code, message), 2 in total:*

| Code | Message |
|---|---|
| NO_BANK_ACCOUNT | No bank account is configured for transfers yet. |
| NOT_PAID | A receipt is available once the Invoice is paid. |

### 3.8 Requests and Term transition (REQ)

26 endpoints in 6 controllers.

#### 3.8.1 Escalation

Block Manager › Escalations; an item is addressed by its request's code (MR-…, RC-…).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/escalations` | signed in | List |
| POST | `/escalations/{id}/actions` | signed in | Act |

*Validation messages:* Keep the note under 1,000 characters.

*Rules and error conditions (code, message), 2 in total:*

| Code | Message |
|---|---|
| ESCALATION_HANDLED | This escalation was already handled. |
|  | This escalation does not exist. |

#### 3.8.2 Next Term Request

Next-Term requests besides room changes and swaps (spec §6.10, §6.11): extensions and the end of the stay; and every open request of a requests window in one list, decided in bulk.

| Method | Path | Access | Function |
|---|---|---|---|
| POST | `/students/me/stay/extension` | STUDENT | Extend |
| POST | `/students/me/stay/end` | STUDENT | End |
| GET | `/stay-requests` | signed in | Stay Requests |
| POST | `/stay-requests/{id}/decision` | signed in | Decide Stay Request |
| GET | `/next-term-requests` | signed in | Open |
| POST | `/next-term-requests/decision` | signed in | Decide |

*Validation messages:* Keep the note under 1,000 characters. · Keep the reason under 500 characters. · Decide at most 200 requests at once. · Keep the reason under 1,000 characters.

*Rules and error conditions (code, message), 4 in total:*

| Code | Message |
|---|---|
| BED_NOT_AVAILABLE | No matching Bed is free for this request. |
|  | No requests window is open. |
|  | This request does not exist. |
| OPEN_REQUEST | You already have an extension waiting for Staff. |

#### 3.8.3 Room Change

Room-Change Requests: the student asks, Staff of the Block decide.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/room-changes/options` | signed in | Options |
| POST | `/room-changes` | signed in | Create |
| GET | `/room-changes` | signed in | Queue |
| GET | `/room-changes/{id}/matching-beds` | signed in | Matching Beds |
| POST | `/room-changes/{id}/decision` | signed in | Decide |

*Validation messages:* Keep the details under 1,000 characters. · Keep the message under 1,000 characters.

*Rules and error conditions (code, message), 8 in total:*

| Code | Message |
|---|---|
| ALREADY_DECIDED | This request was already decided. |
| BED_NOT_AVAILABLE | This Bed is not free for this request any more. Choose another one. |
| EXTEND_FIRST | This is the last Term of your stay: ask for an extension first. |
|  | This Room-Change Request does not exist. |
|  | ALLOCATION_ENDED |
| OPEN_REQUEST | You already have an open Room-Change Request for this Term. |
| OVERDUE_INVOICE | Pay your overdue Invoice before you ask for a room change. |
| RESERVED_FOR_NEW_STUDENTS | The free Beds of this kind are kept for new students. |

#### 3.8.4 Routing

Block Manager › Routing rules and escalation timers.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/routing-rules` | signed in | Page |
| POST | `/routing-rules` | signed in | Create |
| PUT | `/routing-rules/timers` | signed in | Timers |
| PUT | `/routing-rules/{id}` | signed in | Update |

*Rules and error conditions (code, message), 1 in total:*

| Code | Message |
|---|---|
|  | This routing rule does not exist. |

#### 3.8.5 Student Requests

The student's Maintenance and Room-Change Requests.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/requests` | STUDENT | Mine |

#### 3.8.6 Swap

Bed swaps: direct invitations, the swap board, the invited student's answer and the Staff/Manager decision.

| Method | Path | Access | Function |
|---|---|---|---|
| POST | `/swaps` | signed in | Direct |
| GET | `/swap-board` | signed in | Board |
| PUT | `/swap-board/my-post` | signed in | My Post |
| POST | `/swap-board/posts/{id}/request` | signed in | Request |
| GET | `/swap-invitations/{id}` | signed in | Invitation |
| POST | `/swap-invitations/{id}/respond` | signed in | Respond |
| GET | `/swaps` | signed in | Queue |
| POST | `/swaps/{id}/decision` | signed in | Decide |

*Validation messages:* Keep the reason under 500 characters.

*Rules and error conditions (code, message), 10 in total:*

| Code | Message |
|---|---|
| ALLOCATION_ENDED | One of you no longer holds the Bed. |
| ALREADY_DECIDED | This swap is not waiting for a decision. |
| INVITATION_CLOSED | This swap invitation is no longer open. |
| MANAGER_DECIDES | A swap between Blocks is decided by a Manager. |
| NOT_A_MATCH | Your Bed is not what this student is looking for. |
|  | This post is no longer on the board. |
|  | This swap does not exist. |
| OPEN_SWAP | You already have a swap waiting. Wait for it or let it expire. |
| OVERDUE_INVOICE | Pay your overdue Invoice before you ask for a swap. |
| SWAP_CHECKS_FAILED | The swap does not pass the rule check any more. |

### 3.9 Maintenance and inspections (MNT)

27 endpoints in 2 controllers.

#### 3.9.1 Inspection

Inspections: checklists (Admin), schedules (Block Manager) and runs (Staff).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/inspection-checklists` | signed in | Checklists |
| POST | `/inspection-checklists` | signed in | Create Checklist |
| POST | `/inspection-checklists/{id}/publish` | signed in | Publish |
| POST | `/inspection-checklists/{id}/archive` | signed in | Archive |
| PUT | `/inspection-checklists/{id}` | signed in | Rename Checklist |
| POST | `/inspection-checklists/{id}/restore` | signed in | Restore Checklist |
| DELETE | `/inspection-checklists/{id}` | signed in | Delete Checklist |
| GET | `/inspection-schedules` | signed in | Schedules |
| POST | `/inspection-schedules` | signed in | Create Schedule |
| PUT | `/inspection-schedules/{id}` | signed in | Update Schedule |
| GET | `/inspection-runs/current` | signed in | Current |
| GET | `/inspection-runs` | signed in | List |
| GET | `/inspection-runs/{id:INS-\\d+\|\\d+}` | signed in | Run |
| POST | `/inspection-runs/{id}/rooms/{room}/photos` | signed in | Add Photo |
| DELETE | `/inspection-runs/{id}/rooms/{room}/photos/{photoId}` | signed in | Remove Photo |
| GET | `/inspection-runs/upcoming` | signed in | Upcoming |
| GET | `/inspection-runs/{id}/rooms` | signed in | Rooms |
| PUT | `/inspection-runs/{id}/rooms/{room}` | signed in | Save Room |
| POST | `/inspection-runs/{id}/rooms/{room}/unreachable` | signed in | Unreachable |
| POST | `/inspection-runs/{id}/submit` | signed in | Submit |

*Validation messages:* Enter a name of at most 150 characters. · Use at most 100 items.

*Rules and error conditions (code, message), 10 in total:*

| Code | Message |
|---|---|
| CHECKLIST_ARCHIVED | This checklist is already archived. |
| CHECKLIST_IN_USE | This checklist has already been used in inspection schedules or runs and cannot be deleted. Archive it instead to preserve history. |
| CHECKLIST_NOT_PUBLISHED | The checklist of this schedule is not published. |
| INSPECTION_NOT_ASSIGNED | This inspection run is assigned to another staff member. |
| NOT_ARCHIVED | Only an archived checklist can be restored. |
|  | This checklist does not exist. |
|  | This inspection run does not exist. |
|  | This inspection schedule does not exist. |
| ROOM_DONE | This Room is already inspected. |
| RUN_SUBMITTED | This inspection run is already submitted. |

#### 3.9.2 Maintenance

Maintenance Requests.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/maintenance-requests/options` | signed in | Options |
| POST | `/maintenance-requests` | signed in | Report |
| GET | `/maintenance-requests` | signed in | Queue |
| GET | `/maintenance-requests/{id}` | signed in | Detail |
| PATCH | `/maintenance-requests/{id}` | signed in | Update |
| POST | `/maintenance-requests/{id}/updates` | signed in | Add Update |
| POST | `/maintenance-requests/{id}/confirm` | signed in | Confirm |

*Validation messages:* Keep the comment under 500 characters. · Keep the update under 2,000 characters.

*Rules and error conditions (code, message), 5 in total:*

| Code | Message |
|---|---|
| ASSIGNED_TO_SOMEONE_ELSE | This request is assigned to  |
| NOT_CHECKED_IN | You can report a problem once you have checked in to your Room. |
| NOT_RESOLVED | You can confirm the fix once the request is resolved. |
| NOT_STARTED | Assign the request before you mark it resolved. |
| REQUEST_CLOSED | This request is closed and cannot change. |

### 3.10 Notifications (NTF)

16 endpoints in 4 controllers.

#### 3.10.1 Admin Messaging

Admin › Notification templates and Send email.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/admin/notification-templates` | ADMIN | Templates |
| PUT | `/admin/notification-templates/{key}` | ADMIN | Save Template |
| POST | `/admin/notification-templates/{key}/test` | ADMIN | Test Template |
| GET | `/admin/emails/options` | ADMIN | Email Options |
| POST | `/admin/emails/preview` | ADMIN | Preview |
| POST | `/admin/emails` | ADMIN | Send |

*Rules and error conditions (code, message), 1 in total:*

| Code | Message |
|---|---|
|  | This notification template does not exist. |

#### 3.10.2 Announcement

Announcements (A-30, spec §6.5): /announcements for Staff (residents of their Blocks), Managers and the Admin; /students/me/board for students, the announcements shown to them now.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/board` | STUDENT | Board |
| GET | `/announcements` | signed in | List |
| GET | `/announcements/options` | signed in | Options |
| POST | `/announcements` | signed in | Create |
| PUT | `/announcements/{id}` | signed in | Change |

*Rules and error conditions (code, message), 2 in total:*

| Code | Message |
|---|---|
|  | This notification does not exist. |
|  | This announcement does not exist. |

#### 3.10.3 Device

Android registers its FCM token after sign-in and on refresh, and removes it before sign-out.

| Method | Path | Access | Function |
|---|---|---|---|
| POST | `/devices` | signed in | Register |
| POST | `/devices/unregister` | signed in | Unregister |

*Validation messages:* The device token is too long.

#### 3.10.4 Notification

/notifications: the bell of every layout (all roles); a student's also lists the board's announcements (C-41).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/notifications` | signed in | List |
| POST | `/notifications/read-all` | signed in | Read All |
| POST | `/notifications/{id}/read` | signed in | Read |

*Rules and error conditions (code, message), 1 in total:*

| Code | Message |
|---|---|
| BAD_PARAMETER | Limit must be between 1 and  |

### 3.11 Reports (RPT)

10 endpoints in 2 controllers.

#### 3.11.1 Report

Dashboards, reports and exports.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/dashboards/staff` | signed in | Staff |
| GET | `/dashboards/manager` | signed in | Manager |
| GET | `/dashboards/term` | signed in | Term |
| GET | `/dashboards/admin` | signed in | Admin |
| GET | `/approvals/summary` | signed in | Approvals |
| GET | `/reports/occupancy` | signed in | Occupancy |
| GET | `/reports/financial` | signed in | Financial |
| GET | `/reports/block` | signed in | Block |
| GET | `/exports/{report}` | signed in | Export |

*Rules and error conditions (code, message), 1 in total:*

| Code | Message |
|---|---|
|  | There is no export called  |

#### 3.11.2 Search

The back-office search in the top bar (Staff, Managers, Admin).

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/search` | signed in | Search |

### 3.12 Family Day (VIS)

21 endpoints in 4 controllers.

#### 3.12.1 Family Day

Family Days for Managers (organise) and the Block's Staff (read): ADR-29, contract A-69.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/family-days` | signed in | List |
| POST | `/family-days` | signed in | Create |
| GET | `/family-days/{id}` | signed in | Detail |
| PUT | `/family-days/{id}` | signed in | Update |
| POST | `/family-days/{id}/publish` | signed in | Publish |
| POST | `/family-days/{id}/cancel` | signed in | Cancel |
| POST | `/family-days/{id}/close` | signed in | Close |
| GET | `/family-days/{id}/registrations` | signed in | Registrations |
| POST | `/family-day-registrations/{id}/cancel` | signed in | Cancel Registration |

*Validation messages:* Keep the reason under 500 characters. · Keep the note under 500 characters.

*Rules and error conditions (code, message), 7 in total:*

| Code | Message |
|---|---|
| FAMILY_DAY_ENDED | This Family Day is already cancelled or completed. |
| FAMILY_DAY_IN_THE_PAST | Registration must close and the first time slot must start in the future. Edit the dates first. |
| FAMILY_DAY_NOT_DRAFT | This Family Day is already published. |
| FAMILY_DAY_NOT_OVER | The last time slot ends at  |
| FAMILY_DAY_NOT_PUBLISHED | Only a published Family Day can be closed. |
| FAMILY_DAY_STARTED | Guests have already come in. Close the Family Day instead of cancelling it. |
|  | This registration does not exist. |

#### 3.12.2 Family Day Stats

Family Day statistics for Staff, Managers and the Admin: contract A-71.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/family-day-stats` | signed in | Overview |
| GET | `/family-days/{id}/stats` | signed in | Stats |

*Rules and error conditions (code, message), 1 in total:*

| Code | Message |
|---|---|
| FAMILY_DAY_CANCELLED_NO_STATS | This Family Day was cancelled, so it has no statistics. |

#### 3.12.3 Student Family Day

A resident's Family Days, guests and passes: ADR-29, contract A-69.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/family-days` | STUDENT | List |
| GET | `/students/me/family-days/{id}` | STUDENT | Detail |
| POST | `/students/me/family-days/{id}/registration` | STUDENT | Register |
| POST | `/students/me/family-days/{id}/registration/safety-confirmation` | STUDENT | Confirm Safety |
| POST | `/students/me/family-days/{id}/registration/cancel` | STUDENT | Cancel |

*Validation messages:* Keep the note under 500 characters.

*Rules and error conditions (code, message), 4 in total:*

| Code | Message |
|---|---|
| FAMILY_DAY_ALREADY_REGISTERED | You have already registered guests for this Family Day. |
| FAMILY_DAY_NOTHING_TO_CONFIRM | None of your guests is inside after their time slot, so there is nothing to confirm. |
| FAMILY_DAY_SLOT_STARTED | Your time slot has already started, so the registration can no longer be cancelled. |
|  | You have no registration for this Family Day. |

#### 3.12.4 Visitor Desk

The Family Day visitor desk (Staff of the Block, Managers): ADR-29, contract A-69.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/family-days/{id}/visitors` | signed in | Visitors |
| POST | `/family-days/{id}/overdue-reminders` | signed in | Remind Overdue |
| POST | `/family-day-visitors/verify` | signed in | Verify |
| POST | `/family-day-visitors/{id}/check-in` | signed in | Check In |
| POST | `/family-day-visitors/{id}/check-out` | signed in | Check Out |

*Validation messages:* Keep the note under 500 characters.

*Rules and error conditions (code, message), 6 in total:*

| Code | Message |
|---|---|
| FAMILY_DAY_NO_OVERDUE_GUESTS | No guest is waiting for a reminder: nobody is inside after their time slot without a confirmation. |
| FAMILY_DAY_NOT_PUBLISHED | Only a published Family Day has guests inside. |
|  | This guest does not exist. |
| VISITOR_ALREADY_IN | This guest is already checked in. |
| VISITOR_NOT_INSIDE | This guest is not checked in. |
| VISITOR_SAFETY_NOT_CONFIRMED | The student has not confirmed yet that this guest is safe. Send a reminder and check the guest |

### 3.13 AI assistant (AST)

2 endpoints in 1 controllers.

#### 3.13.1 Assistant

The students' AI assistant (ADR-28, A-68): whether it is on, and one answer to the conversation sent.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/students/me/assistant` | STUDENT | Status |
| POST | `/students/me/assistant/chat` | STUDENT | Chat |

*Validation messages:* Choose who wrote this message. · Write your question. · Use at most 2000 characters. · This conversation is not valid. Start a new one. · The conversation is too long. Start a new one.

*Rules and error conditions (code, message), 3 in total:*

| Code | Message |
|---|---|
| ASSISTANT_LIMIT | You have asked many questions in the last hour. Try again later. |
| ASSISTANT_NO_ANSWER | The assistant could not answer. Ask in other words. |
| ASSISTANT_NO_QUESTION | End the conversation with your question. |

### 3.14 Files (FILE)

1 endpoints in 1 controllers.

#### 3.14.1 File Link

GET /files/{id?exp&sig}: a stored file through a link from FileLinks.

| Method | Path | Access | Function |
|---|---|---|---|
| GET | `/files/{id}` | signed in | File |
