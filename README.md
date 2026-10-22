# CampusStay FPT

Dormitory Registration and Room-Scheduling Management System for FPT University's Tân Uyên Campus (capstone FA26SE260).

## Repository layout

| Folder | Content |
|---|---|
| `backend/` | Spring Boot 4.1 REST API (Java 21, PostgreSQL 17, Flyway). See [backend/README.md](backend/README.md) and [backend/CLAUDE.md](backend/CLAUDE.md). |
| `web/` | React 19 + Vite web app for Student, Staff, Manager and Admin. See [web/README.md](web/README.md). |
| `docs/` | Project Brief (source of truth), API contract and backend design. |
| `infra/` | Docker Compose for Postgres, Mailpit and the API; `infra/prod/` is the production stack (Postgres, API, Caddy). |
| `.github/workflows/` | CI/CD: backend verify, image build and deploy to the VM. |
| `postman/` | Postman workspace files. |

## Documents

| File | Purpose |
|---|---|
| [docs/00_Project_Brief.md](docs/00_Project_Brief.md) | Scope, architecture baseline, schedule, open issues and the Decision Log |
| [docs/api-contract.md](docs/api-contract.md) | The API the web and mobile apps call (request and response shapes) |
| [docs/backend/01_Backend_Architecture.md](docs/backend/01_Backend_Architecture.md) | Backend design (feeds Report 4) |
| [docs/backend/02_Endpoint_Map.md](docs/backend/02_Endpoint_Map.md) | Every endpoint, its module, priority, slice and status |
| [docs/backend/03_API_Contract_Changes.md](docs/backend/03_API_Contract_Changes.md) | Changes to the contract proposed by the backend |

## Run locally

```bash
docker compose -f infra/docker-compose.yml up -d db mail   # Postgres + Mailpit
cd backend && mvn spring-boot:run                          # API on http://localhost:8080/api
cd web && npm install && npm run dev                       # web app on http://localhost:5173
```

Before committing: `mvn verify` in `backend/` and `npm run build` in `web/` must pass.

## Deploy

The web app runs on Vercel (Root Directory `web/`), the API and PostgreSQL on one Ubuntu VPS behind Caddy (ADR-16). Pushing to `main` deploys both: Vercel builds `web/`, and `.github/workflows/backend.yml` verifies, builds and ships the backend. One-time setup and operations: [infra/prod/README.md](infra/prod/README.md).
