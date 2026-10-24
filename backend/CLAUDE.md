# CLAUDE.md — CampusStay FPT backend

Instructions for Claude Code working in `backend/` (IntelliJ IDEA). Paths below are relative to the repository root. Read this file, then `docs/backend/01_Backend_Architecture.md` before changing code. Scope and decisions: `docs/00_Project_Brief.md`. Endpoint shapes: `docs/api-contract.md` + `docs/backend/03_API_Contract_Changes.md`. Progress: `docs/backend/02_Endpoint_Map.md`.

## Stack
Java 21 · Spring Boot 4.1.x (Spring Framework 7, Spring Security 7, Hibernate 7, Jackson 3) · Maven · PostgreSQL 17 · Flyway · JUnit 5 + Testcontainers. Layered Spring MVC (ADR-17).

## Commands
```bash
docker compose -f infra/docker-compose.yml up -d db mail   # Postgres + Mailpit
mvn spring-boot:run                                         # profile dev, http://localhost:8080/api
mvn test                                                    # unit tests + LayeringTest
mvn verify                                                  # + *IT integration tests (Docker required)
```
`mvn verify` must pass before every commit. A push to `main` deploys to production by itself; how to finish and ship a change is in the root `CLAUDE.md` ("Standing rule"). Mail inbox: http://localhost:8025. Dev base data (`db/seed`): accounts `admin@fpt.edu.vn`, `manager.a@fpt.edu.vn`, `staff.a1@fpt.edu.vn`, students `se190001@fpt.edu.vn`, password `12321321`; no Term or history (backend/README.md, "Base data"). Test seed: `@campusstay.test`, password `CampusStay@2026`.

## Spring Boot 4 / Jackson 3 notes (R-11 closed 20/10/2026: the build and `mvn verify` pass)
- Spring Boot 4 test packages: `org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc`, `org.springframework.boot.testcontainers.service.connection.ServiceConnection`.
- Testcontainers 2: `org.testcontainers.postgresql.PostgreSQLContainer`, artifacts `testcontainers-postgresql`, `testcontainers-junit-jupiter`.
- Jackson 3: `tools.jackson.databind.json.JsonMapper` (AuditLog); annotations stay `com.fasterxml.jackson.annotation`.
- Jackson 3 rejects a missing or `null` primitive in a request body (`400 BAD_REQUEST_BODY`). Optional request fields use wrapper types (`Boolean remember`); do not turn the check off globally.
- Jackson 3 binds both `"42"` and `42` to a `long` request field, so request records may keep IDs as `long`.
- Outbound HTTP: `RestClient.builder()` directly (Boot 4 has no `RestClient.Builder` bean without the restclient starter); tests bind it to `MockRestServiceServer` (see `GoogleCodeExchangerTest`).
When something does not compile, check the real API (do not guess); keep the design unchanged.

## Layer rules (architecture §5; `LayeringTest` checks the first)
- Packages under `vn.fpt.campusstay`: `controller/<feature>`, `service/<feature>`, `repository` (JPA) and `repository/<feature>` (SQL stores), `entity`, `dto`, `event`, `config`, `security`, `exception`, `common`. Features: `auth`, `setting`, `inventory`, `application`, `assignment`, `billing`, `request`, `maintenance`, `notification`, `report`; their codes (AUTH, CFG, INV, APP, ASG, BIL, REQ, MNT, NTF, RPT) remain the table prefixes and test ids.
- Calls go one way: controller → service → repository / entity. Controllers never use `JdbcClient`, repositories or entities; nothing below the controllers imports them.
- A table is written only by the services of the feature that owns its prefix (`bil_*` by billing). Another feature asks through that feature's interface (`Billing`, `Inventory`, `Moves`, `TermCatalog` …), adding a method there if needed, or listens to its events. Reports read only the `rpt_v_*` views, each defined by the owning feature in its migration.
- No Spring bean cycles: when feature A needs data of B while B already uses A, declare an interface in A and implement it in B (example: `service.auth.BlockDirectory` implemented by `service.inventory.JdbcBlockDirectory`).
- Side effects in other features = domain events (`record` in `event/`). Listeners that must commit with the change use `@EventListener` (same transaction); fire-and-forget ones use `@TransactionalEventListener(phase = AFTER_COMMIT)`.

## How to add an endpoint (one vertical slice)
1. Find it in `02_Endpoint_Map.md` and the contract; match request/response field names exactly.
2. Schema change? Add a new Flyway file `V<next>__<code>_<what>.sql` (`code` = the feature's table prefix, e.g. `bil`). Never edit an applied migration. Tests need data: add it to `src/test/resources/db/test-seed/R__test_seed.sql` (keep it idempotent). The dev base data `db/seed/R__dev_seed.sql` holds only accounts and Buildings; keep it that way (no Terms or history) and idempotent.
3. Write the service in `service/<feature>` with `@Transactional` (SQL through `JdbcClient`, or a store in `repository/<feature>`); controller in `controller/<feature>` (package-private class, records for request/response, Bean Validation messages written for users). Shared records go to `dto`, events to `event`.
4. Authorization: role (URL rule or `currentUser.require(...)`), then scope: `blockScope.resolve(block)` for Staff/Manager; filter by `currentUser.id()` for students. A student asking for someone else's record gets 404, not 403.
5. Errors: throw `ApiException` with a stable `code` (UPPER_SNAKE) and a user-facing `message`. Add new constraint names to `ConstraintMessages`.
6. Audit: `auditLog.record(...)` inside the transaction for every state change made by Staff/Manager/Admin and every export.
7. Tests: an `*IT` class per controller covering happy path, validation, permission/scope and the main business rule; name each test with its own `TC-<CODE>-NNN` id in the Javadoc (the next free number of that code: one id, one test), then run `node docs/tools/generate-catalogs.mjs` from the repository root and commit `docs/backend/04_Test_Catalog.md` with the change.
8. Update `02_Endpoint_Map.md` status (Planned → Coded → Verified) in the same commit.

## Conventions
- Statuses: DB `UPPER_SNAKE`; enums expose `@JsonValue` labels exactly as the contract (`Awaiting Deposit`, `Awaiting confirmation`, `In progress`).
- IDs: `long` in Java and `BIGINT` in the DB, but **JSON strings** (ADR-15, contract change B-03): every `id` / `…Id` component of a contract response record is a `String`. Request bodies may send `"42"` or `42`. Never add a global `Long` → string serializer (money is `long` too). Money: `long` VND, never `double`. Rates: `BigDecimal` fractions. Times: `Instant` (UTC) for fields ending in `At`; calendar days: `LocalDate` (`YYYY-MM-DD`). "Today" uses `TimeConfig.CAMPUS_ZONE`. Inject `Clock`, never call `Instant.now()` without it in services.
- No hard-coded business values (prices, percentages, windows, limits): read CFG (`cfg_*` tables, `cfg_parameter`).
- Lists: `PageQuery.of(page, pageSize)`, return `{ items, total, ... }`.
- Concurrency: check rules first, then rely on the DB constraint; lock Beds with `SELECT … FOR UPDATE` when moving students; `@Version` on aggregates.
- Glossary (exact words): Term, Building (Block), Floor, Room, Room Type, Room Class, Bed, Application, Allocation, Roommate Request, Room-Change Request, Maintenance Request, Invoice, Payment, Check-in, Check-out.
- Code, comments, commit messages and docs in English. Commit format: `feat(app): submit Application with Deposit Invoice`.

## Security must-nots
- Never log tokens, passwords, webhook keys or full request bodies with personal data.
- Never put personal data (student code, phone, email) in URL paths or log lines. Search values (`q`) may hold them, so never log query strings.
- Never trust `block`, `termId` or ids from the client without the scope check.
- Webhook keys: compare with `Tokens.constantTimeEquals`.

## Slice order
S0 done (AUTH session, `/terms`, Google code or ID token, string IDs, password reset/change). S1 done (Admin configuration, Buildings + bulk Rooms, Inventory, users + permission matrix + Audit Log, `/notifications`; contract clarifications C-15…C-18). S2 done (Application wizard, roommate pairs, Deposit Invoice, VietQR page, SePay webhook, receipt PDF, expiry job, in-app notifications; C-19, C-20, A-08). Application and Invoice ids are their codes. S3 done (review queue and decisions, assignment engine + runs + conflicts, Manager approval = commit with Allocations and Balance Invoices, My Room, Staff payments with manual confirmation and receipt files; C-21, C-22, A-09). Run ids are `RUN-<n>`. Applications and Deposits without a Bed are scoped by the student's gender (`Buildings.gendersOf`). S4 done (check-in/check-out desk with the Utility Deposit settlement, Maintenance Requests with photos, `/students/me/requests`, FCM device tokens and push after commit, signed file links; C-23…C-25, A-10, A-11). The Balance Invoice includes the Utility Deposit. Files are shown through `FileLinks` (never a bearer-only URL in `<img>`). S5 done (Room-Change Requests, swaps and the swap board with the Manager step across Blocks, Round-2 offers when a Block is approved, late check-ins recorded at the desk, refunds, overdue job and reminders, Block Finance; C-26…C-28, A-12). Students move between Beds only through ASG's `Moves`; price differences go through `Billing.issueCharge` / `requestCredit`. S6 done (meter periods and readings with CSV import, Utility Invoices split by time between meter cuts, Admin › Utility, routing rules and escalation timers, the SLA scan and escalations, Block staff with account requests, Block settings within the Admin limits; C-29…C-33, A-13). BIL splits a Room's meter through ASG's `RoomStays`; REQ routes Maintenance Requests on `MaintenanceReported` and assigns them through `MaintenanceRequests`; Block staff reads handle labels and workload through AUTH's ports `StaffHandles` (CFG) and `StaffWorkload` (MNT, REQ). Escalations are addressed by the request's code. S7 done (inspection checklists with versions, schedules and runs whose failed items become Maintenance Requests, notification templates, Admin emails to student groups, Staff/Manager/Admin dashboards and approval counts, occupancy, financial and Block reports, CSV exports of every screen; C-34…C-37, A-14). Reports read only the `rpt_v_*` views (V23–V31, one migration per owning feature); once a Term's stay is over its reports also count the Allocations ended by check-out (`ReportScope.held`); each feature exports its own screens by implementing `common.export.ReportExport`, and the report service writes the CSV and the Audit Log entry. Every endpoint of the map is coded. 22/10/2026: the packages were reorganised into layers (ADR-17, no behaviour change; the slice notes above use the former module codes), and the dev base data is a fresh system (accounts and Buildings only, `db/seed`); the tests keep the small `db/test-seed`. Next: manual end-to-end tests and the Google sign-in check with a real account.

Change Specification v2 (`docs/01_Change_Spec_v2.md`), phase 1 on `feat/v2-phase1` (24/10/2026): Managers work for every Block and do the review, the assignment commit and payment confirmations (ADR-19, V32; `security.Permission`); Staff stay Block-scoped (`STAFF_B2` in the tests). Two languages (ADR-25): `Accept-Language` + `LocalizedErrors` + `i18n/messages_vi.txt` for error messages, `auth_user.locale` (V33, `PUT /auth/me/locale`), notification templates and notifications in both languages (V34), texts that spoke of "the Block Manager" say "a Manager" (V35). A new user-facing error message needs its Vietnamese line in `messages_vi.txt` (`MessagesTest`).

## Tests
- Integration tests share one Spring context (and one Testcontainers database) per configuration. A class that changes shared reference data (Terms, prices, users, Rooms) carries `@DirtiesContext(classMode = AFTER_CLASS)` so the next class starts from the test seed (`db/test-seed`, accounts `@campusstay.test`; the dev base data is not loaded). Never sign in as `staff.b1` (AuthFlowIT locks it).
- `TestAuth.bearer(mvc, email)` signs in a seed account and returns the `Authorization` header value.
