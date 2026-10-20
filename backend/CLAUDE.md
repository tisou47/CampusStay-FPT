# CLAUDE.md — CampusStay FPT backend

Instructions for Claude Code working in `backend/` (IntelliJ IDEA). Paths below are relative to the repository root. Read this file, then `docs/backend/01_Backend_Architecture.md` before changing code. Scope and decisions: `docs/00_Project_Brief.md`. Endpoint shapes: `docs/api-contract.md` + `docs/backend/03_API_Contract_Changes.md`. Progress: `docs/backend/02_Endpoint_Map.md`.

## Stack
Java 21 · Spring Boot 4.1.x (Spring Framework 7, Spring Security 7, Hibernate 7, Jackson 3) · Maven · PostgreSQL 17 · Flyway · Spring Modulith 2.1 · JUnit 5 + Testcontainers.

## Commands
```bash
docker compose -f infra/docker-compose.yml up -d db mail   # Postgres + Mailpit
mvn spring-boot:run                                         # profile dev, http://localhost:8080/api
mvn test                                                    # unit + ModularityTests
mvn verify                                                  # + *IT integration tests (Docker required)
```
`mvn verify` must pass before every commit. Mail inbox: http://localhost:8025. Seed password: `CampusStay@2026`.

## Spring Boot 4 / Jackson 3 notes (R-11 closed 20/10/2026: the build and `mvn verify` pass)
- Spring Boot 4 test packages: `org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc`, `org.springframework.boot.testcontainers.service.connection.ServiceConnection`.
- Testcontainers 2: `org.testcontainers.postgresql.PostgreSQLContainer`, artifacts `testcontainers-postgresql`, `testcontainers-junit-jupiter`.
- Jackson 3: `tools.jackson.databind.json.JsonMapper` (AuditLog); annotations stay `com.fasterxml.jackson.annotation`.
- Jackson 3 rejects a missing or `null` primitive in a request body (`400 BAD_REQUEST_BODY`). Optional request fields use wrapper types (`Boolean remember`); do not turn the check off globally.
- Jackson 3 binds both `"42"` and `42` to a `long` request field, so request records may keep IDs as `long`.
- Outbound HTTP: `RestClient.builder()` directly (Boot 4 has no `RestClient.Builder` bean without the restclient starter); tests bind it to `MockRestServiceServer` (see `GoogleCodeExchangerTest`).
When something does not compile, check the real API (do not guess); keep the design unchanged.

## Module rules (enforced by `ModularityTests`)
- Packages: `vn.fpt.campusstay.<module>` with modules `auth cfg inv app asg bil req mnt ntf rpt` + open `shared`.
- Top-level package of a module = its public API (interfaces, records, events). `internal/`, `web/`, `security/` are private.
- Never query another module's tables (`auth_*`, `cfg_*`, … prefixes). Ask its public API, add a method there if needed, or listen to its events. RPT reads only `rpt_v_*` views, each defined by the owning module in its migration.
- No module cycles. If module A needs data owned by B while B already depends on A, declare a port interface in A and implement it in B (example: `auth.BlockDirectory` implemented by `inv`).
- Cross-module side effects = domain events (`record` in the publisher's top-level package). Listeners that must commit with the change use `@EventListener` (same transaction); fire-and-forget ones use `@TransactionalEventListener(phase = AFTER_COMMIT)`.

## How to add an endpoint (one vertical slice)
1. Find it in `02_Endpoint_Map.md` and the contract; match request/response field names exactly.
2. Schema change? Add a new Flyway file `V<next>__<module>_<what>.sql`. Never edit an applied migration. Update `R__dev_seed.sql` if screens need data (keep it idempotent).
3. Write the service in `<module>/internal` with `@Transactional`; controller in `<module>/web` (package-private class, records for request/response, Bean Validation messages written for users).
4. Authorization: role (URL rule or `currentUser.require(...)`), then scope: `blockScope.resolve(block)` for Staff/Manager; filter by `currentUser.id()` for students. A student asking for someone else's record gets 404, not 403.
5. Errors: throw `ApiException` with a stable `code` (UPPER_SNAKE) and a user-facing `message`. Add new constraint names to `ConstraintMessages`.
6. Audit: `auditLog.record(...)` inside the transaction for every state change made by Staff/Manager/Admin and every export.
7. Tests: an `*IT` class per controller covering happy path, validation, permission/scope and the main business rule; name each test with its `TC-<MODULE>-NNN` id in the Javadoc.
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
S0 done (AUTH session, `/terms`, Google code or ID token, string IDs); `/auth/password/reset` and `/auth/password/change` still need integration tests. Next: S1 Admin configuration + inventory + users + Audit Log + `/notifications` → S2 Application wizard + Deposit + VietQR/SePay → S3 review + assignment engine + approval + commit → S4 desk + maintenance + push → S5 → S7 (see the map).
