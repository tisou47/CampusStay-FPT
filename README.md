# CampusStay FPT

Dormitory Registration and Room-Scheduling Management System for FPT University's Tân Uyên Campus (capstone FA26SE260).

## Repository layout

| Folder | Content |
|---|---|
| `backend/` | Spring Boot 4.1 REST API (Java 21, PostgreSQL 17, Flyway). See [backend/README.md](backend/README.md) and [backend/CLAUDE.md](backend/CLAUDE.md). |
| `web/` | React 19 + Vite web app for Student, Staff, Manager and Admin. See [web/README.md](web/README.md). |
| `mobile/` | Flutter app for students (built for Android): Home, My Room, Payments, Activity, push. See [mobile/README.md](mobile/README.md). |
| `docs/` | SEP490 documents (Topic, Reports 1–7 and workbooks, Review 2 forms, Diagrams), mirrored from the team Google Drive with `tools/sync-docs.ps1`; change history in `docs/CHANGELOG.md`. |
| `tools/` | `postman/` (API contract and the Postman generator), `sync-docs.ps1`. |
| `infra/` | Docker Compose for Postgres, Mailpit and the API; `infra/prod/` is the production stack (Postgres, API, Caddy). |
| `.github/workflows/` | CI/CD: backend verify, image build and deploy to the VM. |
| `postman/` | Postman collection `CampusStay API` (every endpoint by role, plus read-only smoke tests) and the Local and Production environments; see the collection's description. |

## Documents

| File | Purpose |
|---|---|
| [docs/](docs/) | SEP490 deliverables, synced from Google Drive (see below) |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Change history: Record of Changes of the reports and the registration form, Decision Log (ADR-01…ADR-29) |
| [tools/postman/api-contract.md](tools/postman/api-contract.md) | The API the web and mobile apps call (request and response shapes) |
| [infra/prod/README.md](infra/prod/README.md) | Production runbook: setup, settings, operations, monitoring, Azure appendix |
| [CLAUDE.md](CLAUDE.md), [backend/CLAUDE.md](backend/CLAUDE.md) | Working rules: delivery, layers, conventions |

After adding or changing an endpoint, run `node tools/postman/generate-postman.mjs` with the backend running: it rebuilds the role folders of the Postman collection from `/api/v3/api-docs` and the contract.

## Sync documents with Google Drive

The team Google Drive folder `DATN-FA26SE260-GFA26SE104 CampusStay` is the source of `docs/` (folders `Topic`, `SEP490_Report`, `SEP490_R2_BM04_Review2-Document`, `Diagrams`). Requires Google Drive for Desktop signed in to an account that sees the folder (a shared folder: "Add shortcut to Drive"); if it is not at `G:\My Drive\…`, set `CAMPUSSTAY_DRIVE_DIR` or pass `-DriveDir`.

```powershell
powershell -File tools/sync-docs.ps1                # preview Drive -> repo
powershell -File tools/sync-docs.ps1 -Apply         # pull before committing docs
powershell -File tools/sync-docs.ps1 -Push -Apply   # only for files edited in the repo
```

With `-Apply`, the script stops (exit code 2) instead of deleting a file that exists only on the destination side or overwriting a destination copy that is newer or different; `-Force` replaces them. It skips Office lock files (`~$*`). Self-check: `powershell -File tools/tests/sync-docs.test.ps1`.

## API from Postman

With the backend running, Swagger UI is at http://localhost:8080/api/swagger-ui.html. In Postman, open this repository's `postman/` folder, choose the **Local** or **Production** environment and send any request: the collection signs in as the role of the request's folder. The smoke tests run from the command line:

```bash
postman collection run "postman/collections/CampusStay API" -i "Smoke tests" -e postman/environments/Local.environment.yaml
```

## Run locally

```bash
docker compose -f infra/docker-compose.yml up -d db mail   # Postgres + Mailpit
cd backend && mvn spring-boot:run                          # API on http://localhost:8080/api
cd web && npm install && npm run dev                       # web app on http://localhost:5173
```

Before committing: `mvn verify` in `backend/` and `npm run build` in `web/` must pass.

## Deploy

| | Production |
|---|---|
| Web | https://campusstay-fpt-ten.vercel.app — Vercel, Root Directory `web/` |
| API | https://campusstay-api.eastasia.cloudapp.azure.com/api — Azure for Students VM, Docker Compose with Caddy (HTTPS) |
| Database | Azure Database for PostgreSQL (Flexible Server) |

Pushing to `main` deploys both (ADR-16): Vercel builds `web/`, and `.github/workflows/backend.yml` runs `mvn verify`, builds the image to GHCR and ships it to the VM over SSH. The server runs as a demo with the fictional base data (ADR-18); payments are claims confirmed by Managers (ADR-22); its email and Firebase settings are not set yet (architecture §14.1). One-time setup and operations: [infra/prod/README.md](infra/prod/README.md).
