Sections 3.2 to 3.12 describe each function group. Every function has an ID (FR-<feature>-nn) used by the state diagrams (Report 4) and the test cases (Report 5); *Tests* names the automated test cases that check it (`docs/backend/04_Test_Catalog.md`). Screen codes are those of section 3.1.2.

### 3.2 Accounts and access (AUTH)

#### 3.2.1 FR-AUTH-01 Sign in with email and password

| Item | Description |
|---|---|
| Trigger | The user opens any page without a session, or chooses Sign in (SCR-AUTH-01 `/signin`). |
| Actors | Student, Staff, Manager, Administrator |
| Description | The user types the email and password and may tick "Remember me". The API returns a session token and the user (role, Blocks, language); the web app opens the role's home page. |
| Details | Wrong password and unknown email get the same message (no account discovery). The fifth wrong password in a row locks the account for the configured time, even if the next password is right. A locked, disabled or rejected account cannot sign in; a rejected student sees the Manager's reason. Sign-out revokes the token at once. A request without a token gets 401; a role without the permission gets 403. |
| Tests | TC-AUTH-001, 002, 003, 004, 005, 006, 008 |

#### 3.2.2 FR-AUTH-02 Sign in with an FPT Google account

| Item | Description |
|---|---|
| Trigger | "Sign in with Google" on SCR-AUTH-01 (web popup or redirect flow) or on the Android sign-in screen. |
| Actors | Student, Staff, Manager, Administrator |
| Description | Google returns an ID token (or a code the API exchanges); the API verifies it and the hosted domain `fpt.edu.vn`. An existing account signs in. An unknown FPT student address creates a student account without a password; an address that ends with the code of an imported, unused student record signs in to that record and verifies it. |
| Details | Until a new account sets a password (SCR-AUTH-05) only the setup endpoints answer. Exactly one of code and credential is accepted. A used or expired code is the user's retryable error (401); a Google outage or a wrong client secret is a server error (503), and without Google configuration the button answers that sign-in with Google is off. The redirect flow is accepted only for the web app's own sign-in page. |
| Tests | TC-AUTH-009, 010, 029–033, 038, 040, 051, 052 |

#### 3.2.3 FR-AUTH-03 Password reset, invitation and change

| Item | Description |
|---|---|
| Trigger | "Forgot password" (SCR-AUTH-02), the link of a reset or invitation email (SCR-AUTH-03, SCR-AUTH-04), the first Google sign-in (SCR-AUTH-05), or the profile's "Change password". |
| Actors | All users |
| Description | A reset email holds a one-use link; the new password replaces the old one and signs out every earlier session. An invited Staff account sets its password from the invitation link. A change needs the current password and keeps the current session. |
| Details | "Forgot password" never reveals whether the email exists. Passwords must meet the strength rule (length, letters and digits); a weak one is a field error and the link stays usable. A used or expired link is refused. |
| Tests | TC-AUTH-007, 012, 022–027 |

#### 3.2.4 FR-AUTH-04 Student account verification

| Item | Description |
|---|---|
| Trigger | A new Google account without a matching student record opens any page (redirected to SCR-AUTH-06); a Manager opens Students › Waiting for verification (SCR-AUTH-13). |
| Actors | Student, Manager |
| Description | The student fills the sign-up form: student code, full name, gender, date of birth, major, cohort, phone. The account becomes Pending verification: the student can read the board and the Term details but cannot apply. A Manager compares the form with the student list and verifies it (the important fields are locked) or rejects it with a reason (the account is locked and signed out). A later import that matches the code verifies it automatically. |
| Details | Every field and the code pattern (2 letters + 6 digits) are checked; a code already used by another account is refused. Managers are notified of each waiting account; the student is notified of the decision. |
| Tests | TC-AUTH-039, 041, 045, TC-APP-022 |

#### 3.2.5 FR-AUTH-05 Import the student list

| Item | Description |
|---|---|
| Trigger | Manager › Residents › Import student list (SCR-AUTH-15). |
| Actors | Manager, Administrator |
| Description | Download the template, upload a CSV (UTF-8; comma, semicolon or tab) or XLSX file, read the preview line by line (New, Update, Unchanged, Error with the reason), confirm. Columns: student code, full name, email, gender, date of birth, major, cohort, semester, hometown, region, enrollment status, priority groups. |
| Details | Lines are matched on the student code; a code or email repeated in the file, or an email used by another account, is an error. Confirming saves the valid lines (error lines are skipped and counted), creates and updates accounts and verifies the waiting accounts that match; optionally, students the file does not list become Not enrolled. A file is imported once. Every import is written to the Audit Log. |
| Tests | TC-AUTH-046, 047, 048 |

#### 3.2.6 FR-AUTH-06 Users, roles and permissions

| Item | Description |
|---|---|
| Trigger | Admin › System › Users and Roles (SCR-AUTH-11). |
| Actors | Administrator |
| Description | Lists back-office accounts with filters by role and Block; invites a user (email, name, role, Blocks), changes role and Blocks, disables and restores accounts; shows the permission matrix that the API enforces. |
| Details | Disabling signs the user out at once and is audited. The Admin cannot disable or demote their own account. Invitation validation names each field. |
| Tests | TC-AUTH-011, 013–017 |

#### 3.2.7 FR-AUTH-07 Staff accounts and workload

| Item | Description |
|---|---|
| Trigger | Manager › Staff accounts (SCR-AUTH-16) and Operations › Block Staff (SCR-AUTH-10). |
| Actors | Manager |
| Description | A Manager creates Staff accounts for one or more Blocks (Invited, set-password email), renames them, changes their title, Blocks, the request types they handle and their duty, disables and restores them, and sees each member's open and finished work. |
| Details | One waiting request per email; disabling signs the member out. Managers act on every Block. |
| Tests | TC-AUTH-019, 020, 021, 049, 050 |

#### 3.2.8 FR-AUTH-08 Reconcile the enrolled list

| Item | Description |
|---|---|
| Trigger | Manager › Residents › Reconciliation (SCR-AUTH-17), before the next-Term fees (M5) and again at the start of the new Term. |
| Actors | Manager |
| Description | The Manager uploads the enrolled list of a Term (recommended) or a list of leavers. The system compares it with the Term's residents, continuing residents and applicants and shows four groups (BR-23). |
| Details | Items of groups 1 and 2 must be resolved one by one with a note (audited). "Not enrolled" cancels the next-Term Allocation, rejects the Application or, during a Term, starts a termination. Next-Term fees cannot be issued while an item is open. |
| Tests | TC-AUTH-053, 054, 055 |

#### 3.2.9 FR-AUTH-09 Audit Log and student directory

| Item | Description |
|---|---|
| Trigger | Admin › System › Audit Log (SCR-AUTH-12); Manager or Staff › Students and the student hub (SCR-AUTH-13, SCR-AUTH-14). |
| Actors | Administrator (Audit Log); Manager, Staff (students) |
| Description | The Audit Log lists every configuration change, irreversible action, export, import, door-code view and demo reset with who, when, what and the old and new values, filtered by date, actor, action and object. The student hub shows a student's profile, account, Bed, Applications, Invoices, requests and history. |
| Details | Nobody can edit or delete Audit Log entries; a date range longer than allowed is refused. Managers see every student, correct directory fields (checked and audited) and lock or unlock a student account (a locked account is signed out at once); Staff see only the residents of their Blocks and cannot edit. |
| Tests | TC-AUTH-018, 042, 043, 044 |

### 3.3 Registration periods and configuration (CFG)

#### 3.3.1 FR-CFG-01 Room Types, Room Classes and default prices

| Item | Description |
|---|---|
| Trigger | Admin › Prices and fees › Room Types, Room Classes, Deposit (SCR-CFG-02, SCR-CFG-03, SCR-CFG-04). |
| Actors | Administrator |
| Description | Room Types (name, number of Beds, base price per Term, roommate invitation for 2 Beds) and Room Classes (Basic, Standard, Premium: surcharge, amenities, required furniture) are the defaults for new Terms; the Deposit percentage and refund rules are set here. |
| Details | Names are unique; changing a Room Type's Beds adds or retires Beds in its Rooms (refused when occupied); the surcharge is bounded; each screen shows where a value is used. A change creates a change announcement (BR-33). |
| Tests | TC-CFG-005, 006, 007, 008 |

#### 3.3.2 FR-CFG-02 Utility prices and Utility Deposit

| Item | Description |
|---|---|
| Trigger | Admin › Prices and fees › Utility (SCR-CFG-20). |
| Actors | Administrator |
| Description | Electricity and water unit prices with the month they apply from, the rounding rule, the Utility Deposit (estimate per month × months) and the Utility due days. |
| Details | Values outside the option lists are refused; every change is audited and announced. |
| Tests | TC-CFG-013 |

#### 3.3.3 FR-CFG-03 Rules: eligibility, priority, matching, deadlines, refunds, stay

| Item | Description |
|---|---|
| Trigger | Admin › Rules (SCR-CFG-05, SCR-CFG-06, SCR-CFG-24, SCR-CFG-25, SCR-CFG-26). |
| Actors | Administrator |
| Description | *Who may apply?* criteria as sentences with on/off and "n students fail this now"; *Who is placed first?* ordered priority groups; *How are roommates matched?* criteria with levels and weights; deadlines and reminders; refund, penalty and termination rules; stay and renewal (maximum stay length, automatic extension, reserved share, escalation before M4). |
| Details | Matching weights must total 100 %; saving creates a new snapshot that later Terms copy; a dry run shows the effect on current Applications without allocating. Out-of-range values are refused; each group lists where its settings act. |
| Tests | TC-CFG-009, 010, 024, 025 |

#### 3.3.4 FR-CFG-04 Registration-period requests

| Item | Description |
|---|---|
| Trigger | Manager › Registration › Period requests › New (SCR-CFG-22); the Admin opens the request from the notification. |
| Actors | Manager, Administrator |
| Description | A Manager proposes a Term: dates and milestones, Blocks, Rooms left out (typed or imported from an Excel or CSV list of Room codes), places per Room Type × Room Class × gender, prices and notes. Other Managers comment; the Admin comments, asks for changes with a note, rejects with a reason, or builds the Term from it (FR-CFG-05). |
| Details | Statuses: Submitted; In progress when the Admin takes it or builds the Term; Done when the Term is published. From any open status the Admin may ask for changes (Needs changes; the Manager sends it again) or reject it. One open request per target Term. Missing fields and unknown Blocks are named per field. Every Admin and Manager concerned is notified at each step. |
| Tests | TC-CFG-016, 017, 018, TC-INV-025 |

#### 3.3.5 FR-CFG-05 Build and publish a Term

| Item | Description |
|---|---|
| Trigger | Admin › Registration periods › Terms › New, or "Build the Term from this request" (SCR-CFG-01, SCR-CFG-23). |
| Actors | Administrator |
| Description | Seven-step wizard, each step saved as a draft: General, Timeline, Rooms and places, Prices, Rules, Information, Review and publish. Publishing fixes the Term's prices, Deposit, Utility Deposit and rules, creates the Term announcement and shows the Term to students. |
| Details | The Timeline step checks the milestone order (M1 ≤ M2 < M3 < M4 ≤ M5 ≤ M6 < M7, registration close ≤ results, check-in start ≥ the previous Term's check-out). A Draft with unsaved steps cannot be published. After publishing a passed date is fixed and an open deadline can only be extended; every change needs a reason and creates a change announcement. A value the Admin changes from the Manager's request needs a reason. |
| Tests | TC-CFG-001–004, 019–023 |

#### 3.3.6 FR-CFG-06 Block settings

| Item | Description |
|---|---|
| Trigger | Manager › Operations › Block settings (SCR-CFG-20 Block Settings). |
| Actors | Manager |
| Description | Desk hours, visiting and quiet hours, house rules and the urgent and normal time limits of a Block, within the Admin's limits. |
| Details | Values outside the limits or out of order are named per field; a change is audited and announced to the Block's residents. |
| Tests | TC-CFG-014, 015, TC-NTF-043 |

#### 3.3.7 FR-CFG-07 System parameters and notification texts

| Item | Description |
|---|---|
| Trigger | Admin › System › System Parameters (SCR-CFG-08); Admin › Notifications › Templates (SCR-CFG-07). |
| Actors | Administrator |
| Description | Typed parameters (limits, windows, timers) with their meaning; notification templates in Vietnamese and English with their variables. |
| Details | An invalid value is named by its key; a Manager or Staff cannot open Admin configuration (403). |
| Tests | TC-CFG-011, 012 |

#### 3.3.8 FR-CFG-08 Demo data reset

| Item | Description |
|---|---|
| Trigger | Admin › System › Demo data (SCR-CFG-27), only when the server sets `DEMO_TOOLS=true`. |
| Actors | Administrator |
| Description | The Admin chooses a stage (0 empty, A registration, B residence, C Term transition), types RESET and confirms; business data are replaced by scenarios dated relative to today; accounts, Blocks and Rooms stay. Scenario accounts and sample import files are listed for the demo. |
| Details | An unknown stage, a missing RESET or a database without the base data is refused; with the switch off every call is refused. Each reset is audited. |
| Tests | TC-CFG-026–029 |

### 3.4 Inventory, Room Classes, furniture and door codes (INV)

#### 3.4.1 FR-INV-01 Blocks, Floors, Rooms and Beds

| Item | Description |
|---|---|
| Trigger | Admin › Buildings and rooms (SCR-INV-01); Staff and Manager › Rooms (SCR-INV-10). |
| Actors | Administrator; Staff, Manager (read, out of service) |
| Description | Blocks with gender, Floors, bulk generation of Rooms by Room Type and Room Class, Beds; a Room map per Floor with each Bed's state (empty, assigned unpaid, resident, leaving, moving in next Term, out of service). Rooms go out of service and back with a reason. |
| Details | An occupied Room cannot go out of service; a Block with residents cannot change gender; generating again adds nothing; bad ranges are refused. Staff see only their Blocks; students cannot read the inventory. |
| Tests | TC-INV-001–007, 012 |

#### 3.4.2 FR-INV-02 Room Class per Room per Term

| Item | Description |
|---|---|
| Trigger | Manager › Inventory › Room Classes by Term (SCR-INV-11). |
| Actors | Manager |
| Description | Lists the Rooms of the next Term to start with each Room's class and furniture conformance; a Manager sets the class of Rooms from a Term on. |
| Details | A running Term keeps its classes; a Room whose Beds are already given for the Term keeps its class (BR-11). Only Managers set classes. |
| Tests | TC-INV-008–011 |

#### 3.4.3 FR-INV-03 Furniture types, items and QR labels

| Item | Description |
|---|---|
| Trigger | Admin › Furniture types (SCR-INV-14 Furniture types); Staff and Manager › Furniture (SCR-INV-13). |
| Actors | Administrator, Manager, Staff |
| Description | Furniture types (code, Vietnamese and English names, category, defines Room Class or standard) and the furniture each Room Class requires; items with asset code, QR label, status (In use, Broken, In repair, In store, Disposed) and place (a Room or the Block store); moves with reason and history. |
| Details | Managers register items; Staff move items inside their Block (the status follows the place and the Room's conformance changes); moves between Blocks are the Managers'. Disposed is final. Every change is recorded. |
| Tests | TC-INV-013–018 |

#### 3.4.4 FR-INV-04 Door codes

| Item | Description |
|---|---|
| Trigger | Staff › Rooms › Door codes (SCR-INV-12); a resident leaving a Room creates a "change door code" task; the student's My Room (SCR-ASG-01). |
| Actors | Staff, Student, System |
| Description | Staff draw a random code, type one or import a CSV (Room, code), set it on the lock and confirm it; the code becomes the Room's code and is released to the paid residents (FR-ASG-04). The student reveals the code behind a "show" button. |
| Details | Codes are 6 digits, never the previous one, stored encrypted; a CSV is checked line by line. Other Blocks and roles are refused. Every view is audited; push texts never contain the code. When a resident leaves, one task opens and the Block's Staff are told. |
| Tests | TC-INV-019–023 |

#### 3.4.5 FR-INV-05 Room hub

| Item | Description |
|---|---|
| Trigger | A Room code in any list or in the header search (SCR-INV-14 Room hub). |
| Actors | Staff, Manager |
| Description | One page per Room: current and next-Term residents, Room Class per Term and furniture conformance, door-code state, meter readings, Maintenance Requests and inspections. |
| Details | Staff see only Rooms of their Blocks. |
| Tests | TC-INV-024 |

### 3.5 Applications (APP)

#### 3.5.1 FR-APP-01 Term and eligibility

| Item | Description |
|---|---|
| Trigger | Student Home › the registration card › Apply (SCR-HOME-01, SCR-HOME-05, SCR-APP-01 step 1). |
| Actors | Student |
| Description | Shows the Term open for registration (dates, countdown, places, prices by Room Type × Room Class, house rules, FAQ) and checks every enabled eligibility criterion for the student. |
| Details | A failed criterion is shown with its reason and the student cannot continue; a pending account is told it must be verified; a continuing resident is sent to the next-Term requests. |
| Tests | TC-APP-001, 022, TC-CFG-023 |

#### 3.5.2 FR-APP-02 Application wizard and Deposit Invoice

| Item | Description |
|---|---|
| Trigger | SCR-APP-01 steps 2–4. |
| Actors | Student |
| Description | The student chooses a Room Type and a Room Class, a roommate mode (2-bed only), a stay length (1 to the maximum, capped by the semesters left), contact details and consent to the house rules, reviews and submits. The Application is Awaiting Deposit and a Deposit Invoice is issued (BR-06); the student is notified and sees it on Home and My Applications. |
| Details | One open Application per Term (a second is refused). Contact, consent and roommate rules are named per field. |
| Tests | TC-APP-002, 003, 023 |

#### 3.5.3 FR-APP-03 Roommate invitation

| Item | Description |
|---|---|
| Trigger | The roommate step of the wizard (SCR-APP-01) and the invitation page (SCR-APP-04). |
| Actors | Student |
| Description | For a 2-bed Room Type a student invites another student by code; the invitee accepts within the roommate window (choosing their own stay length) and pays their own Deposit, or declines. |
| Details | Every unusable code gets the same answer and the number of checks is limited (no student discovery). The first to pay waits as Awaiting Roommate; both become Submitted when both Deposits are confirmed. A declined or expired invitation leaves the inviter matched automatically. |
| Tests | TC-APP-004, 005, 006 |

#### 3.5.4 FR-APP-04 Cancel and expire an Application

| Item | Description |
|---|---|
| Trigger | "Cancel" on the Application detail (SCR-APP-03); the Deposit expiry job. |
| Actors | Student, System |
| Description | The student cancels before the assignment; an unpaid Deposit is voided, a paid one is refunded by the refund rule. An Application whose Deposit window passes without a claim expires and its Invoice is voided. |
| Details | After cancelling or expiry the student may apply again while registration is open. |
| Tests | TC-APP-007, 008 |

#### 3.5.5 FR-APP-05 Review Applications

| Item | Description |
|---|---|
| Trigger | Manager › Registration › Applications (SCR-APP-10, SCR-APP-11). |
| Actors | Manager |
| Description | A queue of Submitted Applications with filters; opening one starts the review; the Manager approves or rejects, one by one or in bulk. |
| Details | A rejection needs a note and happens once; every Manager sees every Block's Applications; Staff and students cannot review. |
| Tests | TC-APP-010, 011 |

#### 3.5.6 FR-APP-06 My Applications

| Item | Description |
|---|---|
| Trigger | Student › Registration › My Applications (SCR-APP-02, SCR-APP-03). |
| Actors | Student |
| Description | The student's Applications with status, Term, Room Type and Class, stay length, roommate, Invoices and history. |
| Details | Another student's Application answers 404; Staff cannot use student screens. |
| Tests | TC-APP-009 |

#### 3.5.7 FR-APP-07 Round 2

| Item | Description |
|---|---|
| Trigger | Manager › Registration › Round 2 (M8); the student's offer page (SCR-ASG-02). |
| Actors | Manager, Student |
| Description | Beds freed by unpaid Balances, unpaid next-Term fees, ended stays and terminations are offered to Waitlisted students; each student receives held options and accepts one (Allocated with a Balance Invoice) or declines. |
| Details | Offers expire after the configured time; an expired or declined offer returns the Bed to the pool. |
| Tests | TC-APP-020, 021 |

### 3.6 Assignment, residence and Term transition (ASG)

#### 3.6.1 FR-ASG-01 Assignment run

| Item | Description |
|---|---|
| Trigger | Manager › Registration › Assignment › Run (SCR-ASG-10). |
| Actors | Manager |
| Description | The engine places Approved Applications on free Beds of the Term: hard constraints first (gender of the Block, Room Type and Class applied for, invited pairs together), then priority groups and the matching criteria and weights of the Term's snapshot. A dry run is a preview that allocates nothing. |
| Details | Same input, same proposal (deterministic). A student no longer eligible is flagged and never placed; an invited partner missing from the run blocks the pair (PARTNER_NOT_READY); a student without a Bed gets NO_BED; a weak placement is marked LOW_FIT. A real run is refused before M3 or while next-Term requests are open (BR-13). |
| Tests | TC-ASG-001–006 |

#### 3.6.2 FR-ASG-02 Resolve conflicts

| Item | Description |
|---|---|
| Trigger | The proposal review (SCR-ASG-11). |
| Actors | Manager |
| Description | Conflicts (NO_BED, PARTNER_NOT_READY, not eligible) are listed with their reason; for each one the Manager keeps the proposal, places the student without the roommate, offers another Room Class or another Room Type and Class where Beds are free, or sends the student to the waitlist. |
| Details | Conflicts are never resolved silently; the proposal cannot be committed while a conflict is open. |
| Tests | TC-ASG-010 |

#### 3.6.3 FR-ASG-03 Approve the assignment and issue Balances

| Item | Description |
|---|---|
| Trigger | "Commit" per Block or for all Blocks on SCR-ASG-11. |
| Actors | Manager |
| Description | Committing creates the Allocations (Assigned – unpaid), marks the Applications Allocated or Waitlisted, issues the Balance Invoices (Term price − Deposit + Utility Deposit) and notifies the students; the Stay starts with the chosen stay length. |
| Details | Students and Staff cannot run or commit. Bed locks and the unique index keep one Allocation per Bed per Term (NFR-03). |
| Tests | TC-ASG-010, 011 |

#### 3.6.4 FR-ASG-04 Check-in, door code release and My Room

| Item | Description |
|---|---|
| Trigger | The release job every 15 minutes; Staff › Desk › Check-in (SCR-REQ-11); the student's My Room (SCR-ASG-01). |
| Actors | System, Staff, Student |
| Description | When the Balance is paid, the check-in start has come and the Room's code is confirmed, the code is released and the student becomes a resident (BR-14). At the desk Staff find the student by code, name or the check-in pass (QR) and record the hand-over (key, card, items). My Room shows the Room, Bed, roommates, furniture, door code, Stay and next-Term state. |
| Details | Until the Balance is paid the desk refuses check-in. Another Block's Staff do not find the student; students and the Admin have no desk. |
| Tests | TC-ASG-020, 021, 032, TC-INV-023 |

#### 3.6.5 FR-ASG-05 Late check-in

| Item | Description |
|---|---|
| Trigger | Student › Requests › Late check-in (SCR-MNT-01); Staff at the desk; Manager › Decisions (SCR-REQ-20). |
| Actors | Student, Staff, Manager |
| Description | The student (online) or Staff (desk) record the request with a reason, the requested day and an evidence file; a Manager approves with a new deadline or rejects with a reason. |
| Details | Allowed up to the check-in end plus `late_check_in.max_days`. An approved, unexpired late check-in extends the Balance deadline and the arrival deadline. |
| Tests | TC-ASG-030, 031, 037 |

#### 3.6.6 FR-ASG-06 Check-out and settlement

| Item | Description |
|---|---|
| Trigger | Staff › Desk › Check-out (SCR-REQ-12). |
| Actors | Staff, Manager (refund) |
| Description | Staff record the final meter reading, the key or card returned, the Room's condition and the damage of each furniture item. The Utility Deposit is settled (BR-24): the refund goes to a Manager, a shortfall becomes an Invoice. The Allocation ends and the Room's door code must change. |
| Details | The damage charge is the sum of the items' damage; the meter is cut and the leaver's Utility share is marked settled. Leavers not checked out by the date appear on the overdue check-out list. |
| Tests | TC-ASG-022, 023, 045, TC-BIL-029 |

#### 3.6.7 FR-ASG-07 Requests window (M2, M3)

| Item | Description |
|---|---|
| Trigger | The requests-window job at M2 and M3 of the next Term. |
| Actors | System |
| Description | At M2 every resident not leaving gets a next-Term Allocation on the same Bed: Continuing when Terms are left on the Stay, Awaiting extension in its last Term; students are told on My Room and by notification. At M3 filing closes and Beds still Awaiting extension are released (the student is told in-app and by email). |
| Details | Each milestone runs once. Maintenance Requests and late check-ins stay open after M3. |
| Tests | TC-ASG-038, 039 |

#### 3.6.8 FR-ASG-08 Next-Term fees (M6, M7)

| Item | Description |
|---|---|
| Trigger | Manager › Finance › Next-Term fees (Term transition, SCR-ASG-20); the M7 job. |
| Actors | Manager, System |
| Description | The preview gives the count and total per Block, Room Type and Room Class and names what blocks the issue (filing open, requests undecided, reconciliation open). Issuing creates one Invoice per continuing resident (100 % of the next Term's price of the Bed). At M7 a fee unpaid with no claim waiting is voided and the Bed released; the student must check out at the end of the Term. |
| Details | Blocked until BR-22 holds. Reminders 3 and 1 days before M7. A fee cannot be claimed while a Utility Invoice is overdue. |
| Tests | TC-ASG-040, 041 |

#### 3.6.9 FR-ASG-09 Terminations

| Item | Description |
|---|---|
| Trigger | Manager › Residents › Terminations (SCR-ASG-12); the Utility debt rule; reconciliation. |
| Actors | Manager, System |
| Description | A termination has a reason (Utility debt, not enrolled, Manager decision) and a move-out date. Statuses Notice sent → Checked out / Cancelled / Overdue. |
| Details | The student is told with the date; only a Manager cancels, with a reason. Past the move-out date it is Overdue: Managers and the Block's Staff are told and the Room's code must change. At move-out the Allocations end and refunds follow the rule. |
| Tests | TC-ASG-035, 036, TC-BIL-038 |

#### 3.6.10 FR-ASG-10 Operational moves and turnover

| Item | Description |
|---|---|
| Trigger | Staff › Operational moves (SCR-ASG-21); Staff › Term transition › turnover (SCR-ASG-20). |
| Actors | Staff, Manager |
| Description | Staff (own Blocks) or a Manager move a resident to another Bed for a recorded reason, without charge: both meters are read, the old Room's code must change and the new Room's code is released. The turnover view lists leavers to check out, movers, arriving students and Rooms needing a reading and a new code; from the next Term's check-in start paid continuing residents receive their Room's code. |
| Details | After next-Term fees are issued Staff may no longer move a next-Term Bed; a Manager may move an unpaid one. |
| Tests | TC-ASG-042, 043, 044 |

#### 3.6.11 FR-ASG-11 Balance forfeit

| Item | Description |
|---|---|
| Trigger | The forfeit job every 5 minutes. |
| Actors | System |
| Description | A Balance past its deadline with no claim waiting and no approved late check-in is forfeited: the Allocation is cancelled, the Balance voided, the Application Forfeited, the Deposit kept by the refund rule *Balance not paid*, the Bed goes to Round 2 and the student is told. |
| Details | A Balance whose claims are rejected twice is cancelled the same way. |
| Tests | TC-ASG-033, 034 |

### 3.7 Payments and billing (BIL)

#### 3.7.1 FR-BIL-01 Invoices and the VietQR payment page

| Item | Description |
|---|---|
| Trigger | Student › Payments (SCR-BIL-01) › an Invoice (SCR-BIL-02, SCR-BIL-03 for Utility). |
| Actors | Student |
| Description | The student's Invoices (Deposit, Balance, next-Term fee, Utility, charges) with status and deadline; the payment page shows the VietQR image, bank, account, amount and the transfer content to type. |
| Details | The QR image can be refreshed; another student's Invoice answers 404. |
| Tests | TC-BIL-001, 006 |

#### 3.7.2 FR-BIL-02 Claim a transfer

| Item | Description |
|---|---|
| Trigger | "I have transferred" on the payment page. |
| Actors | Student |
| Description | The claim (with an optional bank reference) moves the Invoice to Awaiting confirmation and stops every deadline that depends on it (BR-07). |
| Details | One claim at a time; a Paid or Void Invoice and a Deposit past its deadline cannot be claimed. A Utility Invoice is a debt: a claim after its due date leaves the date as it was. |
| Tests | TC-BIL-032, 034, 035 |

#### 3.7.3 FR-BIL-03 Confirm or reject payment claims

| Item | Description |
|---|---|
| Trigger | Manager › Finance › Payment confirmations (SCR-BIL-13); the hourly summary of waiting claims. |
| Actors | Manager |
| Description | The queue lists claims with filters (type, Term, Block, claimed since). The Manager confirms one or many (dialog with count and total; optional bank reference and receipt) or rejects with a reason. A Manager may also confirm one Invoice whose transfer is on the bank statement although the student did not claim it; the claim is then recorded in the Manager's name. A confirmed Invoice is Paid and the next step runs (Application Submitted, door code release, Stay counts the Term). |
| Details | A rejection returns the Invoice to Unpaid with the time that was left (at least the minimum); a second rejection cancels it and what depends on it. Each Invoice is audited separately; receipt files are checked by content; a Void Invoice cannot be confirmed. |
| Tests | TC-BIL-010, 011, 012, 033 |

#### 3.7.4 FR-BIL-04 Meter readings and Utility Invoices

| Item | Description |
|---|---|
| Trigger | Staff › Utility › Meter readings (SCR-UTL-10). |
| Actors | Staff |
| Description | The month opens on first use; Staff enter or import (CSV) each Room's electricity and water readings; closing the month issues each resident's Utility Invoice with its breakdown (BR-25). |
| Details | A reading may not go back; an unusual jump waits for a confirmation; a CSV is checked completely before anything is saved; a closed month is read-only. Shares follow the days each resident lived in the Room; without an end reading nothing is shared. |
| Tests | TC-BIL-022–026, 030, 031 |

#### 3.7.5 FR-BIL-05 Overdue Invoices and Utility debt

| Item | Description |
|---|---|
| Trigger | The overdue job every hour; Manager › Finance › Overdue and reminders (SCR-BIL-20). |
| Actors | System, Manager |
| Description | Unpaid charges past their due date become Overdue (the student is told). Utility debt gives warning 1, then the final warning with the termination day, then the termination (BR-26). |
| Details | A Balance past its deadline is forfeited (FR-ASG-11), not Overdue. Paying everything closes the warnings. Each warning is sent once. |
| Tests | TC-BIL-020, 037, 038 |

#### 3.7.6 FR-BIL-06 Refunds

| Item | Description |
|---|---|
| Trigger | A cancelled Application, a check-out settlement or a termination creates a refund; Manager › Decisions (SCR-REQ-20). |
| Actors | Manager |
| Description | Refunds follow the rule of their trigger (percentage, approver); the Manager approves or rejects with a note; the student is told. A refund is its own record; the Invoice stays Paid. |
| Details | An Invoice is refunded at most once. |
| Tests | TC-BIL-021, TC-APP-007 |

#### 3.7.7 FR-BIL-07 Payment reminders and collections

| Item | Description |
|---|---|
| Trigger | The reminder job every hour; Manager › Finance › Payments (SCR-BIL-10). |
| Actors | System, Manager |
| Description | Reminders before Balance and next-Term fee deadlines (3 and 1 days by default); the Managers' summary of waiting claims; the payments list with filters, totals and CSV export. |
| Details | A reminder is sent once per deadline and never while a claim is waiting. Every Manager sees every Block; Staff do not see payments. |
| Tests | TC-BIL-010, 036 |

### 3.8 Next-Term requests, routing and time limits (REQ)

#### 3.8.1 FR-REQ-01 Next-Term room change

| Item | Description |
|---|---|
| Trigger | Student › Requests › Room change (SCR-REQ-02), between M2 and M3. |
| Actors | Student, Staff, Manager |
| Description | The student sees the next-Term Bed and the next Term's prices and asks for another Room Type, Room Class or Block with a reason. Staff of the Block (same Block) or a Manager (other Block) approve with a free matching Bed of the next Term, or reject with a listed reason. |
| Details | One open request per student; the student never picks the Bed. Approval moves the next-Term Allocation; nothing changes in the current Term (BR-18). |
| Tests | TC-REQ-001, 002, 003 |

#### 3.8.2 FR-REQ-02 Swap of next-Term Beds

| Item | Description |
|---|---|
| Trigger | Student › Requests › Swap (SCR-REQ-03), the swap board (SCR-REQ-04), the invitation (SCR-REQ-05); Staff › Swap requests (SCR-REQ-13). |
| Actors | Student, Staff, Manager |
| Description | A direct swap with a named student, or an anonymous post on the swap board with the next-Term Bed and its price; when the partner accepts, Staff (one Block) or Staff then a Manager (two Blocks) approve and the two next-Term Allocations exchange Beds. |
| Details | Invitations expire; after next-Term fees are issued no swap is carried out. |
| Tests | TC-REQ-010, 011, 012 |

#### 3.8.3 FR-REQ-03 Room Class change of a Room

| Item | Description |
|---|---|
| Trigger | Student › Requests › Room Class change (SCR-REQ-08). |
| Actors | Student, Staff, Manager |
| Description | A continuing resident or a Manager asks for another class for the Room from the next Term; every other continuing resident must agree (BR-19); Staff check the furniture and approve, and the Room's class for the next Term is set. After approval a Manager may set the class back, and the price difference of that Term is settled. |
| Details | A resident in the Stay's last Term is not asked; a refusal, or the requester not continuing next Term, cancels the request; a resident who joins the Room before the decision must consent too. |
| Tests | TC-REQ-020 |

#### 3.8.4 FR-REQ-04 Extension and end of stay

| Item | Description |
|---|---|
| Trigger | Student › My Room › Stay (SCR-ASG-01) or Requests. |
| Actors | Student, Staff, System |
| Description | An extension adds Terms to the Stay; in the last Term it turns the next-Term Allocation from Awaiting extension to Continuing. An end of stay cancels the next-Term Allocation and frees the Bed. |
| Details | Automatic when the student is enrolled and has nothing overdue; otherwise Staff decide (BR-21). |
| Tests | TC-REQ-019 |

#### 3.8.5 FR-REQ-05 Decide next-Term requests

| Item | Description |
|---|---|
| Trigger | Staff › Requests (SCR-REQ-10); Manager › Residents › Requests across Blocks. |
| Actors | Staff, Manager |
| Description | The requests window in one list (room changes, swaps, Room Class changes, extensions, ends of stay), oldest first, with the time left to M4; bulk decisions with a reason. |
| Details | Undecided requests escalate to Managers from 48 hours before M4; the Manager may offer a temporary Bed. |
| Tests | TC-REQ-018, 021 |

#### 3.8.6 FR-REQ-06 Routing rules and time limits

| Item | Description |
|---|---|
| Trigger | Manager › Operations › Request Routing Rules (SCR-REQ-20 Routing). |
| Actors | Manager |
| Description | Rules per Block that assign each request type and category to a Staff member, with a fallback when the assignee is off duty; urgent and normal time limits; the list of the Block's staff with their open and finished work. |
| Details | A new Maintenance Request goes to its category's rule first, else the rule for all; a next-Term request is due at M4. Rules and timers are validated; Managers only, in scope. |
| Tests | TC-REQ-013, 014, 015, 022 |

#### 3.8.7 FR-REQ-07 Overdue requests (escalations)

| Item | Description |
|---|---|
| Trigger | The time-limit scan every 15 minutes; Manager › Operations › Overdue requests (SCR-REQ-21). |
| Actors | System, Manager |
| Description | A request unassigned too long or past its deadline opens one escalation for Managers; the Manager reassigns it or notes the action. |
| Details | An escalation closes by itself once the request is back on track; one reassignment per escalation. |
| Tests | TC-REQ-016, 017, TC-MNT-008 |

### 3.9 Maintenance and inspections (MNT)

#### 3.9.1 FR-MNT-01 Report a Maintenance Request

| Item | Description |
|---|---|
| Trigger | Student › Requests › New Maintenance Request (SCR-MNT-02) or the Android app; Staff on behalf of a Room. |
| Actors | Student (resident), Staff |
| Description | Category, location, description, urgency, photos and optionally the furniture item; the request is routed (FR-REQ-06) and gets its deadline. The student follows it on My Requests (SCR-MNT-01). |
| Details | Only a resident reports for their Room; the form and photos are validated (type, size). |
| Tests | TC-MNT-001, 008 |

#### 3.9.2 FR-MNT-02 Handle Maintenance Requests

| Item | Description |
|---|---|
| Trigger | Staff › Maintenance › Queue (SCR-MNT-10) › a request (SCR-MNT-11). |
| Actors | Staff, Student (confirm or reopen) |
| Description | Staff of the Block take or assign, plan the visit, post updates, start, resolve or close (duplicate, not a fault); the student is notified at each step and confirms or reopens once. The furniture item keeps its repair history. |
| Details | The queue is scoped: another Block's Staff neither see nor count the request; Managers see all. State model in Report 4. |
| Tests | TC-MNT-002, 003 |

#### 3.9.3 FR-MNT-03 Inspection checklists

| Item | Description |
|---|---|
| Trigger | Admin › Rules › Inspection Checklists (SCR-CFG-21). |
| Actors | Administrator |
| Description | Checklists with items, a Draft published as version 1; editing publishes a new version and keeps the old one as Replaced; archiving pauses the schedules that use it. |
| Details | A paused schedule cannot resume until another checklist is published. |
| Tests | TC-MNT-004, 006 |

#### 3.9.4 FR-MNT-04 Inspection schedules and runs

| Item | Description |
|---|---|
| Trigger | Manager › Operations › Inspection Schedule (SCR-MNT-20); the daily job at 06:00; Staff › Inspection (SCR-MNT-12). |
| Actors | Manager, Staff, System |
| Description | A schedule per Block with a checklist and a recurrence starts its runs and notifies residents; Staff record each Room with its own checks (headcount, furniture); a failed item creates a Maintenance Request. |
| Details | Schedules are the Managers'; runs need Staff. A Room is done only when its own checks are answered (BR-31). |
| Tests | TC-MNT-005, 007 |

### 3.10 Notifications and announcements (NTF)

#### 3.10.1 FR-NTF-01 In-app notifications

| Item | Description |
|---|---|
| Trigger | Every business event of the notification table (spec §10); the bell in the top bar (web) and the Activity tab (Android). |
| Actors | All users, System |
| Description | Notifications newest first with the unread count; mark one or all read; each notification links to its object. |
| Details | Titles and bodies are stored in both languages and shown in the reader's language; someone else's notification answers 404; signed-in users only. |
| Tests | TC-NTF-001, 002, 003, 038 |

#### 3.10.2 FR-NTF-02 Push and email

| Item | Description |
|---|---|
| Trigger | A notification whose template asks for push or email. |
| Actors | System |
| Description | Push messages go to the user's registered Android devices through FCM after the transaction commits; emails are queued and sent by the dispatcher in the recipient's language. |
| Details | A device token is stored with its hash, which is used to find it; an unregistered token is disabled. With the demo mailbox set, emails to fictional accounts go to it (recipient in the subject), real accounts receive their own; without SMTP nothing is sent or thrown. |
| Tests | TC-NTF-010, 011, 012, 020, 021, 034, 035, 039, 040 |

#### 3.10.3 FR-NTF-03 Announcements and the dormitory board

| Item | Description |
|---|---|
| Trigger | Announcements (SCR-NTF-22) for Admin, Managers and Staff; automatic change announcements; Student Home. |
| Actors | Administrator, Manager, Staff, Student |
| Description | Announcement with title, body, category, audience (all students, residents, residents of Blocks, applicants of a Term), pinned, shown from / until and a link. Students read them on the board at the top of Home and in the bell. |
| Details | Staff write only to the residents of their Blocks. Changes of money, policy or Block settings create change announcements with old and new values. Stored once with a read state per user. |
| Tests | TC-NTF-041, 042, 043 |

#### 3.10.4 FR-NTF-04 Notification templates

| Item | Description |
|---|---|
| Trigger | Admin › Notifications › Templates (SCR-CFG-07). |
| Actors | Administrator |
| Description | Templates per event in Vietnamese and English with their variables and sample values; a test send of the unsaved text to the Admin. |
| Details | Unknown variables and texts longer than the push limit are refused. |
| Tests | TC-NTF-030, 031, 036, 037 |

#### 3.10.5 FR-NTF-05 Send emails to student groups

| Item | Description |
|---|---|
| Trigger | Admin › Notifications › Send Email (SCR-NTF-21). |
| Actors | Administrator |
| Description | Choose a group (Term, Block, status), write or pick a template, preview the count and the first email, send: one email per student plus the in-app notice and push. |
| Details | System emails are not offered as campaigns; validation per field; Admin only. |
| Tests | TC-NTF-032, 033 |

### 3.11 Dashboards, reports, exports and search (RPT)

#### 3.11.1 FR-RPT-01 Dashboards per role

| Item | Description |
|---|---|
| Trigger | The home page of each back-office role (SCR-HOME-02 Staff, SCR-HOME-03 Manager, SCR-HOME-04 Admin). |
| Actors | Staff, Manager, Administrator |
| Description | Staff: today's desk, queues, Rooms out of service, the Block's Beds, what needs attention. Manager: occupancy, claims waiting, overdue requests, the SLA rate, approvals. Admin: the Term, people, the registration funnel, Blocks, configuration checks and integrations. |
| Details | Before the first Term the figures are empty, not errors. Staff may not see Manager figures. |
| Tests | TC-RPT-001–004, 011 |

#### 3.11.2 FR-RPT-02 Term dashboard and reports

| Item | Description |
|---|---|
| Trigger | Manager › Registration › Term dashboard (SCR-RPT-11); Reports (SCR-RPT-01 Occupancy, SCR-RPT-02 Financial, SCR-RPT-10 Block Reports). |
| Actors | Manager, Administrator |
| Description | The Term dashboard shows the milestones in order with progress, Applications by status, places filled per Room Type × Room Class, Deposits and Balances paid, the requests window, next-Term fees and residents released. Occupancy by Block, Room Type and Room Class; money per Block; check-ins per week. |
| Details | Capacity leaves Rooms out of service out; a Term that has ended still reports who lived there. |
| Tests | TC-RPT-005, 006, 007, 010, 012, 014 |

#### 3.11.3 FR-RPT-03 CSV export

| Item | Description |
|---|---|
| Trigger | "Export CSV" on every list. |
| Actors | Staff, Manager, Administrator |
| Description | Downloads the list with the screen's columns and filters as CSV. |
| Details | Quoted values, empty cells, campus times; a value a spreadsheet would run as a formula is neutralised. Every export is written to the Audit Log and respects the user's scope. |
| Tests | TC-RPT-008, 009 |

#### 3.11.4 FR-RPT-04 Search

| Item | Description |
|---|---|
| Trigger | The search box of the back-office top bar. |
| Actors | Staff, Manager, Administrator |
| Description | Finds students by code or name, Rooms with or without the dash, Invoices and request codes, and opens the student hub, the Room hub or the record. |
| Details | Results stay inside the user's Blocks. |
| Tests | TC-RPT-013 |

### 3.12 Mobile app for students (MOB)

#### 3.12.1 FR-MOB-01 Student app

| Item | Description |
|---|---|
| Trigger | The student opens the CampusStay app (Flutter, Android 8.0 or later). |
| Actors | Student |
| Description | Sign in with password or Google, Home (board, next step, Room card, Invoices due), My Room (Room, roommates, door code behind "show", check-in pass QR), Payments (VietQR and "I have transferred"), Activity (notifications with announcements, maintenance and next-Term requests, Report a problem with the furniture item); push notifications open the matching screen. Same API and rules as the web portal; Staff and Managers are sent to the web. |
| Details | The device token is registered after sign-in and removed at sign-out; the language follows the phone. The mobile app (Flutter, `mobile/`) has format and sign-in widget tests (`flutter test`) but no UI tests of its key screens yet (known gap G5); it is checked by the manual cases of Report 5. |
| Tests | Manual (Report 5), API cases of FR-AUTH, FR-BIL, FR-MNT, FR-NTF |
