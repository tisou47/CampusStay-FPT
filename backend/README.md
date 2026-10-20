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
2. Set `GOOGLE_CLIENT_ID` for the backend (and `VITE_GOOGLE_CLIENT_ID` for the web app).
3. Link a seed account to your Google account by giving it your FPT email, e.g. in psql:
   `UPDATE auth_user SET email = '<you>@fpt.edu.vn' WHERE email = 'se190001@student.campusstay.test';`
Only `@fpt.edu.vn` Workspace accounts (`hd` claim) are accepted, and only for accounts that already exist.

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
  shared/   error model, paging, audit log, clock, tokens (open module)
  auth/     sign-in, sessions, users, Block scope           (S0 implemented)
  cfg/      Terms and configuration                        (GET /terms implemented)
  inv/      Buildings, Floors, Rooms, Beds                  (Block directory implemented)
  app/ asg/ bil/ req/ mnt/ ntf/ rpt/                        (to be implemented slice by slice)
src/main/resources/db/migration/   Flyway schema V1–V10
src/main/resources/db/seed/        demo data (dev/test only)
```
