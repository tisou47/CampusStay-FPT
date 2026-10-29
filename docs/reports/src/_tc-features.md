**F-01 Sign-in (password, Google)** (All; FR-AUTH-01, 02)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F01-01 | Main | Valid credentials return a token and the contract user shape. | TC-AUTH-001 | Passed |
| TC-F01-02 | Main | An unknown FPT Google account signs up as a student without a password; until it sets one only the setup endpoints answer; the password follows the usual rules and is set once. | TC-AUTH-038 | Passed |
| TC-F01-03 | Rule | The 5th wrong password locks the account, even for the right password. | TC-AUTH-005 | Passed |
| TC-F01-04 | Exception | No token → 401; a student calling an Admin endpoint → 403. | TC-AUTH-004 | Passed |

**F-02 Student accounts: verification and list import** (Student, Manager; FR-AUTH-04, 05)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F02-01 | Main | The sign-up form checks every field and the student code; once sent the account is Pending verification, every Manager is told, and the student cannot apply. | TC-AUTH-039 | Passed |
| TC-F02-02 | Main | A Manager verifies a pending account (the student is told) or rejects it (locked); locking signs the student out until a Manager unlocks the account; a rejected account comes back as pending. | TC-AUTH-045 | Passed |
| TC-F02-03 | Rule | The template names the columns; an upload is previewed line by line (New, Update, Unchanged, Error with the reason) and counts the students the file leaves out; nothing changes before the confirmation. | TC-AUTH-046 | Passed |
| TC-F02-04 | Main | Confirming creates and updates the accounts, verifies the waiting one that matches, gives a fictional student's code to the real student, marks real students missing from the file Not enrolled (never fictional ones), is written to the Audit Log and cannot run twice. | TC-AUTH-047 | Passed |
| TC-F02-05 | Rule | A major is read from its code, its English label or its Vietnamese name, the other FPT majors are in the list (V61), and a student-code prefix such as SS put in the major column gets an error that says so; the file is the XLSX the template writer makes. | TC-AUTH-056 | Passed |
| TC-F02-06 | Exception | Only a verified account may apply: a pending one sees why and is refused (ADR-26). | TC-APP-022 | Passed |

**F-03 Registration-period request and Term publication** (Manager, Admin; FR-CFG-04, 05)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F03-01 | Main | A Manager files a request; it is Submitted with its proposal and history, every Admin and every other Manager is notified with a link to the requests list, and the requester is not. | TC-CFG-016 | Passed |
| TC-F03-02 | Main | The Admin builds the Draft from a Manager's request: it holds the request's dates, Blocks, Rooms and prices, the request is In progress (the Manager is told) and building again opens the same Draft; a price that differs from the request needs a reason, which the request then shows next to the difference. | TC-CFG-019 | Passed |
| TC-F03-03 | Rule | The Timeline step checks spec §5.2 per field: registration closing before it opens, renewal milestones filled in only partly or out of order, Check-in before the Term before is left. | TC-CFG-020 | Passed |
| TC-F03-04 | Rule | A Draft with unsaved steps cannot be published; once every step is saved, publishing fixes the Term's prices, Deposit and rules, tells every Manager (Term dashboard link) and puts the Term announcement on the students' board and bell. A later default-price change leaves the Term's prices alone, an Application pays the Term's Deposit, and once an Invoice exists the prices are locked. | TC-CFG-021 | Passed |
| TC-F03-05 | Exception | Missing fields and an unknown Block are named per field; a second open request for the same Term is refused; Staff and students cannot file or read requests. | TC-CFG-017 | Passed |

**F-04 Apply for a Term** (Student; FR-APP-01..03)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F04-01 | Main | Submit with a Deposit Invoice, then the list, detail, Home and notification; a second one is refused. | TC-APP-002 | Passed |
| TC-F04-02 | Main | An invited pair reaches the office together: the first to pay waits as Awaiting Roommate; both are Submitted when the second Deposit is paid. | TC-APP-005 | Passed |
| TC-F04-03 | Rule | The stay length (spec §6.6, D-13) is 1 to stay.max_terms, capped by the semesters the student has left (stay.program_semesters); it is kept on the Application and shown to the student and the back office; a student who already holds a Bed for the Term cannot apply (not a continuing resident). | TC-APP-023 | Passed |
| TC-F04-04 | Rule | Contact, consent and roommate rules are named per field. | TC-APP-003 | Passed |
| TC-F04-05 | Exception | Staff cannot use student screens; another student's Application is 404. | TC-APP-009 | Passed |

**F-05 VietQR payment claim and confirmation** (Student, Manager; FR-BIL-01..03)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F05-01 | Main | The claim waits for a Manager and stops the Deposit window (the Application does not expire); the queue lists it with the count and total; a bulk confirmation pays each Invoice at the time of its claim, one audit entry each, and the Applications are submitted; unknown Invoices are skipped. | TC-BIL-032 | Passed |
| TC-F05-02 | Main | A student reads and saves their refund account; the number keeps its digits only, each field is checked, and only students have one. | TC-AUTH-058 | Passed |
| TC-F05-03 | Rule | A rejection needs a reason; the Invoice is Unpaid again and the deadline continues with the time that was left (at least payment.rejected_claim_min_hours); the student is told; a second rejection cancels the Deposit and the Application expires. | TC-BIL-033 | Passed |
| TC-F05-04 | Exception | One claim at a time; a paid or void Invoice and a Deposit past its deadline cannot be claimed; a student cannot cancel while a claim waits; only Managers see the queue and decide; an empty selection is refused; Invoices without a claim are skipped. | TC-BIL-034 | Passed |

**F-06 Review, assignment and Round 2** (Manager, Student, System; FR-APP-05, 07, FR-ASG-01..03)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F06-01 | Main | The Manager approves in bulk, runs, resolves the conflict to the waitlist and commits the Block, which approves it at once (ADR-19): Allocations, Balance Invoices, notifications and My Room. Staff cannot commit. | TC-ASG-010 | Passed |
| TC-F06-02 | Main | A Manager runs Round 2 (M8): the Waitlisted students without an open offer get held options on the Term's free Beds, by the rules of the offers made when a Block is approved; students may not run it. The Manager's list shows who is waiting without an offer, then who got one with its options (A-58). | TC-APP-024 | Passed |
| TC-F06-03 | Main | A waitlisted student sees the open offer, the day the waitlist ends and the refund; withdrawing closes the offer, releases its Beds, cancels the Application and asks a Manager to refund the whole Deposit, whose list shows the student's bank account (A-61, A-62). A plain cancel is refused, and only one's own waitlisted Application can be withdrawn. | TC-APP-025 | Passed |
| TC-F06-04 | Rule | The queue, the review view (opening it starts the review), rejection needs a note, once only. | TC-APP-010 | Passed |
| TC-F06-05 | Rule | The priority group goes first; the same input gives the same proposal. | TC-ASG-005 | Passed |
| TC-F06-06 | Rule | When the Term's check-in starts, a waitlisted Application without an open offer is cancelled with the whole Deposit to refund and the student is told; one with an open offer keeps it until it is answered. | TC-APP-026 | Passed |
| TC-F06-07 | Exception | A dry run is a preview; students and Staff cannot use runs (ADR-19). | TC-ASG-011 | Passed |
| TC-F06-08 | Exception | Every Manager sees every Block's Applications (ADR-19); Staff and students cannot review. | TC-APP-011 | Passed |

**F-07 Balance, forfeit and door code release** (Student, Staff, System; FR-ASG-04, 11, FR-INV-04)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F07-01 | Main | Assigned and unpaid (yellow); paid but before the check-in start, then without a Room code, the student waits (no code); Staff confirm the Room's code and it is released: the student is a resident (orange), is told and sees the code; a student who pays later receives the current code at once. | TC-ASG-032 | Passed |
| TC-F07-02 | Main | Staff draw a random code, read it to set the lock, confirm it, and it becomes the Room's code; the database holds it encrypted and every view is in the Audit Log. | TC-INV-019 | Passed |
| TC-F07-03 | Main | A student whose Balance is paid and whose check-in start has come waits for the Room's code; once Staff confirm it, it is released to them (spec §6.8): they are told (never the code), see it and become a resident; without a Bed there is nothing to show. | TC-INV-023 | Passed |
| TC-F07-04 | Rule | A Balance past its deadline without a claim is forfeited: the Allocation is cancelled, the Balance void, the Application Forfeited, the Deposit kept by the rule "Balance not paid" (a 0 % rule records no refund; a 10 % rule one refund, never two) and the student told; a claim waiting keeps the Bed, and so does a later Balance deadline a Manager chose when approving a late check-in, which may not pass the arrival day (the Balance is paid before check-in). | TC-ASG-033 | Passed |
| TC-F07-05 | Exception | Codes are 6 new digits; other Blocks and other roles are refused. | TC-INV-020 | Passed |

**F-08 Check-in and check-out desk** (Staff; FR-ASG-04, 06)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F08-01 | Main | The Balance includes the Utility Deposit; until it is paid the desk blocks check-in; then the student checks in with the hand-over items, once only. | TC-ASG-020 | Passed |
| TC-F08-02 | Main | Check-out settles the Utility Deposit: the share since the Room's last reading, the damage charge, the refund to the Manager; the Bed is free again, the figures stay as settled and the Room's door code must change. | TC-ASG-022 | Passed |
| TC-F08-03 | Main | The desk enters the final meter readings Room by Room, typed or from the XLSX template, before the leavers come: each Room's reading goes to the check-out drafts of its leavers; a Room without leavers in the user's Blocks or a reading below the Room's last one is reported and not saved. | TC-ASG-046 | Passed |
| TC-F08-04 | Rule | Check-out records the damage of each furniture item of the Room (spec §6.16): the damage charge is their sum, a damaged item becomes Broken with the reason in its history, an item of another Room is refused; the list shows the Term's check-out date and whether a leaver is past it. | TC-ASG-045 | Passed |
| TC-F08-05 | Exception | Another Block's Staff do not find the student, every Manager does (ADR-19); students and the Admin have no desk. | TC-ASG-021 | Passed |

**F-09 Late check-in** (Student, Staff, Manager; FR-ASG-05)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F09-01 | Main | The student asks online with a reason, the day and an evidence file, up to the check-in end plus late_check_in.max_days; the Managers are told; one request per Term, also after the decision; a Manager approves at most that day. | TC-ASG-037 | Passed |
| TC-F09-02 | Main | Staff record the request with evidence; the Block Manager approves a deadline, after which the desk lets the student check in even though the Term's window is closed. | TC-ASG-030 | Passed |
| TC-F09-03 | Rule | A rejection needs a reason; every Manager sees the request (ADR-19); a student has one late check-in per Term, so the desk cannot record another after the rejection. | TC-ASG-031 | Passed |

**F-10 Next-Term requests** (Student, Staff; FR-REQ-01..05)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F10-01 | Main | Staff of the Block approve with a free matching Bed of the next Term: the next-Term Allocation moves there (the student still lives in their Room this Term) and the next-Term fee will be that Bed's price; no Invoice or refund is made; Staff of another Block see nothing; after the next-Term fees the Beds are fixed. | TC-REQ-002 | Passed |
| TC-F10-02 | Main | A direct swap of next-Term Beds: the partner accepts, Staff check and approve, the two next-Term Allocations exchange Beds while both students stay where they live this Term. | TC-REQ-010 | Passed |
| TC-F10-03 | Main | The requests window in one list (room changes, swaps, Room Class changes, extensions), oldest first; a bulk decision decides each one in its own transaction and reports those it could not (a change still waiting for consent); a bulk rejection needs a reason; Staff of another Block see nothing. | TC-REQ-021 | Passed |
| TC-F10-04 | Rule | A Room Class change of a Room for the next Term: every other continuing resident must agree (one in the Stay's last Term is not asked); Staff cannot approve before; the furniture check reserves the missing items of the Block store; the Room's class changes for the next Term only, and the next-Term price follows it; a refusal cancels a change; Staff of another Block see nothing. | TC-REQ-020 | Passed |
| TC-F10-05 | Rule | An extension in the Stay's last Term is approved at once (the Bed is kept, the Stay commits more Terms); with an overdue Invoice it waits for Staff, who decide it with a note to reject; the length is checked; the end of the stay releases the next-Term Bed at once; after the request deadline nothing can be filed. | TC-REQ-019 | Passed |
| TC-F10-06 | Exception | A rejection needs a listed reason; the student sees it; students may not decide. | TC-REQ-003 | Passed |

**F-11 Requests window, reconciliation and next-Term fees** (Manager, System; FR-ASG-07, 08, FR-AUTH-08)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F11-01 | Main | M2 opens the requests window once: a resident with Terms left keeps the Bed as continuing, one in the Stay's last Term as awaiting extension; a student not living in the Room yet and a terminated resident get none. My Room shows the next Term with its price, the students are told, Staff and Managers read the overview, and the new students' assignment of the next Term waits for the request deadline. | TC-ASG-038 | Passed |
| TC-F11-02 | Main | M3 closes filing: a Bed still awaiting extension is released (the student is told in-app and by email, with the day to check out), a continuing one stays; the overview counts the ending. | TC-ASG-039 | Passed |
| TC-F11-03 | Main | The enrolled list of the next Term: a continuing resident who graduated (group 1, the directory updated: group 4), a continuing resident missing from the list (group 2), an unknown code (group 3), another student's changed status (group 4); the template; Managers upload, the Admin reads, Staff may not; a file without a student code column is refused. | TC-AUTH-053 | Passed |
| TC-F11-04 | Rule | Resolving: a note is required; "Not enrolled" releases the student's Bed for the next Term (told in the app); "Enrolled" keeps everything; an item is resolved once; then nothing blocks the next-Term fees. | TC-AUTH-054 | Passed |
| TC-F11-05 | Rule | Issue next-Term fees: the preview names what blocks them (filing still open, no reconciliation); once filing closed and the enrolled list is reconciled a Manager issues one fee per continuing resident = 100 % of the next Term's price of the Bed (no Deposit); issuing again charges nobody twice; leavers receive the end-of-stay notice; Staff may not issue; the fee cannot be claimed while Utility is overdue; paid, the Stay counts the next Term. | TC-ASG-040 | Passed |
| TC-F11-06 | Exception | M7: a next-Term fee unpaid at its deadline with no claim waiting is void and its Bed released (nothing kept); a fee whose claim waits for a Manager keeps the Bed. | TC-ASG-041 | Passed |

**F-12 Turnover and operational moves** (Staff, Manager; FR-ASG-10)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F12-01 | Main | The turnover: from the next Term's check-in start a paid continuing resident receives the Room's code and lives in the next Term (the current Term's Allocation ends); a mover's old Room needs a new code; the turnover list shows leavers, movers and the Rooms whose residents change, and Staff record their meter readings. | TC-ASG-042 | Passed |
| TC-F12-02 | Main | Staff move a resident to another Room of their Block for a reason: both meters are read, the old Room's code must change, the next-Term Bed follows, nothing is charged; the student is told; the moves list shows it; validation, other Blocks and students are refused. | TC-ASG-043 | Passed |
| TC-F12-03 | Exception | After the next-Term fees are issued, Staff may no longer move a next-Term Bed; a Manager moves an unpaid one and its fee is void and issued again for the new Bed; a paid fee allows only a Bed of the same price. | TC-ASG-044 | Passed |

**F-13 Maintenance with routing, time limits and escalation** (Student, Staff, Manager; FR-MNT-01, 02, FR-REQ-06, 07)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F13-01 | Main | A checked-in student reports with photos and follows the request; the form is validated. | TC-MNT-001 | Passed |
| TC-F13-02 | Main | Staff of the Block assign, plan the visit, post updates and resolve; the student is notified, reopens once and confirms the fix. Photos open through signed links. | TC-MNT-002 | Passed |
| TC-F13-03 | Main | A Staff member reads their own duty, request types and workload, and starts or ends their shift (A-60); the change is audited, and students may not use it. | TC-AUTH-057 | Passed |
| TC-F13-04 | Rule | A new Maintenance Request gets its SLA deadline from the Block's timer (urgent sooner than normal) and may name a furniture item of the Room, which the queue and the detail show; the item's history keeps the repair, reported and resolved; an item of another Room is refused. | TC-MNT-008 | Passed |
| TC-F13-05 | Rule | Only the person in charge changes the status; another Staff member of the Block takes the request over first (recorded in its history), and a Manager may act on any request. | TC-MNT-009 | Passed |
| TC-F13-06 | Rule | An unassigned request escalates, then passes its timer; the Manager reassigns it once. | TC-REQ-016 | Passed |
| TC-F13-07 | Exception | The queue is scoped: another Block's Staff neither see nor count the request; Managers do (ADR-19). | TC-MNT-003 | Passed |

**F-14 Meter readings and Utility Invoices** (Staff; FR-BIL-04)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F14-01 | Main | Closing the month issues each resident's Utility Invoice with its breakdown; then it is read-only. | TC-BIL-026 | Passed |
| TC-F14-02 | Rule | Within a segment, shares follow the time each resident lived in the Room; totals round up. | TC-BIL-030 | Passed |
| TC-F14-03 | Rule | A reading may not go back; an unusual jump waits for a confirmation. | TC-BIL-024 | Passed |
| TC-F14-04 | Exception | A CSV import checks every line before it saves any. | TC-BIL-025 | Passed |

**F-15 Utility debt and termination** (System, Manager; FR-BIL-05, FR-ASG-09)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F15-01 | Main | An overdue Utility Invoice gives warning 1 (in-app and email), once; a second overdue month gives the final warning with the termination day (today + 3); paying everything closes both. | TC-BIL-037 | Passed |
| TC-F15-02 | Main | A Manager terminates a resident's stay with a reason: Notice sent with the move-out date, the student is told (in-app and email) and sees it on My Room, the desk lists the check-out; Staff read it but may not start or cancel; one termination at a time; a Manager cancels it with a reason and the student is told. | TC-ASG-035 | Passed |
| TC-F15-03 | Rule | From the termination day, two overdue months terminate the stay (notice to the student, the Managers' list); a debt reaching the Utility Deposit does too, even in its first month; with that rule off one month does not, and nothing happens before the termination day. | TC-BIL-038 | Passed |
| TC-F15-04 | Exception | Past the move-out date the termination is Overdue: Managers and the Block's Staff are told, the Room's door code must change and the student no longer sees it; the check-out closes the termination and refunds the unused room fee by its rule (Not enrolled 30 %, decided by a Manager). | TC-ASG-036 | Passed |

**F-16 Inventory, Room Class by Term, furniture** (Manager, Staff; FR-INV-01..03)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F16-01 | Main | A Manager sets Rooms' class for Spring 2027; Fall 2026 keeps the old class, the Rooms and Beds screen and the assignment inputs of Spring 2027 use the new one, conformance shows what the class lacks, and every Room's change is in the Audit Log. | TC-INV-009 | Passed |
| TC-F16-02 | Main | Staff move items inside their Block now (status follows the place, the Room's conformance changes); moving to another Block is a Manager's transfer, planned and then done by Staff; a planned move can also be cancelled. | TC-INV-017 | Passed |
| TC-F16-03 | Rule | A running Term keeps its classes, and a Room whose Beds are already given for the Term (an Allocation) keeps its class there, so no price already charged changes. | TC-INV-010 | Passed |
| TC-F16-04 | Exception | Only Managers set classes; students cannot read; bad input is named. | TC-INV-011 | Passed |

**F-17 Notifications, announcements and push** (All; FR-NTF-01..03)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F17-01 | Main | The Admin writes a pinned announcement for all students; a student reads it at the top of the board and in the bell, unread; marking it read in the bell (id `ann-…`) updates both; the Admin sees one read. | TC-NTF-041 | Passed |
| TC-F17-02 | Main | A notification is pushed to the user's devices after commit; an expired token is disabled. | TC-NTF-021 | Passed |
| TC-F17-03 | Exception | Staff write only to the residents of their Blocks: everybody or another Block is refused; the residents of the Block read it and other students do not; Staff end their own announcement; students cannot write one. | TC-NTF-042 | Passed |
| TC-F17-04 | Exception | Signed-in users only. | TC-NTF-003 | Passed |

**F-18 Dashboards, reports, exports and search** (Staff, Manager, Admin; FR-RPT-01..04)

| ID | Type | Test case | Automated test | Result |
|---|---|---|---|---|
| TC-F18-01 | Main | Block Manager dashboard: occupancy by floor, the SLA rate and target, what is waiting. | TC-RPT-002 | Passed |
| TC-F18-02 | Main | The dashboard of a Term shows its milestones in order with their progress, its Applications by status, the places per Room Type × Room Class × gender with the Term's prices, and the Deposits issued; Staff cannot read it and an unknown Term is 404. | TC-RPT-012 | Passed |
| TC-F18-03 | Rule | Exports are CSV files with the screen's columns, written to the Audit Log; scope and permissions. | TC-RPT-008 | Passed |
| TC-F18-04 | Rule | The Manager's and the Admin's dashboards report the money of Collections and refunds (a paid Deposit without a Bed included) with what is still owed, residents apart from held Beds, the continuing residents the funnel leaves out, the Staff work a Manager decides, and the values of each attention line. | TC-RPT-015 | Passed |
| TC-F18-05 | Exception | The back-office search finds students by code or name, Rooms with or without the dash and request codes inside the user's Blocks; Staff of another Block find neither the Room nor its resident; short queries find nothing and students may not search. | TC-RPT-013 | Passed |

