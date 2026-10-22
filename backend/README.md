# CampusStay FPT — backend

REST API for the CampusStay FPT dormitory system: one Spring Boot 4.1 application (layered Spring MVC) on PostgreSQL 17. Design: `docs/backend/01_Backend_Architecture.md`.

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
3. Run `CampusStayApplication` (profile `dev` is the default). Flyway creates the schema and loads the base data (see below).
4. Check: `curl http://localhost:8080/api/actuator/health` → `{"status":"UP"}`.
5. Sign in:
   ```bash
   curl -s -X POST http://localhost:8080/api/auth/sign-in \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@fpt.edu.vn","password":"12321321","remember":false}'
   ```
6. Web app: in `web/`, keep `VITE_API_PROXY_TARGET=http://localhost:8080` and run `npm run dev`. The Vite proxy forwards `/api`.

### Base data
The `dev` profile loads `db/seed/R__dev_seed.sql`: a fresh system that is ready to sign in and has nothing else. It holds 8 Blocks (A–D male, E–H female; 10 floors each, 960 Rooms, 3,680 Beds), the Room Types and Room Classes, the back-office accounts and 6,200 students in the student directory (cohorts K18–K22, all enrolled). There is no Term, Application, Invoice, request or report data: start as `admin` by confirming the fees (Admin › Fees) and publishing a Term (Admin › Terms). Until then the dashboards show empty figures, the Blocks and the Admin's setup checklist; the reports answer "No Term is published yet."

- **Password** of every account: `12321321`.
- **Emails** use the FPT format: `<account>@fpt.edu.vn` for staff, `<student code>@fpt.edu.vn` for students (`se190001@fpt.edu.vn`). In `dev` every email stops in Mailpit.
- **Codes:** `SE` (software, AI, security), `SS` (business, media, languages) or `SA` (design) + cohort + number, numbered from `0001` in each group: `se190001`, `ss220001`, `sa180001` …; about 58 % of the students are male.
- The file is idempotent: a newer version adds what is missing. To start from scratch, recreate the database: `docker compose -f infra/docker-compose.yml down -v` and `up -d db mail` (**deletes all local data**), or in psql `DROP DATABASE campusstay WITH (FORCE); CREATE DATABASE campusstay OWNER campusstay;`.
- Integration tests use a small seed of their own (`src/test/resources/db/test-seed`, accounts `@campusstay.test`, password `CampusStay@2026`).

| Role | Account (before `@fpt.edu.vn`) | Scope |
|---|---|---|
| Admin | `admin` | all Blocks |
| Manager | `manager.a` … `manager.h` | one Block each |
| Staff | `staff.a1`, `staff.a2` … `staff.h1`, `staff.h2` (two per Block; the Manager sets what each handles in Block staff) | their Block |
| Student | the student code in lower case, e.g. `se190001`, `ss220001` | own data |

### Google sign-in (optional)
1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type *Web application*; add `http://localhost:5173` as an authorized JavaScript origin.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for the backend (environment variables, never in a committed file), and `VITE_GOOGLE_CLIENT_ID` for the web app. The web popup sends an authorization code that the backend exchanges with the secret (`redirect_uri=postmessage`, no redirect URI to register); Android sends an ID token and needs only the client id. Without the secret the web button answers `503 GOOGLE_SIGN_IN_DISABLED`.
3. Link a base-data account to your Google account by giving it your own FPT email, e.g. in psql:
   `UPDATE auth_user SET email = '<you>@fpt.edu.vn' WHERE email = 'se190001@fpt.edu.vn';`
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
Staff approve Applications (`/applications`), start a run (`POST /assignment-runs`), resolve conflicts per Block and send the Block to its Manager (`commit`); the Manager approves it, which creates the Allocations, Balance Invoices and "Your room is ready" notifications. To try it locally: publish a Term as `admin`, apply as a few students of one gender (`se190001` …) and pay with the dev simulation, approve them as `staff.a1` (Block A, male students) and start a run.

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
- **Routing rules (Block Manager):** new Maintenance Requests (by category, then All) and Room-Change Requests go to the rule's assignee while on duty, else its fallback. Without a matching rule a request waits unassigned until Staff pick it up (the base data has no rules).
- **Escalations:** every 15 minutes (`campusstay.req.sla-interval`) requests past the Block's timers, still unassigned or reopened appear on Manager › Escalations; the Manager reassigns them (the new owner is notified) or offers a temporary Bed for a room change.
- **Block staff and settings:** the Manager sets what each person handles and who is on duty, asks Admin for new accounts, and edits desk, visitor and quiet hours within Admin › System parameters (`block.*`, `sla.*`).

### Inspections, messages, dashboards and reports (S7)
- **Inspections:** Admin › Inspection checklists versions each checklist (the base data has none yet). A Block Manager's schedule starts its first run at once and the next ones at 06:00 (`campusstay.mnt.inspection-cron`); Staff record each Room, and a failed item becomes a Maintenance Request with the item's category and a priority from its severity.
- **Messages:** Admin › Notification templates edits the in-app and push texts (test sends go to the Admin). Admin › Send email reaches one student or a group of the Term (residents, not checked in, unpaid, waitlisted, applicants); emails go through the outbox at the chosen time.
- **Dashboards and reports** read only the reporting views (`rpt_v_*`, migrations V23–V31); a Term that has ended still counts the students who lived there until check-out. **Exports** (`/api/exports/{report}`) are CSV files with the screen's filters; each one is written to the Audit Log.

## Tests
```bash
mvn test      # unit tests + LayeringTest (calls go controller → service → repository)
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
Layered Spring MVC (ADR-17): calls go `controller` → `service` → `repository` / `entity`.
```
src/main/java/vn/fpt/campusstay/
  controller/<feature>/   REST controllers and their request/response records
  service/<feature>/      business rules, SQL (JdbcClient), interfaces other features call, jobs, listeners, exports
  repository/             Spring Data JPA repositories; repository/<feature>/ SQL stores
  entity/                 JPA entities (users, sessions, tokens, Terms, Room Types, Room Classes)
  dto/                    shared records (ListResponse, PageQuery, TermSummary)
  event/                  domain events (ApplicationSubmitted, PaymentConfirmed …)
  config/                 Spring configuration and properties (clock, mail, push, payment, auth)
  security/               SecurityConfig, bearer token filter, CurrentUser, BlockScope, Role, Permission
  exception/              ApiException, error model, GlobalExceptionHandler
  common/                 audit log, CSV export contract, file store and signed links
src/main/resources/db/migration/   Flyway schema V1–V31
src/main/resources/db/seed/        base data: accounts and Buildings (dev profile; prod only on purpose)
src/test/resources/db/test-seed/   small fixed data of the integration tests
```

| Feature | Table prefix | What it covers (slices) |
|---|---|---|
| `auth` | `auth_` | sign-in, sessions, users, roles, Block scope, Audit Log, staff (S0, S1, S6) |
| `setting` | `cfg_` | Terms, Room Types/Classes, fees, utility, parameters, Block settings (S0, S1, S6) |
| `inventory` | `inv_` | Buildings, Floors, Rooms, Beds, out-of-service, bulk Rooms (S1, S7) |
| `application` | `app_` | Application wizard, roommate pairs, Home, profile, review, Round 2 (S2, S3, S5) |
| `assignment` | `asg_` | assignment engine, runs, approval, Allocations, My Room, desk, late check-ins (S3–S5) |
| `billing` | `bil_` | Invoices, VietQR, SePay webhook, receipts, payments, refunds, meters (S2–S6) |
| `request` | `req_` | Room-Change Requests, swaps, routing rules, escalations (S4–S6) |
| `maintenance` | `mnt_` | Maintenance Requests, photos, updates, inspections (S4, S6, S7) |
| `notification` | `ntf_` | notifications, push (FCM), devices, email outbox, templates, campaigns (S0–S4, S7) |
| `report` | (`rpt_v_*` views) | dashboards, reports, CSV exports (S7) |
