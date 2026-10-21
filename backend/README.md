# CampusStay FPT — backend

REST API for the CampusStay FPT dormitory system: one Spring Boot 4.1 application (modular monolith) on PostgreSQL 17. Design: `docs/backend/01_Backend_Architecture.md`.

## Requirements
| Tool | Version |
|---|---|
| JDK | 21 (Temurin recommended) |
| Maven | 3.9+ (IntelliJ's bundled Maven works) |
| Docker Desktop | any recent version (Postgres, Mailpit, integration tests) |

## Run locally (IntelliJ)
1. From the repo root start the dependencies:
   ```bash
   docker compose -f infra/docker-compose.yml up -d db mail
   ```
   Check: `docker compose -f infra/docker-compose.yml ps` shows `db` as healthy.
2. Open `backend/` in IntelliJ as a Maven project, JDK 21.
3. Run `CampusStayApplication` (profile `dev` is the default). Flyway creates the schema and loads the demo data (see below; about 2 minutes on the first start).
4. Check: `curl http://localhost:8080/api/actuator/health` → `{"status":"UP"}`.
5. Sign in:
   ```bash
   curl -s -X POST http://localhost:8080/api/auth/sign-in \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@example.com","password":"CampusStay@2026","remember":false}'
   ```
6. Web app: in `web/`, keep `VITE_API_PROXY_TARGET=http://localhost:8080` and run `npm run dev`. The Vite proxy forwards `/api`.

### Demo data
On an empty database the `dev` profile loads `db/seed/R__dev_seed.sql`: four years of operation with three Terms a year (Fall 2022 … Spring 2027, 14 Terms), 8 Blocks (A–D male, E–H female; 10 floors each, 960 Rooms, 3,680 Beds) and 6,200 students of cohorts K17–K22, 5,004 of them still active. Fall 2026 is in progress with 60 % of the Beds taken; Spring 2027 is open for registration. Every past Term carries its history (Applications, assignment runs, Allocations, check-ins and check-outs, Invoices and payments, monthly meter readings and Utility Invoices, room changes, swaps, refunds, Maintenance Requests, inspections, escalations, emails), so each report and export works on any Term.

- **Password** of every account: `CampusStay@2026`.
- **Emails** are `<account>@example.com` and never delivered. To receive the demo emails, set `SEED_MAILBOX` to your Gmail name before the first start (run configuration or environment variable, never a committed file): `SEED_MAILBOX=yourname` gives `yourname+admin@gmail.com`, `yourname+se210025@gmail.com` …, all delivered to your inbox (in `dev` mail stops in Mailpit anyway).
- **Load once:** the demo data needs an empty database; a database with other data stops the start with a message. To start over, recreate it: `docker compose -f infra/docker-compose.yml down -v` and `up -d db mail` (**deletes all local data**), or in psql `DROP DATABASE campusstay WITH (FORCE); CREATE DATABASE campusstay OWNER campusstay;`.
- Integration tests use a small seed of their own (`src/test/resources/db/test-seed`, accounts `@campusstay.test`).

| Role | Account (before `@example.com`) | Scope |
|---|---|---|
| Admin | `admin`, `admin.finance` | all Blocks |
| Manager | `manager.a` … `manager.h` | one Block each |
| Staff, desk | `staff.a1` … `staff.h1` (`staff.g1` off duty) | their Block |
| Staff, technician | `staff.a2` … `staff.h2` (`staff.b2` off duty) | their Block |
| Staff, finance | `finance.1` (A–D), `finance.2` (E–H) | those Blocks |
| Former staff | `staff.former` | disabled, cannot sign in |
| Student | the student code in lower case: `se210025` (lives in A-401), `se210004` (E-402), `se210136` (allocated, not checked in), `se221011` (an Overdue Invoice), `se220116` (Spring 2027 Application awaiting its Deposit), `se220001` (no Application yet) | own data |

### Google sign-in (optional)
1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type *Web application*; add `http://localhost:5173` as an authorized JavaScript origin.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for the backend (environment variables, never in a committed file), and `VITE_GOOGLE_CLIENT_ID` for the web app. The web popup sends an authorization code that the backend exchanges with the secret (`redirect_uri=postmessage`, no redirect URI to register); Android sends an ID token and needs only the client id. Without the secret the web button answers `503 GOOGLE_SIGN_IN_DISABLED`.
3. Link a demo account to your Google account by giving it your FPT email, e.g. in psql:
   `UPDATE auth_user SET email = '<you>@fpt.edu.vn' WHERE id = (SELECT user_id FROM auth_student WHERE student_code = 'SE210025');`
Only `@fpt.edu.vn` Workspace accounts (`hd` claim) are accepted, and only for accounts that already exist.

### Payments (VietQR and SePay)
The payment page shows a VietQR image for the receiving account set in `PAYMENT_BANK_NAME`, `PAYMENT_BANK_CODE` (bank short name of SePay's QR service, e.g. `MBBank`), `PAYMENT_ACCOUNT_NUMBER` and `PAYMENT_ACCOUNT_NAME` (see `infra/.env.example`). Every Invoice has a transfer content `CSTAY` + its id; set the same prefix as the payment-code prefix in SePay.
- **Real bank feed:** in SePay add a webhook to `https://<public host>/api/webhooks/sepay` with API-key authentication and set the same key in `SEPAY_WEBHOOK_API_KEY`. Blank key = webhook off (`503`).
- **Without a bank (dev profile only):** pay an Invoice as if SePay had reported it, signed in as its student or as the Admin:
  ```bash
  curl -X POST http://localhost:8080/api/dev/invoices/INV-SP27-000001/simulate-payment -H "Authorization: Bearer <token>"
  ```
- **Manual confirmation (Staff › Payments):** a transfer the feed could not match is confirmed by hand with the bank reference and an optional receipt (JPEG, PNG or PDF). Receipts are stored under `FILES_DIR` (default `data/files`, git-ignored); back that folder up with the database. Admin › Fees can turn manual confirmation off.

### Assignment (S3)
Staff approve Applications (`/applications`), start a run (`POST /assignment-runs`), resolve conflicts per Block and send the Block to its Manager (`commit`); the Manager approves it, which creates the Allocations, Balance Invoices and "Your room is ready" notifications. To try it with the demo data: approve some Spring 2027 Applications as `staff.a1` (Block A, male students), or apply as a student and pay with the dev simulation, then start a run.

### Desk, maintenance and push (S4)
- **Check-in** needs the Balance paid (it includes the Utility Deposit) and today inside the Term's check-in window. The desk looks students up by code, name or the pass `CSTAY-PASS:<allocationId>` shown in the mobile app.
- **Check-out** records the final meter reading; the Utility Deposit is settled against the Room's consumption since its last reading, and a refund waits for the Block Manager.
- **Photos and receipts** open through short-lived signed links (`/api/files/{id}?exp&sig`). Set `FILES_LINK_SECRET` in production so links survive a restart.
- **Push:** set `FIREBASE_CREDENTIALS_FILE` to a Firebase service account key (JSON). Without it only in-app notifications are written.

### Changes during the stay (S5)
- **Room changes and swaps:** a checked-in student asks for another Room or proposes a swap (directly by student code or on the anonymous swap board). Staff of the Block decide; a swap between Blocks also needs the Block Manager. The price difference for the days left is invoiced or refunded.
- **Round 2:** when the Block Manager approves a Block, Waitlisted students get held Room options; declining or not answering cancels the Application and refunds the Deposit after approval.
- **Late check-ins** are recorded at the desk and decided by the Block Manager. **Refunds** wait for the Block Manager. Every hour unpaid Invoices past due become Overdue; the Manager can send reminders (in-app, push, email).

### Utility billing, routing and Block management (S6)
- **Meter readings (Staff › Meter readings):** each Block gets one period per calendar month, opened on first visit. Enter or import (CSV `room,electricity,water`) the readings of every Room someone lived in; values more than three times the Room's last month are flagged and must be confirmed. Closing the month issues one Utility Invoice per resident, split by time in the Room between meter cuts; students who checked out already settled from their Utility Deposit. Prices and rounding: Admin › Utility.
- **Routing rules (Block Manager):** new Maintenance Requests (by category, then All) and Room-Change Requests go to the rule's assignee while on duty, else its fallback. Without a matching rule a request waits unassigned until Staff pick it up (every Block has rules in the demo data).
- **Escalations:** every 15 minutes (`campusstay.req.sla-interval`) requests past the Block's timers, still unassigned or reopened appear on Manager › Escalations; the Manager reassigns them (the new owner is notified) or offers a temporary Bed for a room change.
- **Block staff and settings:** the Manager sets what each person handles and who is on duty, asks Admin for new accounts, and edits desk, visitor and quiet hours within Admin › System parameters (`block.*`, `sla.*`).

### Inspections, messages, dashboards and reports (S7)
- **Inspections:** Admin › Inspection checklists versions each checklist (the demo data has "Room safety check" v2, "Air-conditioner check" and an archived "Fire extinguisher walk"). A Block Manager's schedule starts its first run at once and the next ones at 06:00 (`campusstay.mnt.inspection-cron`); Staff record each Room, and a failed item becomes a Maintenance Request with the item's category and a priority from its severity.
- **Messages:** Admin › Notification templates edits the in-app and push texts (test sends go to the Admin). Admin › Send email reaches one student or a group of the Term (residents, not checked in, unpaid, waitlisted, applicants); emails go through the outbox at the chosen time.
- **Dashboards and reports** read only the reporting views (`rpt_v_*`, migrations V23–V31); a Term that has ended still counts the students who lived there until check-out. **Exports** (`/api/exports/{report}`) are CSV files with the screen's filters; each one is written to the Audit Log.

## Tests
```bash
mvn test      # unit tests + ModularityTests (module boundaries; diagrams in target/spring-modulith-docs)
mvn verify    # + integration tests (*IT) on a Testcontainers PostgreSQL 17 — Docker must be running
```

## Common errors
| Symptom | Cause | Fix |
|---|---|---|
| `Connection refused` to 5432 on start | Postgres container not running | `docker compose -f infra/docker-compose.yml up -d db` |
| `FlywayValidateException: Validate failed … checksum mismatch` | An applied migration file was edited | Never edit applied files; add a new `V<n>__…sql`. Dev only: drop the volume (`docker compose -f infra/docker-compose.yml down -v`) — **deletes all local data** |
| `Detected resolved migration not applied` | Branches added migrations with lower numbers | Renumber the new file above the highest applied version |
| `Could not find a valid Docker environment` in `mvn verify` | Docker Desktop not running | Start Docker, rerun |
| Emails never arrive | Mailpit not running (dev) or `spring.mail.host` unset (logs say "written to the log") | Start `mail` service; check http://localhost:8025 |
| `401` on every call from the web app | Token missing or session expired / revoked | Sign in again; check the `Authorization: Bearer` header in DevTools |

## Layout
```
src/main/java/vn/fpt/campusstay/
  shared/   error model, paging, audit log, clock, tokens, file store and signed links, exports (open module)
  auth/     sign-in, sessions, users, roles, Block scope, Audit Log, staff   (S0, S1, S6)
  cfg/      Terms, Room Types/Classes, fees, utility, parameters, Block settings (S0, S1, S6)
  inv/      Buildings, Floors, Rooms, Beds, out-of-service, bulk Rooms      (S1, S7 export)
  ntf/      notifications, push (FCM), devices, email outbox, templates, campaigns (S0–S4, S7)
  app/      Application wizard, roommate pairs, Home, profile, review       (S2, S3)
  bil/      Invoices, VietQR, SePay webhook, receipts, payments, meters     (S2, S3, S5, S6)
  asg/      assignment engine, runs, approval, Allocations, My Room, desk  (S3, S4)
  mnt/      Maintenance Requests, photos, updates, inspections             (S4, S6, S7)
  req/      Room-Change Requests, swaps, routing rules, escalations        (S4–S6)
  rpt/      dashboards, reports, CSV exports (reads rpt_v_* views only)   (S7)
src/main/resources/db/migration/   Flyway schema V1–V31
src/main/resources/db/seed/        demo data (dev profile; prod only on purpose)
src/test/resources/db/test-seed/   small fixed data of the integration tests
```
