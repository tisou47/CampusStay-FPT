**UC-01 Sign in with Google or password**

| Item | Description |
|---|---|
| Actors | Student, Staff, Manager, Admin |
| Feature | Accounts, staff and audit |
| Trigger | A user opens the sign-in page. |
| Preconditions | The user has an account (a student who signs in with Google for the first time gets one), or is a back-office user with a password.<br>Google sign-in needs the Google client id to be set on the server. |
| Main flow | 1. The user chooses Google or types an email and password.<br>2. With Google, the web app exchanges the code (or the Android app sends the ID token) and the server verifies it.<br>3. The server finds the user by Google subject or email; for a new @fpt.edu.vn address it creates a student account without a password and with verification Pending.<br>4. The server opens a session (remember me keeps it 30 days idle, otherwise 12 hours) and returns the token and the user.<br>5. A student without a password or without the sign-up form is sent to set the password and fill the form before anything else. |
| Alternative flows and exceptions | Five wrong passwords lock the account for 15 minutes; a per-client limit also applies.<br>A fictional back-office account cannot sign in with Google (GOOGLE_NOT_FOR_DEMO).<br>An account linked to another Google account is refused.<br>A forgotten password is reset by an emailed link valid for 30 minutes. |
| Business rules | Only the @fpt.edu.vn domain is accepted for Google.<br>Until a password is set and the sign-up form is sent, the server answers PASSWORD_REQUIRED or PROFILE_REQUIRED. |
| Functions (endpoints) | `POST /auth/sign-in`<br>`POST /auth/google`<br>`POST /auth/sign-out`<br>`GET /auth/me`<br>`POST /auth/password/forgot`<br>`POST /auth/password/reset`<br>`POST /auth/password/set`<br>`POST /auth/password/change`<br>`PUT /students/me/verification` |
| Sequence diagram | 07_Sequence/seq-01-google-sign-in (Report 4) |

**UC-02 Apply for a Bed and pay the Deposit**

| Item | Description |
|---|---|
| Actors | Student, Manager |
| Feature | Applications |
| Trigger | A verified student opens the application wizard while a Term is open for registration. |
| Preconditions | The student is Verified, enrolled and not already living in a Bed for that Term.<br>A Term is published and registration is open. |
| Main flow | 1. The wizard checks eligibility (the Term's eligibility rules).<br>2. The student chooses the Room Type and Room Class, the roommate option, the contact details and the consents.<br>3. The system creates the Application in Awaiting Deposit and issues the Deposit Invoice with its due time.<br>4. The student transfers the Deposit and claims it (UC-04).<br>5. When a Manager confirms the payment the Application becomes Submitted (or Awaiting roommate while the partner has not paid).<br>6. A Manager reviews the Application (UC-23). |
| Alternative flows and exceptions | The Deposit is not paid by its due time: the Application expires.<br>The student cancels before the deadline: the Deposit is refunded by the refund rules. |
| Business rules | The prices and the Deposit are those fixed when the Term was published. |
| Functions (endpoints) | `GET /applications/eligibility`<br>`POST /applications`<br>`GET /applications/{id}`<br>`GET /applications`<br>`POST /applications/{id}/cancel` |
| Sequence diagram | 07_Sequence/seq-02-apply-with-deposit (Report 4) |

**UC-03 Invite a roommate**

| Item | Description |
|---|---|
| Actors | Student |
| Feature | Applications |
| Trigger | A student applies for a Room Type that allows choosing a roommate and enters a student code. |
| Preconditions | The Room Type lets students invite a roommate; the number of code checks per Term is not used up. |
| Main flow | 1. The student checks the partner's code (a limited number of checks per Term).<br>2. The Application is created together with an invitation (Pending).<br>3. The invited student sees the invitation, accepts or declines.<br>4. On accepting, the partner gets an Application of the same Room Type and Class with its own Deposit Invoice, and the two Applications are linked.<br>5. On declining or expiry the first student is matched automatically. |
| Alternative flows and exceptions | The invitation expires after its window.<br>The inviter cancels the invitation. |
| Business rules | A roommate is an enrolled student of the same gender, not yourself, with no Application or pending invitation this Term. |
| Functions (endpoints) | `POST /applications/roommate-check`<br>`POST /roommate-invitations/{id}/respond` |
| Sequence diagram | 07_Sequence/seq-03-roommate-invitation (Report 4) |

**UC-04 Claim a payment and confirm it**

| Item | Description |
|---|---|
| Actors | Student, Manager |
| Feature | Billing |
| Trigger | A student has transferred money for an Invoice, or a Manager opens the payment claims. |
| Preconditions | An Invoice is Unpaid or Overdue.<br>A Manager confirms with the CONFIRM_PAYMENTS permission. |
| Main flow | 1. The student opens the Invoice and sees the VietQR image and the transfer content.<br>2. After transferring, the student claims the payment with the bank reference; the Invoice becomes Awaiting confirmation.<br>3. A Manager compares the claims with the bank statement and confirms them (one by one or in bulk).<br>4. The system records the Payment, marks the Invoice Paid and publishes PaymentConfirmed: Applications are submitted, door codes released and receipts sent. |
| Alternative flows and exceptions | A Manager rejects the claim with a reason: the Invoice goes back to Unpaid or Overdue, or is Void after the last allowed attempt.<br>A claim of an Invoice that is not open is refused. |
| Business rules | Payments are not matched with a bank automatically.<br>The money of an issued Invoice never changes. |
| Functions (endpoints) | `GET /invoices/{id}/payment`<br>`POST /invoices/{id}/claim`<br>`GET /payment-claims`<br>`POST /payment-claims/confirm`<br>`POST /payment-claims/reject` |
| Sequence diagram | 07_Sequence/seq-04-payment-claim (Report 4) |

**UC-05 Run the assignment and commit it**

| Item | Description |
|---|---|
| Actors | Manager |
| Feature | Assignment and residence |
| Trigger | Registration has closed and a Manager starts an assignment run for the Term. |
| Preconditions | The Term has approved Applications; no other live run (an earlier one is discarded). |
| Main flow | 1. The Manager starts a run (a dry run or a real one).<br>2. The engine matches approved Applications to assignable Beds with the Term's matching criteria and proposes Beds per Block.<br>3. The Manager resolves each conflict by choosing a Bed or waitlisting the student.<br>4. Each Block is submitted for review and approved (or returned with a comment).<br>5. Approving creates the Allocations, moves the Applications to Allocated, issues the Balance Invoices and notifies the students. |
| Alternative flows and exceptions | Conflicts left in a Block stop its submission (CONFLICTS_LEFT).<br>A Block returned by the approver goes back to review. |
| Business rules | A Bed is never given twice in a Term (a database constraint).<br>Waitlisted students may get a Round 2 offer (UC-06). |
| Functions (endpoints) | `POST /assignment-runs`<br>`GET /assignment-runs/{runId}/proposal`<br>`POST /assignment-runs/{runId}/conflicts/{applicationId}/resolve`<br>`POST /assignment-runs/{runId}/commit`<br>`POST /assignment-runs/{runId}/approve`<br>`POST /assignment-runs/{runId}/return` |
| Sequence diagram | 07_Sequence/seq-05-assignment-run (Report 4) |

**UC-06 Answer a Round 2 offer**

| Item | Description |
|---|---|
| Actors | Manager, Student |
| Feature | Assignment and residence |
| Trigger | A Manager runs Round 2 for waitlisted students, or a student opens their offer. |
| Preconditions | The student is waitlisted and free Beds exist. |
| Main flow | 1. The Manager runs Round 2: the system creates an offer with held options.<br>2. The student opens the offer and accepts one option, or declines.<br>3. Accepting places the student in the Bed (Allocation and Balance Invoice).<br>4. Declining cancels the Application and the Deposit is refunded in full. |
| Alternative flows and exceptions | The offer expires: the Beds are released and the Application is cancelled with a full refund. |
| Business rules | A waitlisted student who is not placed gets the whole Deposit back. |
| Functions (endpoints) | `POST /round2/run`<br>`GET /students/me/round2-offer`<br>`POST /round2-offers/{id}/respond` |
| Sequence diagram | 07_Sequence/seq-06-round2-offer (Report 4) |

**UC-07 Check in with the hand-over report**

| Item | Description |
|---|---|
| Actors | Student, Staff |
| Feature | Assignment and residence |
| Trigger | A paid student starts the hand-over of their Room. |
| Preconditions | The Balance is paid and the door code released; the student is within the check-in period. |
| Main flow | 1. The student starts the hand-over: a draft with the items of the Room and a due time.<br>2. The student answers the condition of each item, adds photos and meter readings, and submits.<br>3. If the report matches the baseline it becomes Final; otherwise Staff request a visit, verify on site and finalize it.<br>4. Final hand-over records the start of the Utility and the check-in. |
| Alternative flows and exceptions | No action before the due time: the hand-over becomes Final automatically.<br>Staff cancel a hand-over, or accept a late one.<br>The student asks to check in late. |
| Business rules | The report is compared with the baseline of the Room's furniture and the last meter readings. |
| Functions (endpoints) | `POST /students/me/handover/start`<br>`PUT /students/me/handover`<br>`POST /students/me/handover/submit`<br>`POST /handovers/{id}/visit`<br>`PUT /handovers/{id}/verification`<br>`POST /handovers/{id}/cancel` |
| Sequence diagram | 07_Sequence/seq-07-check-in-handover (Report 4) |

**UC-08 Set and release door codes**

| Item | Description |
|---|---|
| Actors | Staff, Manager, Student |
| Feature | Inventory |
| Trigger | A Balance is paid, or a resident leaves a Room. |
| Preconditions | Door codes are on (a key is set on the server). |
| Main flow | 1. A resident leaving a Room opens a door-code task for it.<br>2. Staff propose a 6-digit code (or let the system pick one) and confirm it: the old code is retired and the new one becomes Active.<br>3. When the Balance of a student is paid and the Room has no open task, the system releases the code to the student.<br>4. The student reads the code in My Room. |
| Alternative flows and exceptions | A proposal is cancelled before confirming.<br>Codes are imported in bulk from a file. |
| Business rules | Codes are stored encrypted; every viewing by Staff is written in the audit log. |
| Functions (endpoints) | `POST /door-codes/{room}`<br>`POST /door-codes/{room}/confirm`<br>`POST /door-codes/{room}/cancel`<br>`POST /door-codes/{room}/reveal`<br>`POST /door-codes/import` |
| Sequence diagram | 07_Sequence/seq-08-door-code-release (Report 4) |

**UC-09 Report and process a Maintenance Request**

| Item | Description |
|---|---|
| Actors | Student, Staff, Manager |
| Feature | Maintenance and inspections |
| Trigger | A resident reports a problem in the Room. |
| Preconditions | The student has a Room (or the reporter is Staff or a Manager). |
| Main flow | 1. The reporter chooses the category and urgency, describes the problem, adds photos and optionally a furniture item.<br>2. The system sets the SLA due time from the Block's timer and applies the routing rule: the matching Staff member is assigned.<br>3. Staff move the request to In progress and Resolved, adding updates.<br>4. The student confirms the fix (Closed) or reopens the request. |
| Alternative flows and exceptions | When the SLA time passes with the request open, an escalation opens for the Manager, who reassigns or handles it. |
| Business rules | A request that is not Submitted needs a person in charge. |
| Functions (endpoints) | `POST /maintenance-requests`<br>`PATCH /maintenance-requests/{id}`<br>`POST /maintenance-requests/{id}/updates`<br>`POST /maintenance-requests/{id}/confirm` |
| Sequence diagram | 07_Sequence/seq-09-maintenance-routing-sla (Report 4) |

**UC-10 Inspect Rooms**

| Item | Description |
|---|---|
| Actors | Staff, Manager |
| Feature | Maintenance and inspections |
| Trigger | A scheduled inspection run starts (every day at 06:00 campus time) or Staff open their current run. |
| Preconditions | An active schedule with a published checklist exists. |
| Main flow | 1. The job creates a run with the Rooms to inspect and notifies the inspector and the residents.<br>2. For each Room the inspector answers the checklist (people and furniture), adds photos and, where it applies, meter readings.<br>3. A failed item creates a Maintenance Request.<br>4. An unreachable Room is marked as such; the run is submitted when no Room is pending. |
| Alternative flows and exceptions | A checklist is archived: its schedules pause. |
| Business rules | A Room is done only when its checks are answered. |
| Functions (endpoints) | `GET /inspection-runs/current`<br>`POST /inspection-schedules`<br>`POST /inspection-checklists`<br>`POST /inspection-checklists/{id}/publish` |
| Sequence diagram | 07_Sequence/seq-10-inspection-run (Report 4) |

**UC-11 Request a room change**

| Item | Description |
|---|---|
| Actors | Student, Staff, Manager |
| Feature | Requests and Term transition |
| Trigger | A student files a room-change request during the next-Term requests window. |
| Preconditions | The requests window of the next Term is open and the student has a next-Term Allocation. |
| Main flow | 1. The student sees the options and files the request with a reason.<br>2. Staff of the Block see matching Beds and decide.<br>3. Approving moves the next-Term Allocation to the chosen Bed; rejecting records the reason.<br>4. The student is notified. |
| Alternative flows and exceptions | The request is cancelled when the Allocation is cancelled or moved. |
| Business rules | A change in the next Term does not change the price. |
| Functions (endpoints) | `POST /room-changes`<br>`GET /room-changes/{id}/matching-beds`<br>`POST /room-changes/{id}/decision` |
| Sequence diagram | 07_Sequence/seq-11-room-change (Report 4) |

**UC-12 Swap Beds with another student**

| Item | Description |
|---|---|
| Actors | Student, Staff, Manager |
| Feature | Requests and Term transition |
| Trigger | A student invites another student to swap, or answers a post on the swap board. |
| Preconditions | The requests window is open; both students have a next-Term Allocation. |
| Main flow | 1. A student invites a known student, or posts a wish on the swap board and another student asks.<br>2. The other student accepts or declines.<br>3. Staff decide; if the Beds are in different Blocks the request goes to a Manager.<br>4. Approving swaps the two next-Term Allocations. |
| Alternative flows and exceptions | An invitation expires.<br>Other open requests of the two students are closed when the swap is approved. |
| Business rules | A swap needs both students' agreement and an approver. |
| Functions (endpoints) | `POST /swaps`<br>`PUT /swap-board/my-post`<br>`POST /swap-board/posts/{id}/request`<br>`POST /swap-invitations/{id}/respond`<br>`POST /swaps/{id}/decision` |
| Sequence diagram | 07_Sequence/seq-12-swap (Report 4) |

**UC-13 Open a registration period**

| Item | Description |
|---|---|
| Actors | Manager, Admin |
| Feature | Terms and settings |
| Trigger | A Manager requests a registration period; an Admin builds and publishes the Term. |
| Preconditions | The requester has REQUEST_TERMS; the builder has CONFIGURE. |
| Main flow | 1. A Manager submits a request (Term name, stay dates, Blocks, prices).<br>2. The Admin may ask for changes; the Manager updates the request.<br>3. The Admin creates a Term draft from the request and fills the wizard step by step (timeline, Blocks, prices, Deposit, rules, documents).<br>4. Publishing fixes the prices, Deposit, eligibility and matching criteria of the Term and marks the request Done. |
| Alternative flows and exceptions | The Admin rejects a request with a reason.<br>The milestones are validated when saved. |
| Business rules | After publishing, a date that has passed is fixed and an open deadline can be extended but never shortened. |
| Functions (endpoints) | `POST /term-requests`<br>`POST /term-requests/{id}/decision`<br>`POST /admin/terms/drafts`<br>`PUT /admin/terms/{id}/wizard/{step}`<br>`POST /admin/terms/{id}/publish` |
| Sequence diagram | 07_Sequence/seq-13-term-wizard-publish (Report 4) |

**UC-14 Renew a stay and pay the next-Term fee**

| Item | Description |
|---|---|
| Actors | Student, Manager, System |
| Feature | Assignment and residence |
| Trigger | The requests window of a Term opens (milestone M2). |
| Preconditions | The student lives in a Bed and has not chosen to leave. |
| Main flow | 1. The job gives every resident not leaving an Allocation on the same Bed for the next Term.<br>2. Students may ask to extend, end their stay, change Room or swap.<br>3. At M3 the filing closes; Managers decide the open requests.<br>4. A Manager issues the next-Term fees; each live Allocation gets one Invoice.<br>5. A student who has not paid by M7 loses the Bed. |
| Alternative flows and exceptions | A student no longer enrolled loses the next-Term Allocation after the reconciliation (UC-17). |
| Business rules | The Term's milestones (M1 onward) are checked against each other when the Term is built. |
| Functions (endpoints) | `POST /students/me/stay/extension`<br>`POST /students/me/stay/end`<br>`POST /next-term-requests/decision`<br>`POST /next-term-fees/issue` |
| Sequence diagram | 07_Sequence/seq-14-renewal-next-term-fee (Report 4) |

**UC-15 Bill utilities**

| Item | Description |
|---|---|
| Actors | Staff, System, Student |
| Feature | Billing |
| Trigger | A new month starts, or a resident moves in or out. |
| Preconditions | The Room has a meter period for the month. |
| Main flow | 1. Staff enter or import the month's readings; a reading above three times the previous use is flagged Check value.<br>2. Staff confirm the readings and close the period.<br>3. The system splits each Room's use by the days each resident lived there and issues Utility Invoices.<br>4. Unpaid Invoices raise warnings and, at the last level, a termination date. |
| Alternative flows and exceptions | A meter cut when a resident moves splits the month in two parts. |
| Business rules | Two overdue months, or a debt that reaches the Utility Deposit, end a stay after the final warning. |
| Functions (endpoints) | `PUT /meter-periods/{id}/readings/{room}`<br>`POST /meter-periods/{id}/import`<br>`POST /meter-periods/{id}/readings/{room}/confirm`<br>`POST /meter-periods/{id}/close`<br>`POST /turnover/meter-cuts` |
| Sequence diagram | 07_Sequence/seq-15-utility-meter-invoice (Report 4) |

**UC-16 Terminate a stay**

| Item | Description |
|---|---|
| Actors | Manager, Staff, System |
| Feature | Assignment and residence |
| Trigger | A Manager starts a termination, or the utility-debt rule asks for one. |
| Preconditions | The student has an active Allocation. |
| Main flow | 1. A Manager starts the termination with a reason and a move-out date; the student gets a notice.<br>2. The student checks out at the desk before the date: the termination closes and the unused fee is refunded by rule.<br>3. If the date passes, the termination becomes Overdue: the next-Term Bed is released and the door code is changed. |
| Alternative flows and exceptions | The Manager cancels a termination that has not become Overdue. |
| Business rules | An Overdue termination cannot be cancelled: the student is placed again instead. |
| Functions (endpoints) | `POST /terminations`<br>`POST /terminations/{id}/cancel`<br>`POST /check-out/{allocationId}` |
| Sequence diagram | 07_Sequence/seq-16-termination (Report 4) |

**UC-17 Reconcile enrollment**

| Item | Description |
|---|---|
| Actors | Manager |
| Feature | Accounts, staff and audit |
| Trigger | A Manager uploads the school's list of enrolled students for a Term. |
| Preconditions | The requests window of the Term is open. |
| Main flow | 1. The Manager downloads the template and uploads the list (CSV or XLSX).<br>2. The system updates each student's enrollment status from the file and opens an item for every resident or applicant not listed.<br>3. The Manager resolves each open item.<br>4. A student marked not enrolled loses the next-Term Allocation and the Application. |
| Alternative flows and exceptions | Items that only inform stay Info. |
| Business rules | Fees of the next Term are issued only after the list is reconciled. |
| Functions (endpoints) | `GET /reconciliations/template`<br>`POST /reconciliations`<br>`POST /reconciliations/{id}/items/{itemId}/resolve` |
| Sequence diagram | 07_Sequence/seq-17-reconciliation (Report 4) |

**UC-18 Hold a Family Day**

| Item | Description |
|---|---|
| Actors | Manager, Student, Staff |
| Feature | Family Day |
| Trigger | A Manager creates a Family Day for a Block. |
| Preconditions | The student lives in the Block. |
| Main flow | 1. A Manager creates the Family Day with time slots and places, and publishes it.<br>2. A resident registers guests for one time slot; the places are taken in one step.<br>3. At the gate Staff verify the guest's pass, check the identity and check the guest in, later out.<br>4. A Manager closes the Family Day: guests who did not arrive become No-show. |
| Alternative flows and exceptions | A guest stays past the slot: Staff remind the student, who confirms the guest is safe.<br>The Family Day or a registration is cancelled. |
| Business rules | Guests under 18 come with an adult; entry opens 15 minutes before the slot (settings family_day.adult_age and family_day.early_minutes). |
| Functions (endpoints) | `POST /family-days`<br>`POST /family-days/{id}/publish`<br>`POST /students/me/family-days/{id}/registration`<br>`POST /family-day-visitors/verify`<br>`POST /family-day-visitors/{id}/check-in`<br>`POST /family-day-visitors/{id}/check-out`<br>`POST /family-days/{id}/close` |
| Sequence diagram | 07_Sequence/seq-18-family-day (Report 4) |

**UC-19 Ask the AI assistant**

| Item | Description |
|---|---|
| Actors | Student |
| Feature | AI assistant |
| Trigger | A student opens the assistant and asks a question. |
| Preconditions | The server has a model configured; otherwise the assistant says it is offline. |
| Main flow | 1. The app sends the conversation (nothing is stored on the server).<br>2. The server answers door-code questions with a fixed text and never asks the model.<br>3. For other questions it puts the student's own data and the dormitory guide in the model's instructions and asks the model.<br>4. The answer is returned in the student's language. |
| Alternative flows and exceptions | More than 30 questions an hour are refused.<br>An answer in Chinese script is asked again once, then refused. |
| Business rules | The data is read through the student screens' services, so a student sees only their own data. |
| Functions (endpoints) | `GET /students/me/assistant`<br>`POST /students/me/assistant/chat` |
| Sequence diagram | 07_Sequence/seq-19-ai-assistant (Report 4) |

**UC-20 Receive notifications and push**

| Item | Description |
|---|---|
| Actors | Student, Staff, Manager |
| Feature | Notifications |
| Trigger | A domain event happens (for example an Allocation is created). |
| Preconditions | For push: the mobile app registered the device token. |
| Main flow | 1. The listener writes the in-app notification in the user's language from the template.<br>2. After the transaction commits, the push is sent to each registered device.<br>3. Tapping the notification opens the related screen. |
| Alternative flows and exceptions | An email is queued in the outbox and retried up to five times. |
| Business rules | Notification texts exist in Vietnamese and English. |
| Functions (endpoints) | `POST /devices`<br>`GET /notifications`<br>`POST /notifications/read-all`<br>`POST /notifications/{id}/read` |
| Sequence diagram | 07_Sequence/seq-20-push-notification (Report 4) |

**UC-21 Work within a shift**

| Item | Description |
|---|---|
| Actors | Staff, Manager |
| Feature | Accounts, staff and audit |
| Trigger | A Staff member makes a change. |
| Preconditions | Staff have a weekly schedule (or none, which counts as outside the shift). |
| Main flow | 1. Before a change runs, the system checks the time against this week's shift and the kind of work the person handles.<br>2. Inside the shift the change runs and is recorded.<br>3. Outside it the system answers SHIFT_CONFIRM_REQUIRED; the person confirms and repeats the call with the acknowledgement header; the change runs and is recorded with the acknowledgement. |
| Alternative flows and exceptions | Managers plan each week's shifts and send the schedule; they are reminded on the day and hour the Admin chooses. |
| Business rules | Every Staff change is recorded in the Staff activity log. |
| Functions (endpoints) | `GET /staff-activity` |
| Sequence diagram | 07_Sequence/seq-21-staff-shift-gate (Report 4) |
