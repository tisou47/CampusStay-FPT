# CLAUDE.md — CampusStay FPT (repository)

Monorepo (ADR-05): `backend/` Spring Boot API (read `backend/CLAUDE.md` before changing it), `web/` React + Vite app, `docs/` (Brief, API contract, backend design), `infra/` (Docker Compose; `infra/prod/` is production, runbook `infra/prod/README.md`), `.github/workflows/` (CI/CD). Scope and decisions: `docs/00_Project_Brief.md`.

## Delivery: `main` is production
Nothing is deployed by hand (runbook §6.1):
- **Backend:** a push to `main` touching `backend/**`, the `infra/prod/` stack files or the workflow runs `.github/workflows/backend.yml`: `mvn verify`, image to GHCR, deploy to the server over SSH, readiness check.
- **Web:** Vercel builds production on every push to `main` (previews for other branches when `web/` changed).
- Production: web https://campusstay-fpt-ten.vercel.app, API https://campusstay-api.eastasia.cloudapp.azure.com/api (Azure for Students VM, Docker Compose in `/opt/campusstay`, managed PostgreSQL; runbook appendix A).

## Standing rule for finishing a change (user decision, 24/10/2026)
When a change is done and its checks pass, ship it without asking:
1. Checks: `mvn -o verify` in `backend/` for any backend change (Docker must run), `npm run build` in `web/` for any web change. Never push with a failing check.
2. Commit on a branch with the repo's format (`feat(web): …`, `fix(bil): …`, `docs: …`) and the Co-Authored-By trailer, fast-forward `main` and push it.
3. Watch the result and report it: the backend run in GitHub Actions (`deploy` must succeed, not be skipped), the Vercel production deployment (Ready, not Canceled), and `GET /api/actuator/health` = UP.
4. Ask first only for what is not code: changing production settings or data, secrets, deleting things, or anything outside the request.

**Until Review 2 (ADR-27, user decision 24/10/2026):** the phases of the Change Specification v2 (`docs/01_Change_Spec_v2.md` §16) are built on their own branch `feat/v2-phase<n>`, pushed to GitHub (Vercel builds a preview) and merged into `main` only when the phase is complete, its checks pass and the demo still works. Documentation-only changes and urgent fixes still follow steps 1–3 directly.

## Never
- Commit secrets or settings: `.env` files, keys, passwords, the Firebase JSON. Production settings live in `/opt/campusstay/.env` on the server (`infra/prod/.env.example` lists them).
- Edit an applied Flyway migration: add a new `V<next>__…sql`. Migrations run automatically when the new image starts, so they must pass `mvn verify` first.
- Put real people's data in seeds or tests.

## Demo switches on the production server
`PAYMENT_SIMULATOR=true` (+ Vercel `VITE_PAYMENT_SIMULATOR=true`): the "Simulate bank transfer" button (A-08) until v2 phase 5 reaches `main`; from then payments are claims confirmed by Managers (ADR-22) and both settings are no longer read (removing them is a production change: ask first). `MAIL_REDIRECT_TO`: every email goes to the team mailbox instead of the fictional seed addresses; it needs SMTP (`SPRING_MAIL_*`), and neither is set yet (24/10/2026), so production only logs emails (architecture §14.1).
