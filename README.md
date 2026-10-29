# CampusStay FPT

Dormitory Registration and Room-Scheduling Management System for FPT University's Tân Uyên Campus (capstone FA26SE260).

## Repository layout

| Folder | Content |
|---|---|
| `backend/` | Spring Boot 4.1 REST API (Java 21, PostgreSQL 17, Flyway). See [backend/README.md](backend/README.md) and [backend/CLAUDE.md](backend/CLAUDE.md). |
| `web/` | React 19 + Vite web app for Student, Staff, Manager and Admin. See [web/README.md](web/README.md). |
| `mobile/` | Flutter app for students (built for Android): Home, My Room, Payments, Activity, push. See [mobile/README.md](mobile/README.md). |
| `docs/` | Project Brief (source of truth), API contract, backend design, test catalog and web screen map; `docs/tools/` regenerates the catalogs. |
| `infra/` | Docker Compose for Postgres, Mailpit and the API; `infra/prod/` is the production stack (Postgres, API, Caddy). |
| `.github/workflows/` | CI/CD: backend verify, image build and deploy to the VM. |
| `postman/` | Postman collection `CampusStay API` (every endpoint by role, plus read-only smoke tests) and the Local and Production environments; see the collection's description. |

## Documents

| File | Purpose |
|---|---|
| [docs/00_Project_Brief.md](docs/00_Project_Brief.md) | Scope, architecture baseline, schedule, open issues and the Decision Log |
| [docs/api-contract.md](docs/api-contract.md) | The API the web and mobile apps call (request and response shapes) |
| [docs/backend/01_Backend_Architecture.md](docs/backend/01_Backend_Architecture.md) | Backend design (feeds Report 4) |
| [docs/backend/02_Endpoint_Map.md](docs/backend/02_Endpoint_Map.md) | Every endpoint, its module, priority, slice and status |
| [docs/backend/03_API_Contract_Changes.md](docs/backend/03_API_Contract_Changes.md) | Changes to the contract proposed by the backend, with the status of each side |
| [docs/backend/04_Test_Catalog.md](docs/backend/04_Test_Catalog.md) | Every automated test with its `TC-` id (feeds Report 5); generated |
| [docs/web/01_Screen_Map.md](docs/web/01_Screen_Map.md) | Every web route with its screen code, Figma frame and API calls (feeds Reports 3, 4, 6); generated |
| [infra/prod/README.md](infra/prod/README.md) | Production runbook: setup, settings, operations, monitoring, Azure appendix |
| [CLAUDE.md](CLAUDE.md), [backend/CLAUDE.md](backend/CLAUDE.md) | Working rules: delivery, layers, conventions |

The two generated files come from the code: after changing a test's Javadoc, a page header or the router, run `node docs/tools/generate-catalogs.mjs` and commit the result with the change. Likewise, after adding or changing an endpoint, run `node docs/tools/generate-postman.mjs` with the backend running: it rebuilds the role folders of the Postman collection from `/api/v3/api-docs` and the contract.

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
