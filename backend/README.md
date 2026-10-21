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
3. Run `CampusStayApplication` (profile `dev` is the default). Flyway creates the schema and loads the demo seed.
4. Check: `curl http://localhost:8080/api/actuator/health` → `{"status":"UP"}`.
5. Sign in:
   ```bash
   curl -s -X POST http://localhost:8080/api/auth/sign-in \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@campusstay.test","password":"CampusStay@2026","remember":false}'
   ```
6. Web app: in `web/`, keep `VITE_API_PROXY_TARGET=http://localhost:8080` and run `npm run dev`. The Vite proxy forwards `/api`.

### Seed accounts (password `CampusStay@2026`)
| Role | Email | Scope |
|---|---|---|
| Admin | admin@campusstay.test | all Blocks |
| Manager | manager.a@campusstay.test / manager.b@campusstay.test | Block A / Block B |
| Staff | staff.a1, staff.a2 (Block A), staff.b1 (Block B), staff.ab (A + B) `@campusstay.test` | as listed |
| Student | se190001 … se190048 `@student.campusstay.test` (001–024 male, 025–048 female) | own data |

### Google sign-in (optional)
1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type *Web application*; add `http://localhost:5173` as an authorized JavaScript origin.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for the backend (environment variables, never in a committed file), and `VITE_GOOGLE_CLIENT_ID` for the web app. The web popup sends an authorization code that the backend exchanges with the secret (`redirect_uri=postmessage`, no redirect URI to register); Android sends an ID token and needs only the client id. Without the secret the web button answers `503 GOOGLE_SIGN_IN_DISABLED`.
3. Link a seed account to your Google account by giving it your FPT email, e.g. in psql:
   `UPDATE auth_user SET email = '<you>@fpt.edu.vn' WHERE email = 'se190001@student.campusstay.test';`
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
Staff approve Applications (`/applications`), start a run (`POST /assignment-runs`), resolve conflicts per Block and send the Block to its Manager (`commit`); the Manager approves it, which creates the Allocations, Balance Invoices and "Your room is ready" notifications. To try it locally with the seed: apply as a few students of one gender, pay with the dev simulation, approve them as `staff.a1` (Block A, male students) and run.

### Desk, maintenance and push (S4)
- **Check-in** needs the Balance paid (it includes the Utility Deposit) and today inside the Term's check-in window. The desk looks students up by code, name or the pass `CSTAY-PASS:<allocationId>` shown in the mobile app.
- **Check-out** records the final meter reading; the Utility Deposit is settled against the Room's consumption since its last reading, and a refund waits for the Block Manager.
- **Photos and receipts** open through short-lived signed links (`/api/files/{id}?exp&sig`). Set `FILES_LINK_SECRET` in production so links survive a restart.
- **Push:** set `FIREBASE_CREDENTIALS_FILE` to a Firebase service account key (JSON). Without it only in-app notifications are written.

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
  shared/   error model, paging, audit log, clock, tokens, file store and signed links (open module)
  auth/     sign-in, sessions, users, roles, Block scope, Audit Log screen   (S0, S1)
  cfg/      Terms, Room Types/Classes, fees, eligibility, matching, parameters (S0, S1)
  inv/      Buildings, Floors, Rooms, Beds, out-of-service, bulk Rooms      (S1)
  ntf/      in-app notifications, push (FCM), devices, email outbox          (S0–S4)
  app/      Application wizard, roommate pairs, Home, profile, review       (S2, S3)
  bil/      Invoices, VietQR, SePay webhook, receipts, Staff payments       (S2, S3)
  asg/      assignment engine, runs, approval, Allocations, My Room, desk  (S3, S4)
  mnt/      Maintenance Requests, photos, updates                          (S4)
  req/      the student's requests screen (room changes from S5)          (S4)
  rpt/      (S7)
src/main/resources/db/migration/   Flyway schema V1–V15
src/main/resources/db/seed/        demo data (dev/test only)
```
