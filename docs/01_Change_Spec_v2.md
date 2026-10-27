# CampusStay FPT — Change Specification v2 (roles, Term lifecycle, money, UX)

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 24/10/2026 (Week 7, Sprint 4) |
| Owner | Tisou (Team Leader) |
| Status | **Approved by Tisou on 24/10/2026** (open items O-1…O-3 as recommended). Built phase by phase (§16); its decisions are in the Brief's Decision Log as ADR-19…ADR-27 (§17). Progress: phase 1 merged into `main` and deployed 24/10/2026 (built on `feat/v2-phase1`): roles, VI/EN in web and API, bilingual notifications, grouped menus; migrations V32–V35. Phase 2 built on `feat/v2-phase2`, merged into `main` and deployed 25/10/2026 (Google sign-in on in production): Google sign-up with the first password and the sign-up form, verification, Students list and hub, student list import (CSV/XLSX), Staff accounts by Managers, email redirect for fictional accounts only (O-3); migrations V36–V37, contract changes A-17…A-21 and C-39. Phase 3 built on `feat/v2-phase3`, merged into `main` and deployed 25/10/2026: Room Class per Room per Term (Manager › Room Classes by Term; set only for Terms not started and Rooms whose Beds nobody holds yet, so no price changes), furniture types and Room Class requirements (Admin), furniture items, Block stores, moves and transfers, door codes (set, import, confirm, rotation on departure, encrypted, every view audited) and the student's door code and furniture on My Room; migrations V38–V41, contract changes A-23…A-26, B-04, C-40. Phase 4 built on `feat/v2-phase4`, merged into `main` and deployed 26/10/2026: registration-period requests (Manager → Admin, comments, history, Done when published), the Term wizard (timeline with M1–M7, Rooms and places, Term prices, rules, information, review and publish; the Term keeps its prices, Deposit, Utility Deposit and rules), announcements with a read state per student and the dormitory board on Student Home, change announcements for every money or policy change, Term dashboard, configuration grouped by subject (Deposit; Deadlines and reminders; Refunds, penalties and terminations; Stay and renewal), the rules screens of §6.17 (students failing each check, matching levels, preview against the rules in use); migrations V42–V43, contract changes A-27…A-33 and C-41. Phase 5 built on `feat/v2-phase5` and merged into `main` and deployed 26/10/2026: payment claims ("I have transferred", the clock stops; Managers confirm one by one or in bulk, or reject: the time comes back, two rejections cancel a Deposit or Balance) with SePay, the bank-feed inbox and the payment simulator removed; *Gia hạn* on the Application; the door code released once the Balance is paid, the check-in start has come and the Room's code is confirmed, which makes the student a resident (Beds yellow unpaid, orange resident); the forfeit job; late check-ins asked online; Utility warning 1, the final warning and terminations; the refund triggers Balance not paid, Termination and Not enrolled acting; Invoices fixed once issued and refunded once; migrations V44–V49, contract changes A-34…A-39, B-05…B-07 and C-42. Phase 6 built on `feat/v2-phase6`, merged into `main` and deployed 27/10/2026: Stays (Terms committed and used), the requests window M2–M7 with next-Term Allocations (Continuing, Awaiting extension), next-Term room changes, swaps and Room Class changes (with every continuing resident's consent and the furniture check) without price differences, extensions (automatic when enrolled and nothing overdue) and end of stay, bulk decisions, operational moves, the enrollment reconciliation (groups 1–4, "Not enrolled" ending what the student holds), next-Term fees with the rule of §6.7 step 6, M7 cancellations, the turnover and the Term transition screens for Staff and Managers; prorated pricing removed; migrations V50–V55, contract changes A-40…A-46, B-08…B-10 and C-43. Left for later phases: Maintenance Requests and checklists naming furniture items (§6.18, §6.19), printable QR labels Phases 7 and 8 built together on `feat/v2-phase7-8` (user decision 27/10/2026: one test run, one deployment), merged into `main` and deployed 27/10/2026: time left on every request (Maintenance Requests get an SLA deadline when routed), Overdue requests, routing rules with each staff member's workload and the time limits written as sentences, the Room hub, the Term hub's requests window, the back-office search, a Maintenance Request naming a furniture item (the item keeps its repair history), the Room's own checks in inspections (people and furniture, §6.19) and the damage per item and overdue check-outs at the desk (§6.16); migrations V56–V59, contract changes A-47…A-52, B-11, C-44. The demo reset tool, stages and scenarios (§15) wait until the user plans the demo; printable QR labels of asset codes (§6.19) are not built yet. |
| Source | Discussion of 24/10/2026 between Tisou and Claude Code: questions Q0–Q28 and R1–R9, all answered "as recommended" unless noted in §2 |
| Changes once approved | Brief §3 (actors), §4, §6; ADR-07, ADR-08, ADR-12, ADR-18; OI-04; `docs/api-contract.md` via `docs/backend/03_API_Contract_Changes.md`; backend `CLAUDE.md` (seed rule) |

Vietnamese words used by the dormitory are kept in brackets where they are the names people use: *Gia hạn* (number of Terms a student commits to stay), *ở tiếp* (continuing into the next Term), *buộc rời* (termination of a stay).

---

## 1. Summary of the change

1. **Two languages.** The whole system (web, API messages, notifications, emails) works in Vietnamese and English; each user picks a language.
2. **Roles.** Staff work for their Blocks; Managers work for the whole dormitory (no Block limit); the Admin configures the system.
3. **Term lifecycle with renewal.** A student chooses *Gia hạn* (1–9 Terms) when applying and stays from Term to Term. Before the next Term, a **requests window** collects every change (room change, swap, Room Class change of a whole Room, extension, end of stay); after every request is decided, the Manager issues the next-Term room fees in bulk. Changes never produce price differences: the next Term is billed on the next Term's Bed.
4. **Registration periods are organised.** A Manager asks the Admin to open a registration period with the dates, rooms and prices they want; the Admin builds the Term from that request in a step-by-step wizard (timeline, rooms and places, prices of that Term, rules, house rules) and publishes it. Students read it on a news board on their Home page.
5. **Every money or policy change is announced** in-app to the students it concerns.
6. **Payments are confirmed by hand.** The student marks an Invoice as transferred; Managers confirm (in bulk) or reject. SePay, the bank feed and the payment simulator are removed.
7. **Door codes.** A paid student receives the 6-digit door code of their Room; that makes them a resident. Unpaid Balance past its deadline loses the Deposit and the Bed, unless an approved late check-in still runs.
8. **Room Class per Room, furniture tracked.** Each Room has its own Room Class per Term; Room Classes are defined by required furniture; every furniture item is tracked with its location and history.
9. **Student accounts.** Students sign up with Google (`@fpt.edu.vn`), set a password, and are verified against the student list the Manager imports. Every Term the enrolled list is reconciled against the residents.
10. **Utility debt.** Monthly Utility Invoices; one overdue month gives a warning, two months (or a debt reaching the Utility Deposit) end the stay after a final warning.
11. **Clear rules screens.** Eligibility, priority groups, matching criteria and SLA timers are explained in plain sentences with their live effect.
12. **New UX/UI.** Back-office menus grouped by workflow, hub pages for a student, a Room and a Term, one status palette, and a redesigned student portal.

## 2. Decisions

| ID | Decision | From |
|---|---|---|
| D-01 | Vietnamese (default) and English for every system label, message, notification and email; text typed by people stays as typed. Students cannot type the important directory fields (code, name, gender, date of birth, major, cohort, enrollment); they can write descriptions in any language | Q1 |
| D-02 | Back-office menus grouped by workflow (§11.2) plus hub pages (§11.3) | item 2 |
| D-03 | Room Class is set per Room and per Term (not per Floor); a Room's class never changes during a Term | Q2, Q3 |
| D-04 | A Room Class change of a Room with continuing residents needs the consent of every continuing resident of that Room; it takes effect in the next Term and the next-Term room fee uses it | Q2 |
| D-05 | Google sign-up for `@fpt.edu.vn`: first Google sign-in creates the account and forces a new password; accounts found in the imported student list are verified at once, others fill a form and wait for Manager verification | Q4 |
| D-06 | Eligibility, priority groups and matching are shown as questions with live counts; weights use levels; preview compares the draft with the rules in use; boost and roommate preferences stay under "Advanced" | Q5 |
| D-07 | Managers manage student accounts and import the student list (CSV/XLSX, preview, upsert by student code); students missing from a file are left unchanged unless the Manager ticks "mark as not enrolled" | Q6 |
| D-08 | Registration-period wizard with prices per Term; publishing and later changes to money or policy create announcements; Admin and Managers write announcements for everyone, Staff for their Blocks | Q7, Q8 |
| D-09 | Staff are scoped to their Blocks; Managers see every Block. Managers review Applications, run and commit the assignment (no Staff proposal step) | Q9, Q10 |
| D-10 | Room changes and swaps inside one Block are decided by that Block's Staff; across Blocks by a Manager | Q11 |
| D-11 | One open registration-period request per target Term; other Managers comment on it | Q12 |
| D-12 | Payments: the student's "I have transferred" claim stops the deadline clock; Managers confirm in bulk or reject; after a rejection the remaining time continues with at least 12 hours; two rejections cancel the Invoice and what depends on it | Q13 |
| D-13 | *Gia hạn* (1–9 Terms) is chosen on the Application. Continuing residents keep their Bed into the next Term unless a request changes it; *Gia hạn* is not a payment commitment: ending after the current Term is free when asked before the request deadline | Q14, R1 |
| D-14 | Students may request any Room Type or Room Class change; every student request takes effect in the next Term. During a Term only Staff and Managers move students, for operational reasons, at no charge | Q15, R8 |
| D-15 | Continuing residents pay no new Deposit; the next-Term room fee is 100 % of the next Term's price of their next-Term Bed; the Utility Deposit stays held | Q16 |
| D-16 | Utility readings stay monthly (entry or CSV) by the Block's Staff; Utility Invoices are monthly; the Utility Deposit is kept | Q17 |
| D-17 | Routing rules are kept and shown with the staff list; SLA time left is shown on every request | Q18 |
| D-18 | One door code per Room (6 digits), set by the Block's Staff, rotated whenever someone leaves the Room; shown only inside the app (web now, Android later) | Q19 |
| D-19 | The desk check-in stays for hand-over items and is no longer a gate; Utility is charged from the day the door code is released | Q20 |
| D-20 | A late check-in extends both the payment deadline and the arrival deadline; students request it online with evidence, Staff can still record it at the desk; Managers decide | Q21 |
| D-21 | Every furniture item is tracked individually | Q22 |
| D-22 | No Figma updates; the code is the design source from now on | Q23 |
| D-23 | Demo scenarios with an Admin "reset demo data" tool, enabled only on the demo server | Q24 |
| D-24 | Round 2 is kept and also receives Beds freed by unpaid next-Term fees, forfeits and terminations | Q25 |
| D-25 | Refund, penalty and termination rules are Admin configuration; configuration screens are grouped by subject (§9) | Q26 |
| D-26 | Students who do not continue check out at the desk | Q27 |
| D-27 | Utility debt: warning after one overdue month; final warning before the second; termination when two months are overdue **or** the debt reaches the Utility Deposit held, whichever comes first, at least 3 days after the final warning; once triggered only a Manager can cancel a termination, with a reason | Q28, R6, R9 |
| D-28 | Each Term the **enrolled** list is reconciled against residents and applicants, before the next-Term fees and again at the start of the Term; a list of leavers (graduated, withdrawn) is accepted as well | Q14, R3, R4 |
| D-29 | The Admin may reserve a share of a Term's Beds for new students (default 0 %) | R2 |
| D-30 | Extension requests are approved automatically when the student is eligible; otherwise Staff decide | R5 |
| D-31 | After the next-Term fees are issued, next-Term Beds are frozen; a Manager may still move a student: unpaid fee → void and reissue; paid fee → only to a Bed of the same price | R7 |

## 3. Actors and permissions

| Action | Student | Staff (own Blocks) | Manager (all Blocks) | Admin |
|---|---|---|---|---|
| Sign in with Google or password; set password | ✓ | ✓ | ✓ | ✓ |
| Configure the system; build and publish Terms (wizard) | | | | ✓ |
| Request a registration period; comment on requests | | | ✓ | reads, answers |
| Student accounts: list, hub, import, verify, lock, edit directory fields | | reads residents of own Blocks | ✓ | ✓ |
| Enrollment reconciliation | | | ✓ | reads |
| Staff accounts and their Blocks | | | ✓ | ✓ (also Managers, Admins) |
| Review Applications (single, bulk) | | | ✓ | |
| Run assignment, resolve conflicts, commit, Round 2 | | | ✓ | |
| Confirm or reject payment claims (bulk) | | | ✓ | |
| Issue next-Term room fees (bulk) | | | ✓ | |
| Decide refunds (by the rule's approver) | | if the rule says Staff | ✓ | if the rule says Admin |
| Late check-in: request | ✓ (online) | records at the desk | | |
| Late check-in: decide | | | ✓ | |
| Room change / swap inside one Block: decide | | ✓ | ✓ | |
| Room change / swap across Blocks: decide | | | ✓ | |
| Room Class change of a Room (residents' request): decide | | ✓ | ✓ | |
| Room Class of Rooms for the next Term (supply) | | | ✓ (consent rule D-04) | |
| Extension requests not approved automatically | | ✓ | ✓ | |
| Operational move during a Term | | ✓ inside own Blocks | ✓ | |
| Desk check-in / check-out | | ✓ | ✓ | |
| Door codes: set, rotate, confirm | | ✓ | ✓ | |
| Door code: view | own Room, once released | ✓ | ✓ | |
| Meter readings, close meter periods | | ✓ | reads | |
| Maintenance Requests: report | ✓ | ✓ | ✓ | |
| Maintenance Requests: process | | ✓ | ✓ | |
| Routing rules, SLA timers, overdue requests | | | ✓ | limits |
| Inspections: run | | ✓ | | |
| Inspection schedules | | | ✓ | |
| Inspection checklists | | | | ✓ |
| Furniture: status, Block store, moves inside a Block | | ✓ | ✓ | |
| Furniture: catalogue, transfers between Blocks | | | ✓ | |
| Rooms out of service | | ✓ | ✓ | |
| Announcements | reads | own Blocks | everyone | everyone |
| Terminations: start manually, cancel | | | ✓ | |
| Block settings (desk, visiting, quiet hours, house rules) | | reads | ✓ | limits |
| Reports and exports | | own Blocks (operational lists) | ✓ | ✓ |
| Audit Log; system parameters; demo reset | | | | ✓ |

Every rule is enforced on the server and generated into the Admin permission matrix, as today. Staff keep their Block links (`auth_user_block`); Managers no longer have any.

## 4. Glossary additions

| Term | Meaning |
|---|---|
| Stay (*hợp đồng ở*) | One student's residence from their first Term to their last: first Term, *Gia hạn* (Terms committed), Terms used, status |
| *Gia hạn* | Number of Terms (1–9) the student wants to stay, chosen on the Application; extended by request |
| Continuing resident (*ở tiếp*) | A resident of Term N whose Stay continues into N+1 |
| Next-Term Allocation | The Allocation of a continuing resident for N+1, created when the requests window opens; every next-Term change is made on it |
| Requests window | The period of Term N (M2 → M4) when continuing residents file and Staff/Managers decide every next-Term request |
| Payment claim | The student's "I have transferred" on an Invoice; confirmed or rejected by a Manager |
| Door code | The 6-digit code of a Room's lock; released to each paid resident |
| Termination (*buộc rời*) | A forced end of a Stay (Utility debt, not enrolled, or a Manager's decision) with a move-out date |
| Announcement | A news item on the students' board, with a category, an audience and a validity |
| Registration-period request | A Manager's request to the Admin to open a Term, with proposed dates, rooms and prices |
| Furniture type / item | A kind of furniture (fridge, air conditioner …) / one physical piece with an asset code |
| Class requirement | The furniture a Room must have to belong to a Room Class |
| Reconciliation | Comparing an enrolled list with residents and applicants, and resolving every difference |

## 5. Term lifecycle

### 5.1 Milestones
A Term N+1 holds two groups of dates. The **renewal milestones** happen during Term N for its continuing residents; the **registration milestones** are the existing ones, for new students. Example: Term N stays until 27/12, Term N+1 starts on 05/01.

| Milestone | Example | What happens |
|---|---|---|
| **M1** Publish N+1 | 01/11 | Prices, rooms, places and house rules of N+1 appear on the board; announcement to every student |
| **M2** Requests window opens | 01/11 | A next-Term Allocation is created on the current Bed for every resident of N who is not leaving or terminated: *continuing* when Terms remain on the Stay, *awaiting extension* when N is the Stay's last Term. Students in their last Term are reminded. Students file: room change, swap, Room Class change of their Room, extension, end of stay |
| **M3** Request deadline | 20/11 | Students can no longer file next-Term requests (Maintenance Requests and late check-ins stay open). Next-Term Allocations still *awaiting extension* are cancelled |
| **M4** Decision deadline | 27/11 | Every request must be decided; undecided ones are escalated to Managers from 48 h before; Managers can decide in bulk |
| **M5** Reconciliation | before M6 | Enrolled list imported and every difference resolved (§6.12) |
| **M6** Next-Term fees | 01/12 | A Manager issues the next-Term room fees in bulk; possible only when no request is open and the reconciliation is resolved. Leavers receive their end-of-stay notice (check-out date, desk hours, expected settlement) |
| **M7** Next-Term fee deadline | 15/12 | Reminders 3 days and 1 day before. Unpaid without an open claim or an approved extension: the next-Term Allocation is cancelled, the student must check out at the end of N, the Bed goes to Round 2 |
| Registration open → close | 05/11 → 25/11 | New students apply (existing wizard + *Gia hạn*) |
| Results published | ≥ M4 | The assignment for new students runs only after M3 and when no next-Term request is open, on Beds not held by continuing residents (minus the reserved share, D-29) |
| Deposit hours, Balance due, check-in window, check-out by | as today | New students' payments and arrival (§6.6) |
| **M8** Round 2 | after M7 and the Balance deadline | Waitlisted students are offered every Bed freed so far |
| **M9** Turnover | N's check-out by → N+1's check-in start | Leavers check out; movers move; meter readings are cut in every Room whose residents change; door codes of those Rooms are rotated; door codes are released to paid residents |

### 5.2 Timeline rules
- The wizard checks the order: M1 ≤ M2 < M3 < M4 ≤ M5 ≤ M6 < M7 < N's stay end; registration close ≤ results; M4 ≤ results; check-in start ≥ N's check-out by.
- A Term without residents before it (the first Term) has no renewal milestones.
- Once a milestone is open, its deadline can be **extended but never shortened**. Every change after publishing needs a reason and creates a change announcement (§10).
- The price table of a Term is locked once any Invoice of that Term exists.

## 6. Flows

### 6.1 Google sign-up and first sign-in (D-05)
1. A user signs in with Google; the API checks the ID token and `hd = fpt.edu.vn` as today.
2. Existing account (back office or student) → signed in. No account → a student account is created.
3. If the account has no CampusStay password yet, every page redirects to **Set a password** until one is set (same password rules as today; Android uses the same rule).
4. The email or the student code read from it (pattern `…<2 letters><6 digits>@fpt.edu.vn`, upper-cased) matches the imported student list → profile filled from the list, account **Verified**.
5. No match → the student fills a form (student code, full name, gender, date of birth, major, cohort, phone) → account **Pending verification**. The student can read everything but cannot apply; a Manager verifies (fields locked afterwards) or rejects (account locked, reason shown). A later import that matches verifies the account automatically.

### 6.2 Student accounts and import (D-07)
- Manager › Students: filters (enrollment, gender, cohort, verification, resident, Block), the student hub (§11.3), lock/unlock, edit directory fields, verify or reject.
- Import: download the template → upload CSV or XLSX → preview row by row (new, update, unchanged, error with the reason) → confirm → result. Matched on student code; an email already used by another account is an error. Columns: student code, full name, email, gender, date of birth, major, cohort, semester, hometown, region, enrollment status, priority groups. Every import is written to the Audit Log.

### 6.3 Registration-period request (D-10, D-11)
1. A Manager opens **Request a registration period** for a target Term: proposed dates (the milestones of §5.1), Blocks and Rooms to use, places per Room Type × Room Class × gender, proposed prices, notes.
2. Submit → in-app notification to every Admin and every other Manager; the link opens the requests list (with history).
3. Statuses: **Submitted → In progress → Needs changes** (back to the Manager with the Admin's note) **→ Done** (linked to the published Term) or **Rejected** (with a reason). One open request per target Term; other Managers comment on it.
4. The Admin clicks **Build the Term from this request**: the wizard opens with the Manager's values. Any value the Admin changes needs a reason; the Manager sees each difference.
5. Publish → notification to every Manager (link: the Term dashboard), announcement to students (§6.4).

### 6.4 Registration-period wizard and publishing (D-08)
Steps (saved as a draft after each step):
1. **General** — code, name, stay dates.
2. **Timeline** — renewal milestones (if a Term runs before it) and registration milestones, on a visual timeline with the checks of §5.2.
3. **Rooms and places** — Blocks used, Rooms excluded, Room Class of each Room for this Term (with furniture conformance), supply and demand table (Beds and Applications per Room Type × Room Class × gender), share reserved for new students.
4. **Prices** — price per Room Type × Room Class for this Term (filled from the previous Term, or from base price × surcharge), Deposit percentage, Utility Deposit.
5. **Rules** — eligibility, priority groups, matching criteria (§6.17); refund rules shown with a link to their settings.
6. **Information** — house rules, FAQ, documents.
7. **Review and publish** — summary of everything; publish creates the Term announcement and notifies students.

After publishing, money and policy fields stay editable within §5.2; every saved change creates a change announcement listing old → new values.

### 6.5 Announcements and the students' board (D-08)
- Announcement: title, body, category (Registration, Finance, Rules, Operations), audience (all students, residents, residents of Blocks, applicants of a Term), pinned, shown from / until, link (e.g. a Term).
- Created automatically by publishing a Term and by every change of §10, or by hand (Admin, Managers: any audience; Staff: residents of their Blocks).
- Stored once with a read state per user (no copy per student); the bell shows announcements and personal notifications together.
- Student Home: the **dormitory board** at the top — the current registration period card (opens soon / open / closed, countdown, places, prices), then pinned and recent announcements. The card opens **Registration period details**: tabs Timeline, Prices, Rooms, House rules, FAQ.

### 6.6 New student: Application to resident
1. Wizard: eligibility → Room Type + Room Class → roommate step (2-bed) → *Gia hạn* (1 to the configured maximum, capped by the semesters left when known) → contact → consent. New eligibility criteria: *account verified* and *not a continuing resident of the Term* (continuing residents use requests).
2. Deposit Invoice = Deposit percentage × the Term's price of the chosen Room Type × Room Class; payment by claim (§6.7) within the Deposit hours.
3. Deposit confirmed → Application Submitted → a Manager reviews (single or bulk) → Approved.
4. A Manager runs the assignment (dry run, then real), resolves conflicts and commits (per Block or all at once) → Allocations (bed **yellow**) and Balance Invoices (price − Deposit + Utility Deposit).
5. Balance confirmed → the door code is released (§6.8) → **resident** (bed **orange**); the Stay counts its first Term.
6. Balance unpaid at its deadline, no open claim, no approved late check-in still running → Allocation cancelled, Deposit kept (refund rule *Balance not paid*, default 0 %), Bed to Round 2, student notified. Reminders 3 days and 1 day before.

### 6.7 Payment claims and confirmation (D-12)
1. Every Invoice shows the VietQR image (when the bank account is configured), the amount, the transfer content and **I have transferred**.
2. The claim moves the Invoice to **Awaiting confirmation** and stops every deadline that depends on it (Deposit window, Balance, next-Term fee, Utility due date). The "earlier Deposit first" criterion uses the time of the claim that is later confirmed.
3. Managers: Payments queue with filters (type, Term, Block, claimed since), select many → **Confirm** (dialog with the count and the total) or **Reject** with a reason. Each Invoice is confirmed and audited separately; a receipt file is optional.
4. Confirmed → Paid → the next steps run as today (Application submitted, door code release …).
5. Rejected → back to Unpaid, the student is notified, the deadline continues with the time that was left (at least 12 hours). A second rejection cancels the Invoice and what depends on it (Application expires, Allocation cancelled, next-Term Allocation cancelled).
6. A next-Term fee cannot be claimed while an overdue Utility Invoice exists (the page asks to pay that first).

### 6.8 Door codes (D-18, D-19)
- Each Room has one current code (6 digits). The Block's Staff enter or import codes (CSV: Room, code), or accept a random code the system proposes (never the previous one), set it on the lock and confirm.
- **Release rule:** a resident receives the code when (a) their Balance or next-Term fee is paid, (b) the Term's check-in start has come (or at once for a move during a Term), and (c) the Room's code for this occupancy is confirmed. This prevents a new student from getting a code while the previous Term's residents still live in the Room.
- **Rotation:** whenever someone leaves a Room (check-out, move out, termination, cancelled next-Term Allocation at turnover), the system creates a "change door code" task for the Block; once Staff confirm the new code, it is released to the remaining paid residents. Someone joining a Room receives the current code.
- The notification only says the code is ready; the code is shown on My Room (web; Android later) behind a "show" button. Every view of a code is written to the Audit Log. Codes are stored encrypted.

### 6.9 Late check-in (D-20)
- Requested online by the student before the deadline (reason, evidence file, requested date) or recorded by Staff at the desk.
- A Manager approves with a new deadline (at most the configured number of days after the check-in end) or rejects with a reason.
- An approved, unexpired late check-in extends the Balance deadline and the arrival deadline to its date.

### 6.10 Term transition for continuing residents (D-13 … D-15, D-30, D-31)
1. M2: next-Term Allocations are created (§5.1). Students see on My Room: "You stay in Room X next Term (Terms left: n)" or "This is the last Term of your stay".
2. Requests (each one at a time per student, as today):

| Request | Who files | Decided by | Effect on the next-Term Allocation |
|---|---|---|---|
| Room change (any Room Type, Room Class or Block) | continuing resident | Staff of the Block if the target is in the same Block; otherwise a Manager. The decider picks the target Bed (students never pick a Bed, ADR-06) | moved to the target Bed |
| Swap (direct or swap board) | both continuing residents agree | Staff if both Beds are in one Block; otherwise a Manager | the two next-Term Allocations exchange Beds |
| Room Class change of the Room (§6.11) | one continuing resident; the others consent | Staff of the Block | the Room's class for N+1 changes |
| Extension (+k Terms) | resident in the Stay's last Term (or anyone, to add Terms) | automatic when enrolled and without an overdue Invoice; otherwise Staff | *awaiting extension* → *continuing* |
| End of stay after this Term | continuing resident | automatic | cancelled; the Bed is free for N+1 |

3. Every move of next-Term Allocations locks the Beds and relies on the database rule *one Allocation per Bed per Term*, so two decisions can never give the same Bed.
4. M6: the Manager opens **Issue next-Term fees**: preview (count, total, per Block / Room Type / Room Class), blockers (open requests, unresolved reconciliation) → issue. Each continuing resident gets one Invoice "Room fee · Term N+1 · Room X" = 100 % of the N+1 price of the Bed's Room Type × the Room's N+1 Room Class. No Deposit; the Utility Deposit stays held.
5. M7: unpaid next-Term fees cancel the next-Term Allocation (§5.1).
6. M9: movers move on the turnover days; the Stay counts the new Term when the fee is paid.

### 6.11 Room Class change of a Room (D-03, D-04)
1. A continuing resident creates the request (target Room Class) → every other continuing resident of the Room receives a consent request; residents who leave after N are not asked.
2. All consented → Staff check the furniture: an upgrade needs the missing items available in a store (they are **reserved** for the Room); a downgrade lists the items to remove.
3. Approved → the Room's Room Class for N+1 is set; the next-Term fee of everyone in that Room in N+1 (including new arrivals) uses it; furniture move tasks are created for the turnover.
4. Anyone moving into such a Room later sees its next-Term class and price before agreeing.
5. If the Room's continuing residents change before the decision, the new continuing residents must consent too.
6. At the start of N+1 the system checks that every Room's furniture matches its Room Class. A Room that does not match becomes a Manager task: finish the move, or set the class back; setting it back after the fee was paid is the **only** case where a price difference is charged or refunded (for that Term).
7. A Manager changing a Room's class for supply reasons uses the same consent when the Room has continuing residents.

### 6.12 Enrollment reconciliation (D-28)
- The Manager uploads the **enrolled list** (recommended) or a list of leavers, for a Term.
- Results:

| Group | Meaning | Required action |
|---|---|---|
| 1 | Resident, continuing resident or applicant who is not enrolled (or is on the leavers list) | Next-Term Allocation cancelled / Application rejected; a resident during the Term gets a termination (reason *not enrolled*) |
| 2 | Resident not found on the enrolled list | Manager checks and records the outcome |
| 3 | Student code in the file that does not exist | Shown for information |
| 4 | Enrollment status changed | Directory updated |

- Each item in groups 1–2 must be resolved with a note (audited). M6 is blocked until none is open. A second reconciliation at the start of N+1 catches late changes.

### 6.13 Operational moves during a Term (D-14)
Staff (inside their Blocks) or a Manager move a resident for a recorded reason (Room unusable, safety, serious conflict, other). No charge or refund in either direction. The move cuts the meters of both Rooms, rotates the old Room's code and releases the new Room's code. The next-Term Allocation follows to the new Bed unless the decider chooses otherwise.

### 6.14 Monthly Utility, debt and termination (D-16, D-27)
- Meter periods stay monthly per Block (opened automatically), readings entered or imported by Staff, period closed → Utility Invoices split by days of occupancy between meter cuts; a resident's occupancy starts on the day their door code is released.
- An Invoice overdue (no open claim) → **warning 1**.
- When a Utility Invoice is issued while an earlier one is overdue → **final warning**, stating the termination date.
- Termination trigger: overdue Utility Invoices ≥ the configured months (default 2) **or** unpaid Utility ≥ the Utility Deposit held, and at least the configured days (default 3) after the final warning.
- Paying everything before the trigger stops the process. After the trigger only a Manager can cancel the termination, with a reason.

### 6.15 Terminations
- Reasons: Utility debt (automatic), not enrolled (reconciliation), Manager decision (reason required).
- Statuses: **Notice sent** (move-out date = trigger + configured days) → **Checked out** (desk) or **Cancelled** (Manager) or **Overdue** (move-out date passed without check-out: escalation to Managers, door code rotated).
- At move-out: Allocation and next-Term Allocation end; refund of the unused room fee by rule (*Termination*, default 0 %; *Not enrolled*, configurable); the Utility Deposit pays the debt and damage; any rest stays an overdue Invoice, which blocks future Applications.

### 6.16 Check-out and settlement (D-26)
Leavers check out at the desk by N's check-out date: final meter reading, Room condition and furniture items (damage per item), key/card returned, Utility Deposit settlement (deposit − last Utility share − unpaid Utility − damage; refund rule *Utility Deposit*). The Room's door code is rotated. Leavers who have not checked out by the date appear on the Staff's daily "overdue check-out" list and are escalated to Managers.

### 6.17 Rules screens: eligibility, priority, matching (D-06)
- **Who may apply?** each criterion as a sentence, on/off, with "n students fail this now".
- **Who is placed first when Beds are short?** ordered priority groups with "n students in this group".
- **How are roommates matched?** criteria with levels (Very important / Important / Not used); "Advanced": roommate-preference boost.
- **Preview**: the draft against the rules in use on the current Applications — students placed, students moved, average fit, priority students with a Bed — plus one example Room explaining its fit.

### 6.18 Maintenance and SLA (D-17)
- Every request shows its time left ("3 h left", "5 h overdue") in green / amber / red; requests-window decisions use M4 as their deadline.
- SLA settings written as sentences ("An **urgent** request must be finished within [8] hours; after that, Managers are alerted").
- "Escalations" is renamed **Overdue requests**; the Manager dashboard shows their count. Routing rules sit next to the staff list and their workload.
- A Maintenance Request can name a furniture item of the Room; the item keeps its repair history.

### 6.19 Furniture (D-21)
- Furniture types: name (VI/EN), category, *defines Room Class* or *standard*.
- Items: asset code (printable QR), type, status (In use, Broken, In repair, In store, Disposed), location (a Room or a Block store), notes.
- Moves: from → to, reason, by, at; planned moves (tasks) and done moves.
- Room Class requirements: furniture types and quantities per Room Class; conformance per Room per Term.
- Inspection checklists include the Room's items and a "number of people matches the residents" item.

### 6.20 Round 2 (D-24)
Kept. Beds freed by unpaid Balances, unpaid next-Term fees, ended stays and terminations join the Round-2 pool; offers expire as today.

## 7. State models

| Object | States |
|---|---|
| Account | Pending password → Active; students also **Pending verification → Verified** or **Rejected (locked)**; Locked |
| Stay | Active (Terms used / committed) → Ended (completed, ended early, terminated) |
| Allocation | **Assigned – unpaid** (yellow) → **Resident** (orange, door code released) → Ended; or Cancelled (forfeit, unpaid next-Term fee, end of stay, reconciliation). Next-Term Allocation: Awaiting extension → Continuing → (fee paid) Resident from M9 |
| Invoice | Upcoming, Unpaid, **Awaiting confirmation** (claim), Paid, Overdue, Void, Refunded |
| Payment claim | Claimed → Confirmed / Rejected |
| Next-Term requests | Submitted (→ Awaiting consent for Room Class changes) → Approved / Rejected / Cancelled; Extension and End of stay may be Automatic |
| Late check-in | Pending → Approved (with deadline) / Rejected |
| Termination | Notice sent → Checked out / Cancelled / Overdue |
| Door code | Proposed → Active (confirmed on the lock) → Retired |
| Registration-period request | Submitted → In progress → Needs changes → Done / Rejected |
| Reconciliation item | Open → Resolved (note) |
| Furniture item | In use, Broken, In repair, In store, Disposed |

## 8. Money rules

| Amount | Issued | Amount | Deadline | If not paid |
|---|---|---|---|---|
| Deposit (an advance on the room fee, not a held deposit) | Application created | Deposit % × the Term's price of the chosen Room Type × Room Class | Deposit hours | Application expires |
| Balance | Assignment committed | Term price − Deposit + Utility Deposit | Balance due (or approved late check-in) | Allocation cancelled; Deposit refund per rule *Balance not paid* (default 0 %) |
| Next-Term room fee | Manager at M6 | 100 % of N+1 price of the next-Term Bed | M7 | Next-Term Allocation cancelled; no money is kept because nothing of N+1 was used |
| Utility | Meter period closed | consumption × unit prices, split by days | period due date | warnings → termination (§6.14) |
| Utility Deposit | with the first Balance | estimate per month × months held (default 300,000 × 2) | — | held for the whole Stay; settles debt and damage at the final check-out |
| Damage | at check-out | per furniture item | — | taken from the Utility Deposit; the rest is invoiced |
| Refunds | by trigger | percentage of the rule | approver of the rule | — |

- No room-change or swap price differences exist any more (D-14); the only exception is §6.11 step 6.
- A Term's prices are fixed for that Term (§5.2); changing the default prices affects only Terms built afterwards.

## 9. Configuration (Admin), grouped

| Group | Contents (new items in bold, defaults in brackets) |
|---|---|
| Registration periods | Terms (wizard of §6.4), requests from Managers |
| Prices and fees (defaults for new Terms) | Room Type base prices, Room Class surcharges, Deposit % (20), Utility Deposit (estimate 300,000 × 2 months), utility unit prices with **effective month** |
| Deadlines and reminders | Deposit hours (48), Balance days (14), **payment reminders (3 and 1 days)**, **minimum time after a rejected claim (12 h)**, **claims rejected before cancellation (2)**, Utility due days (7) |
| Refunds, penalties and terminations | refund rules per trigger: Cancel before results (100 %, system), Cancel after results (50 %, Manager), **Balance not paid (0 %, system)**, Early check-out (30 %, Manager), **Not enrolled (30 %, Manager)**, **Termination (0 %, system)**, Utility Deposit (100 % minus debts, Staff); **termination: overdue months (2), debt ≥ Utility Deposit (on), days after final warning (3), move-out days (3)**; **late check-in: longest extension (14 days)** |
| Stay and renewal | **Gia hạn maximum (9)**, **automatic extension (on)**, **share reserved for new students (0 %)**, **escalate undecided requests before M4 (48 h)** |
| Admission and matching | eligibility (+ **verified account**, **not a continuing resident**), priority groups, matching criteria |
| Notifications | templates (VI/EN title and body), announcements, emails |
| Buildings and rooms | Buildings, bulk Rooms, **furniture types and Room Class requirements** |
| System | users and roles, parameters, Audit Log, **demo data** (demo server only) |

Each setting shows **where it is used** and **from when it applies**; changes in the Prices, Deadlines, Refunds and Stay groups create announcements (§10). Managers' Block settings (desk, visiting and quiet hours, house rules) stay within the Admin limits.

## 10. Notifications and announcements

| Event | Recipients | Channel |
|---|---|---|
| Term published; Term fields changed after publishing (old → new) | audience of the Term (all students / residents) | announcement (+ push when Android exists) |
| Default prices, Deposit, Utility prices, refund or termination rules changed | all students | announcement |
| Block settings changed | residents of the Block | announcement |
| Registration-period request submitted / needs changes / done / rejected | Admins + other Managers / requesting Manager / all Managers / requesting Manager | in-app |
| Payment claims waiting (one summary per hour, not one per claim) | Managers | in-app |
| Claim confirmed / rejected | student | in-app, push |
| Balance and next-Term fee reminders; forfeit; next-Term Allocation cancelled | student | in-app, push, email |
| Door code ready / changed | residents of the Room | in-app, push (no code in the text) |
| Door code to set | Staff of the Block | in-app (task) |
| Requests window open; last Term of the Stay; request decided; consent asked | students concerned | in-app, push |
| Reconciliation items open before M6; requests undecided before M4 | Managers | in-app |
| Utility warning 1, final warning, termination notice | student | in-app, push, email |
| Termination overdue, overdue check-out | Managers, Staff of the Block | in-app |
| Account pending verification; verified / rejected | Managers; student | in-app |

Every notification stores its title and body in both languages; emails go in the recipient's language.

## 11. UX and UI

### 11.1 Principles
- One clear primary action per screen; lists with a side panel for details instead of jumping between pages; filters kept per user.
- One status palette for the whole system, always with a label or icon (never colour alone); consistent tags for Invoices, requests and Allocations.
- Confirmation dialogs say what will happen in numbers ("Confirm 37 payments, 92,500,000 VND").
- Empty states say what to do next; errors say how to fix them.
- Time left is shown wherever a deadline matters.
- Back office designed for 1366 px and wider; student portal designed phone-first (the Android app will follow it).

### 11.2 Menus

| Role | Menu |
|---|---|
| Student | Home · Registration (period details, my Applications) · My Room (Room, roommates, door code, furniture, my Stay and *Gia hạn*) · Payments · Requests (maintenance, room change, swap, Room Class, extension, end of stay, late check-in) · Notifications. Phone: Home · My Room · Payments · Activity |
| Staff | Today · Desk (check-in, check-out, late check-in) · Requests (room changes and swaps, Room Class changes, extensions) · Rooms (room map, door codes, furniture and Block store, out of service) · Maintenance (queue, inspections) · Utility (meter readings) · Announcements |
| Manager | Overview · Registration (period requests, Term dashboard, Applications, assignment, Round 2) · Residents (students, verification, import, reconciliation, requests across Blocks, late check-ins, terminations) · Finance (payment confirmations, next-Term fees, overdue and reminders, refunds) · Operations (overdue requests, routing and staff workload, inspection schedules, Block settings) · Inventory (room map, Room Classes for the next Term, furniture catalogue and transfers) · Staff accounts · Announcements · Reports |
| Admin | Overview · Registration periods (requests, Terms) · Prices and fees · Rules (admission and matching; refunds, penalties and terminations; stay and renewal) · Notifications · Buildings and rooms · System · Reports |

### 11.3 Hub pages
- **Student**: profile and verification, Stay and *Gia hạn*, Applications, Allocations, Invoices and claims, requests, terminations, notes, history; actions available in place.
- **Room**: residents (current and next Term), Room Class per Term and furniture conformance, door code status, meter readings, Maintenance Requests, inspections.
- **Term dashboard**: milestones with progress, Applications by status, places filled per Room Type × Room Class, Deposits and Balances paid, next-Term requests open, fees issued and paid, residents released.
- **Global search** (student code, name, Room, Invoice, request code) in the top bar.

### 11.4 Student Home
Dormitory board (§6.5) → **Your next step** (one button: pay, confirm consent, file a request before M3 …) → Room card (Room, Bed, door code button, next Term status) → Invoices due → latest requests.

### 11.5 Status palette (Beds on the room map)
Empty (grey) · Assigned – unpaid (yellow) · Resident (orange) · Leaving at the end of the Term (orange outline) · Moving in next Term (blue) · Out of service (grey hatched). The map switches between the current Term and the next Term.

### 11.6 Language
A VI/EN switch in the top bar and on the sign-in page; saved on the account; dates `dd/MM/yyyy` (VI) or `d MMM yyyy` (EN); amounts `1.200.000 ₫` (VI) or `1,200,000 VND` (EN).

## 12. Data model changes (new migrations from V32; applied ones are never edited)

| Feature | Changes |
|---|---|
| AUTH | `auth_user`: `locale`, `password_set`, student verification status and reason; import batches and rows; reconciliation runs and items |
| CFG | `cfg_term`: renewal milestones M2–M7, reserved share for new students; `cfg_term_price` (Term × Room Type × Room Class); Term Blocks and excluded Rooms; `cfg_term_request` + comments; `cfg_room_class_requirement`; new parameters and refund triggers (§9); `cfg_fee_policy` drops `block_check_in_if_unpaid` and `allow_manual_confirm` |
| INV | `inv_room_class_term` (Room × Term → Room Class; `inv_floor.room_class_id` becomes optional, used only for bulk creation); furniture types, items, moves; door codes (encrypted) |
| APP | `app_application.stay_terms` (*Gia hạn*); new eligibility criteria |
| ASG | `asg_stay`; Allocation: next-Term states, code release time, source `RENEWAL`; terminations; late check-ins requested by students and extending payment |
| BIL | `bil_payment_claim`; Invoice type `TERM_FEE` (next-Term room fee); Utility warnings; SePay inbox no longer used (table dropped after its data is archived) |
| REQ | next-Term room changes and swaps (target Term); Room Class change requests with consents; extension and end-of-stay requests; SLA deadline on every request |
| MNT | Maintenance Request → furniture item; checklist items from furniture; headcount item |
| NTF | template and notification titles and bodies in VI and EN; announcements with read state |

Reports (`rpt_v_*`) are extended by their owning features; every new list keeps its CSV export.

## 13. Removed or replaced

| Removed | Replaced by |
|---|---|
| SePay webhook, bank-feed inbox, matching retry job, amount mismatch / unmatched / already-paid handling, `SEPAY_*` settings (ADR-08) | payment claims + Manager confirmation (§6.7) |
| Payment simulator `POST /dev/invoices/{id}/simulate-payment`, `PAYMENT_SIMULATOR`, `VITE_PAYMENT_SIMULATOR` (A-08, ADR-18) | "I have transferred", available to everyone |
| Staff manual payment confirmation | Manager confirmation |
| Prorated room-change and swap charges and credits (`ChangePrices`, charges/credits for moves) | next-Term effect (§6.10) |
| Staff assignment proposals submitted per Block; Manager approval per Block | Manager runs and commits |
| Block scope for Managers; Block Finance and Block Reports | system screens with a Block filter |
| Room Class per Floor | Room Class per Room per Term |
| Desk check-in as a condition of residence | door code release (§6.8) |
| "Residents" placeholder pages | student list and hub |

## 14. Loophole controls

| Risk | Control |
|---|---|
| Downgrading a Room on paper while keeping the furniture | the class follows furniture conformance (§6.11 step 6) |
| Moving to a better Room during a Term without paying | student requests only take effect next Term; operational moves are recorded with a reason |
| A continuing resident does not pay the next Term but stays | next-Term Allocation cancelled at M7; overdue check-out list; door code rotated at turnover |
| A former resident or a guest knows the door code | rotation on every departure, confirmed on the lock |
| A new student enters a Room before the previous residents leave | code released only from the check-in start (§6.8) |
| A student stops studying but stays; a leavers list misses someone | reconciliation with the enrolled list; residents not found must be checked one by one |
| *Gia hạn* 9 to keep a Premium Room for ever | every Term is priced and paid separately; reserved share for new students |
| A slow confirmation makes a student lose their place | the claim stops the clock |
| A false "I have transferred" to hold a place | remaining time continues after a rejection; two rejections cancel |
| Claiming early to jump the "earlier Deposit first" order | only a confirmed claim's time counts |
| Utility debt larger than the Utility Deposit | trigger on the amount as well as the months |
| Utility debt carried into the next Term | next-Term fee cannot be claimed while Utility is overdue |
| Two decisions give the same next-Term Bed | Bed locks + one Allocation per Bed per Term in the database |
| Last-Term residents' Beds taken before they extend | *awaiting extension* Allocations hold the Beds until M3 |
| Requests left undecided block the fees | M3 closes filing, escalation 48 h before M4, bulk decisions |
| Prices announced after students committed | M1 ≤ M2 enforced; prices locked once Invoices exist |
| A deadline shortened after it opened | deadlines can only be extended |
| A lecturer or a stranger signs up as a student | pending verification blocks Applications |
| Wrong gender or code typed at sign-up | important fields locked after verification; Manager checks against the list |
| Mistaken bulk confirmation | confirmation dialog with count and total; one audit entry per Invoice |
| Door codes leaked from the database or the screen | stored encrypted, never in push texts, every view audited |

## 15. Demo data (D-23)

- **Reset demo data** (Admin › System, only when `DEMO_TOOLS=true` on the demo server): choose a stage, type `RESET` to confirm; business data is replaced by scenarios dated relative to today; accounts and Buildings stay. Written to the Audit Log.
- Stages: **A** — Term N in stay, Term N+1 published, requests window and registration open; **B** — next-Term fees issued, before M7; **C** — turnover week (leavers checking out, movers, door codes to set, Round 2 open).
- Scenarios (each tied to a named account in a cheat sheet `docs/demo/Demo_Scenarios.md`, generated with the seed): new eligible student; Google account pending verification; awaiting Deposit; claim awaiting confirmation; claim rejected once; approved, awaiting assignment; assigned – unpaid; resident with door code; last Term of the Stay; extension requested; end of stay requested; room change in the same Block / across Blocks; swap pair; Room Class change with 2 of 4 consents; late check-in pending / approved; forfeited Deposit; Utility warning 1 / final warning / termination notice; next-Term fee issued / unpaid / paid; leaver awaiting check-out; Room not matching its Room Class; Maintenance Request close to its SLA / overdue; door code to rotate; registration-period request awaiting the Admin and a finished one; announcements (Term published, fee changed).
- Sample files in `docs/demo/`: student import, enrolled list (producing every reconciliation group), meter readings, door codes.
- The 8 Manager accounts of the base data stay Managers, now system-wide (titles renamed, Block links removed); Staff keep their Blocks. All demo people are fictional.

## 16. Delivery plan

| Phase | Content | Depends on |
|---|---|---|
| 1 Foundations | role model (§3); i18n in web and API; bilingual notifications; design system, new layouts and menus | — |
| 2 Accounts | Google sign-up, set password, verification; student list, hub, import; staff accounts by Managers | 1 |
| 3 Inventory | Room Class per Room per Term; furniture and Room Class requirements; door codes | 1 |
| 4 Registration periods | Manager requests; wizard with Term prices, rooms and places; announcements and the board; change announcements; grouped configuration; rules screens (§6.17) | 2, 3 |
| 5 Money and residence | payment claims and bulk confirmation (SePay removed); *Gia hạn* on the Application; door code release and Bed colours; forfeit job; late check-in online; Utility warnings and terminations; new refund triggers | 4 |
| 6 Term transition | Stays; requests window; next-Term room changes, swaps, Room Class changes, extensions, end of stay; operational moves; reconciliation; next-Term fees; turnover tasks; prorated pricing removed | 5 |
| 7 Operations | SLA badges, overdue requests, routing with workload; Room and Term hubs; global search | 1–6 |
| 8 Demo and documents | reset tool, stages and scenarios, sample files, cheat sheet; Brief, architecture, contract changes, endpoint map, screen map, test catalog | 1–7 |

Each phase: new migrations, integration tests per controller (`TC-<CODE>-NNN`), `mvn -o verify` and `npm run build`, documents updated in the same commit. The Android app is not part of these phases; its API (door code, Stay, requests, announcements) is built in phases 3–6.

## 17. Documents, ADRs and the mentor

- New ADRs (numbers from ADR-19): Managers system-wide and Staff per Block; Term prices and the registration-period wizard; *Gia hạn*, renewal and next-Term changes without price differences; payment claims with manual confirmation (supersedes ADR-08 and the simulator part of ADR-18); door codes; Room Class per Room per Term with furniture; two languages; Google sign-up with verification (amends ADR-07 "no self sign-up"); demo reset tool.
- OI-04 revised (Room Class per Room per Term); ADR-12 amended (renewal returns as *Gia hạn*; Period of Stay stays removed).
- **Tell the mentor** (owner: Tisou, like OI-14): SePay (a Must item) removed; students sign up; Managers are no longer Block-scoped; renewal and the requests window; payment confirmation by hand.
- Backend `CLAUDE.md`: the base data keeps accounts and Buildings only; demo scenarios are loaded by the reset tool, not by Flyway.

## 18. Prerequisites and open items

| ID | Item | Who | Recommendation / status |
|---|---|---|---|
| P-1 | Google OAuth client: create the project, consent screen (External; `openid`, `email`, `profile`; published), Web client with JavaScript origins `https://campusstay-fpt-ten.vercel.app` and `http://localhost:5173`; save the JSON as `C:\Users\DELL\.campusstay\google-oauth.json` | Tisou | Claude Code then sets the VM `.env` and Vercel's `VITE_GOOGLE_CLIENT_ID` without printing the secret, and tests with a real account. **25/10/2026:** done — the client is set on the VM (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and in Vercel (`VITE_GOOGLE_CLIENT_ID`) and runs locally; signing in on production with a real account works (checked by Tisou, 25/10/2026); the OAuth client also lists the `/signin` pages as redirect URIs for browsers that block pop-ups (A-22) |
| P-2 | Gmail App Password for SMTP (password reset, staff invitations, emails) | Tisou (optional) | same handling as P-1 |
| P-3 | Door-code encryption key on the VM | Claude Code | generated on the server, never printed. **25/10/2026:** phase 3 reads it as `DOOR_CODE_KEY` (base64 of 32 bytes, `openssl rand -base64 32`; `infra/prod/.env.example`); without it the door-code endpoints answer `503` and the rest works. Set on the VM on 25/10/2026 (generated there, never printed) before phase 3 was merged |
| O-1 | Review 2 date and what it must show; how phases reach `main` (which deploys production) | Tisou | **Decided 24/10/2026:** until Review 2, each phase is built on its own branch (`feat/v2-phase<n>`) and merged into `main` only when it is complete and the demo still works; documentation and urgent fixes still go to `main` directly; afterwards the standing rule applies again |
| O-2 | When to start the Android app | Tisou | **Decided 24/10/2026:** after phase 6, as its own phase |
| O-3 | Email redirect (`MAIL_REDIRECT_TO`) now that real students sign up | Tisou | **Decided 24/10/2026:** redirect only the fictional base-data and demo accounts; real accounts receive their own email (built in phase 2: `auth_user.demo`, `ntf_email_outbox.demo_recipient`) |
