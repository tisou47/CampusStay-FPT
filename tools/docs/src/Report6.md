# II. Release Package & User Guides

## 1. Deliverable Package

| Item | Where | Notes |
|---|---|---|
| Source code | https://github.com/tisou47/CampusStay-FPT | one repository: `backend/` (API), `web/` (web application), `mobile/` (Android app), `infra/` (Docker Compose, production stack), `tools/`, `docs/` |
| Web application | https://campusstay-fpt-ten.vercel.app | the five portals (public sign-in, Student, Staff, Manager, Admin); built by Vercel from `main` |
| REST API | https://campusstay-api.eastasia.cloudapp.azure.com/api | OpenAPI description at `/api/v3/api-docs`, Swagger UI at `/api/swagger-ui.html`, health at `/api/actuator/health` |
| Android application | APK built from `mobile/` (`flutter build apk`), package `vn.fpt.campusstay.student`, version 1.0.0 | for students; talks to the production API |
| API collection | `postman/` in the repository: collection `CampusStay API`, environments Local and Production | one folder per role, plus smoke tests |
| Documents | `docs/SEP490_Report` (Reports 1–7, test workbooks), `docs/Diagrams` (draw.io sources and images) | |

**Accounts for the demonstration.** The server holds fictional people only. Back-office accounts are `admin01`…`admin04`, `manager01`…`manager04` and `staffa01`…`staffh04` (four Staff per Block) at `@fpt.edu.vn`; students sign in with their student code at `@fpt.edu.vn` (for example `se220001@fpt.edu.vn`). The password of every demo account is given to the review board with this package. Admin › System › Demo data puts the system in a known stage (0: fresh, A: registration open, B: next-Term fees issued, C: turnover week, D: check-in week) and lists, for each stage, the scenario to show and the account that shows it.

## 2. Installation Guides

### 2.1 System Requirements

| Part | To run | To build |
|---|---|---|
| API | Docker with Docker Compose (any 64-bit Linux server or Docker Desktop); PostgreSQL 17 | JDK 21, Maven; Docker for the integration tests |
| Web application | a current browser: Chrome or Edge | Node.js 22 and npm |
| Android application | Android 8.0 (API 26) or later | Flutter SDK 3.47 or later, JDK 17 or later, Android SDK |
| Production server | Ubuntu VM with Docker, a public DNS name for HTTPS (Caddy gets the certificate); a managed PostgreSQL 17 or the database container | GitHub Actions builds the image |

Optional services, each switched on by its setting: Google Sign-In (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), email through SMTP (`SPRING_MAIL_*`), push notifications (`FIREBASE_CREDENTIALS_FILE`) and the students' AI assistant (`ASSISTANT_BASE_URL`, an Ollama server). Without them the system runs and the related feature says it is off.

### 2.2 Installation Instruction

**A. Local installation (development or a demonstration on one computer).** From the repository root:

1. Start the database and the mail catcher: `docker compose -f infra/docker-compose.yml up -d db mail`. Emails sent by the system appear at http://localhost:8025.
2. Start the API with the development profile: `mvn spring-boot:run` in `backend/` (or `docker compose -f infra/docker-compose.yml --profile app up -d` to run it in a container too). Flyway creates the schema and loads the base data: 8 Blocks with their Rooms, Beds and furniture, the back-office accounts and 6,200 fictional students. The API answers at http://localhost:8080/api.
3. Start the web application: `npm ci` then `npm run dev` in `web/`; open http://localhost:5173. Calls to `/api` go to the local API.
4. Sign in as `admin01@fpt.edu.vn`, open Admin › System › Demo data and load a stage, or start from the fresh system by confirming the fees and publishing a Term (section 3.3).

**B. Production.** The stack is in `infra/prod/` and its runbook is `infra/prod/README.md`:

1. Prepare the VM once: a deploy user, Docker, the firewall (ports 80 and 443), the folder `/opt/campusstay` with `.env` filled from `infra/prod/.env.example` (database, Google, SMTP, Firebase, door-code key).
2. Set the repository's deployment secrets (server address, SSH key). From then on a merge into `main` runs `mvn verify`, builds the image, pushes it to GHCR, backs up the database, deploys over SSH and waits for `/api/actuator/health` to answer UP.
3. Vercel builds the web application from `main` with `VITE_API_BASE_URL` set to the production API.

**C. Android application.**

1. On the phone, allow installing apps from this source (Settings › Security › Install unknown apps).
2. Open the APK file and install it, then sign in with the student account (password or Google).
3. Allow notifications so that decisions, invoices and reminders arrive as push messages; a tap opens the related screen.

To build the APK: in `mobile/`, `flutter pub get`, then `flutter build apk --dart-define-from-file=config.json` (`config.json` holds the Google client id and, if needed, `API_BASE_URL`; `android/app/google-services.json` enables push).

## 3. User Manual

### 3.1 Overview

Everyone signs in on the same page with an `@fpt.edu.vn` email and a password, or with Google (students). Each role lands on its own portal; the top bar holds the Term, the Block (Staff and Managers), the search, the language (Vietnamese or English) and the notifications.

![Sign-in page](../../../docs/Screenshots/signin.png)

Table: Roles and their portals
| Role | Portal | What it is for |
|---|---|---|
| Student | Student (web and Android app) | apply for a Bed, pay, see the Room, make requests, register Family Day guests, ask the AI assistant |
| Staff | Staff portal, scoped to their Block | the desk (check-in, check-out, visitors), meter readings, maintenance, inspections, Room changes, door codes, furniture |
| Manager | Manager portal, every Block | registration periods, review and assignment, payment confirmations, the Term transition, finance, Staff and their weekly schedule, reports |
| Admin | Admin console | Terms and their wizard, prices and rules, notifications, Buildings, users, Audit Log, demo data |

![Student home](../../../docs/Screenshots/home-student.png)

![Staff portal: today's work](../../../docs/Screenshots/home-staff.png)

![Manager portal: dormitory overview](../../../docs/Screenshots/home-manager.png)

![Admin console: system overview](../../../docs/Screenshots/home-admin.png)

The Android app has the student screens of the web: Home, Registration, My Room, Payments, Requests, Family Day, notifications and the assistant.

### 3.2 Registration, payment and assignment

![Activity: registration](../../../docs/Diagrams/09_Activity/act-01-registration.png)

1. **Student › Registration › Start application.** Choose the Term, the Room Type and the Room Tier (the price per Bed is shown), invite a roommate for a 2-bed Room, check the personal information and submit. The system checks eligibility and issues the Deposit Invoice.

![Student: choosing the Room Type and Tier](../../../docs/Screenshots/w1-student-apply-room.png)

2. **Student › Payments.** Open the Deposit Invoice, transfer the amount with the VietQR code and its transfer content, then press *I have transferred*. The Application is submitted when a Manager confirms the money.

![Student: Payments](../../../docs/Screenshots/w1-student-invoices.png)

3. **Manager › Payments › Payment confirmations.** Find each claim on the bank statement by amount and transfer content, then confirm or reject it (a rejected claim asks the student to pay again).

![Manager: payment confirmations](../../../docs/Screenshots/w1-manager-payment-claims.png)

4. **Manager › Applications.** Review the submitted Applications and approve or reject them, one by one or selected together.

![Manager: Applications](../../../docs/Screenshots/w1-manager-applications.png)

5. **Manager › Assignment.** Start a run: the engine proposes a Room and Bed for every approved Application under the rules shown on the right; resolve conflicts, then commit. Students get their Allocation and the Balance Invoice; those without a Bed are waitlisted for Round 2.

![Manager: assignment run](../../../docs/Screenshots/w1-manager-assignment.png)

### 3.3 Opening a Term

![Activity: Term opening](../../../docs/Diagrams/09_Activity/act-02-term-opening.png)

1. **Manager › Period requests › Request a registration period.** Give the dates, the Blocks and Rooms, and the prices wanted. The request goes to the Admins; it can be changed and sent again if they ask.

![Manager: registration-period requests](../../../docs/Screenshots/w2-manager-term-requests.png)

2. **Admin › Prices and fees.** Confirm the default prices, the Deposit and the Utility settings that new Terms start from.

![Admin: Deposit settings](../../../docs/Screenshots/w2-admin-fees.png)

3. **Admin › Terms › New term.** Build the Term from the request in seven steps (general, timeline, Rooms and places, prices, rules, information, review and publish). The draft is saved after each step; the timeline must follow the milestone rules. Publishing fixes the prices and rules of the Term and announces it to students.

![Admin: the Term wizard](../../../docs/Screenshots/w2-admin-term-wizard.png)

### 3.4 Term transition (staying, moving or leaving)

![Activity: Term transition](../../../docs/Diagrams/09_Activity/act-03-term-transition.png)

1. When the requests window opens (milestone M2), every resident who is not leaving keeps the same Bed for the next Term.
2. **Student › Requests** (and Registration). Ask to extend or end the stay, change Room or swap before filing closes (M3).

![Student: Requests](../../../docs/Screenshots/w3-student-requests.png)

3. **Manager › Term transition.** Follow the milestones and decide the open requests in one list.

![Manager: Term transition](../../../docs/Screenshots/w3-manager-next-term.png)

4. **Manager › Reconciliation.** Upload the enrolled list of the next Term and resolve each difference (left the university, not on the list, back, changed status).

![Manager: Reconciliation](../../../docs/Screenshots/w3-manager-reconciliation.png)

5. **Manager › Next-term fees.** Once the list is reconciled, issue the next-Term fees. A fee not paid by M7 cancels the next-Term Allocation and releases the Bed. The turnover week then runs the meter cuts, check-outs and check-ins (section 3.7).

### 3.5 Maintenance

![Activity: maintenance](../../../docs/Diagrams/09_Activity/act-04-maintenance.png)

1. **Student › Requests › New maintenance request.** The location comes from the student's Allocation; choose the category and place in the Room, optionally the furniture item, write a title and a description, add photos and submit.

![Student: new maintenance request](../../../docs/Screenshots/w4-student-maintenance-new.png)

2. The routing rule of the Block assigns the request to a Staff member and sets the SLA due time. **Staff › Maintenance**: set it In progress, then Resolved; unassigned requests are taken from the Block queue.

![Staff: maintenance list](../../../docs/Screenshots/w4-staff-maintenance.png)

3. **Manager › Overdue requests.** A request past its time limit is escalated; reassign it or add a note.

![Manager: overdue requests](../../../docs/Screenshots/w4-manager-escalations.png)

4. The student confirms the fix (Closed) or reopens the request.

### 3.6 Utility billing

![Activity: utility billing](../../../docs/Diagrams/09_Activity/act-05-utility-billing.png)

1. **Staff › Meter readings.** Type each Room's electricity and water readings of the month, or download the template and import it (XLSX or CSV). Unusual values are flagged for a check.

![Staff: meter readings](../../../docs/Screenshots/w5-staff-meter-readings.png)

2. Confirm the readings and **Close period and bill**: each Room's use is split by days and residents and the Utility Invoices are issued.
3. **Student › Payments.** Pay the Utility Invoice; unpaid ones lead to warnings and, at the last level, to termination.

![Student: a utility debt warning](../../../docs/Screenshots/w5-student-utility-invoices.png)

4. **Manager › Payments › Collections and refunds.** Follow what was invoiced, collected and overdue, and approve refunds.

![Manager: collections and refunds](../../../docs/Screenshots/w5-manager-finance.png)

### 3.7 Check-in and check-out

![Activity: check-in and check-out](../../../docs/Diagrams/09_Activity/act-06-check-in-out.png)

1. **Student › My room › Check-in inventory.** Once the Balance is paid and the check-in period has started, *Start check-in inventory* gives the door code; record the condition of each item and the meters.

![Student: check-in inventory](../../../docs/Screenshots/w6-student-check-in-inventory.png)

2. **Staff › Check-in inventories.** Review the reports that differ from the Room's record, visit the Room when needed and make the report final.

![Staff: check-in inventories](../../../docs/Screenshots/w6-staff-check-in-inventories.png)

3. **Staff › Check-out.** At the end of the stay, record the final meter readings and each item's condition, and any damage. The student agrees to the charges or a Manager decides; the Utility Deposit is refunded less the charges.

![Staff: check-out desk](../../../docs/Screenshots/w6-staff-check-out.png)

### 3.8 Family Day

![Activity: Family Day](../../../docs/Diagrams/09_Activity/act-07-family-day.png)

1. **Manager › Family Days › New Family Day.** Choose the Block, the date, the time slots and their places, and publish it.

![Manager: Family Days](../../../docs/Screenshots/w7-manager-family-days.png)

2. **Student › Family Day.** Register guests for a time slot while places are left; each guest gets a pass.

![Student: Family Days](../../../docs/Screenshots/w7-student-family-days.png)

3. **Staff › Family Days › Desk.** Scan the pass, check the guest's identity and check them in; at the end check them out. A guest still inside after the slot is reminded to the student, who confirms the guest is safe.

### 3.9 The Staff week

![Activity: the Staff week](../../../docs/Diagrams/09_Activity/act-08-staff-week.png)

1. **Manager › Staff › Work schedule.** On the reminder day set by the Admin, plan next week's shifts for each person (or copy the week before) and send the schedule.

![Manager: work schedule](../../../docs/Screenshots/w8-manager-staff-schedule.png)

2. **Manager › Staff and workload.** See who is on duty, their open work by kind and what is overdue; reassign work or plan the next week.

![Manager: Staff and workload](../../../docs/Screenshots/w8-manager-staff.png)

3. **Staff › My schedule.** See this week's and next week's shifts. A change made outside the shift, or in a kind of work not assigned, asks for a confirmation and is recorded for the Managers.

![Staff: my schedule](../../../docs/Screenshots/w8-staff-schedule.png)
