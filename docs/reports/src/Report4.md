# II. Software Design Document

Every diagram of this document is a draw.io file in the repository (`docs/diagrams/*.drawio`), drawn with draw.io's UML shapes and exported to the pictures below by draw.io itself (`node docs/tools/drawio.mjs export`). The ERDs use Chen's notation: entities as rectangles, attributes as ovals (the key underlined), relationships as diamonds with the cardinalities 1 and N; they and the table lists are generated from the migrated schema (`docs/tools/gen-db-docs.mjs`), so they cannot drift from the database script.

## 1. System Design

### 1.1 System Architecture

CampusStay FPT is one Spring Boot API (a modular monolith with one database) used by two clients: a React web app for the four roles and a Flutter mobile app for students (built for Android). The web app is a static build served by Vercel; the API runs in a Docker container behind Caddy on an Azure virtual machine and stores its data in a managed PostgreSQL server. Four external services are used: Google Identity (sign-in), Firebase Cloud Messaging (push), Gmail SMTP (email) and a VietQR image service (the QR picture of a transfer). Money moves outside the system: a student transfers to the dormitory's bank account and a Manager confirms the student's claim; there is no bank API.

![System overview: components, external services and the main data flows](../../diagrams/out/architecture.png)

| Component | Responsibility | Technology |
|---|---|---|
| Web app | Student portal (phone-first) and the Staff, Manager and Admin back office; calls only `/api` with a bearer token; Vietnamese and English | React 19, React Router 8, Vite 8, Tailwind CSS 4 |
| Mobile app (Flutter, Android) | Students: Home, My Room (door code, check-in pass), Payments (VietQR, claim), Activity (notifications, requests); push notifications | Flutter 3.47 (Dart 3.13), http, Firebase Messaging |
| Caddy | Reverse proxy on the VM: HTTPS with Let's Encrypt certificates, forwards `/api` to the API container | Caddy 2 |
| CampusStay API | REST API (`/api`): security filter (bearer session, role rules), controllers, services with the business rules and transactions, repositories; scheduled jobs; domain events; email outbox; push after commit | Spring Boot 4.1.1, Java 21 |
| PostgreSQL | One database: 98 tables, 32 report views; constraints and partial unique indexes carry the critical rules (one Allocation per Bed per Term, one payment per Invoice) | Azure Database for PostgreSQL 17 (Flexible Server) |
| File volume | Uploaded photos, receipts and evidence files, served through short-lived signed links | Docker volume on the VM |
| Google Identity Services | Issues ID tokens of `@fpt.edu.vn` accounts; the API verifies them with Google's public keys | OAuth 2.0 / OpenID Connect |
| Firebase Cloud Messaging | Delivers push messages to the students' Android devices | FCM HTTP v1 |
| Gmail SMTP | Sends emails queued in the outbox (reset links, invitations, warnings, campaigns) | SMTP over TLS |
| VietQR image service | Draws the QR picture of a transfer (bank, account, amount, transfer content) | HTTPS image URL (qr.sepay.vn) |

Main architectural decisions (full list: Design Brief section 3 and `docs/00_Project_Brief.md` Decision Log):

| ID | Decision | Reason |
|---|---|---|
| ADR-01 | One deployable and one database (monolith) | Allocation and payment need ACID transactions across features; three clients share one API; a small team and a 16-week schedule. |
| ADR-17 | Layered packages: controller → service → repository, one sub-package per feature | The standard Spring layout is easy to navigate; `LayeringTest` checks that calls go one way. |
| ADR-07 | Opaque server-side sessions (bearer token, only its SHA-256 stored) | Instant revocation at sign-out, password change or disabled account; no key management. |
| ADR-06 | Students choose Room Type and Room Class, never a Bed; a batch engine assigns | Gender and Block rules and fairness are guaranteed by the engine; no race for the same Bed. |
| ADR-22 | Payments are claims confirmed by Managers | No bank API or payment-gateway contract is available; the claim stops the deadline so a slow confirmation never costs a place. |
| ADR-16 | Web on Vercel; API on one VM with Docker Compose and Caddy; GitHub Actions deploys | A VM never sleeps, so jobs, the email outbox, SMTP and the file volume work; Vercel cannot run a long-lived Java process. |

### 1.2 Package Diagram

![Backend packages (vn.fpt.campusstay) and their allowed dependencies](../../diagrams/out/package-backend.png)

| No | Package | Description |
|---|---|---|
| 01 | `controller.<feature>` | REST endpoints (54 controllers) with their request and response records; validate input, call one service method, return the contract record. No SQL, no entities. |
| 02 | `service.<feature>` | Business rules and transactions (242 classes), one sub-package per feature: `auth` (AUTH), `setting` (CFG), `inventory` (INV), `application` (APP), `assignment` (ASG), `billing` (BIL), `request` (REQ), `maintenance` (MNT), `notification` (NTF), `report` (RPT). Also the scheduled jobs, event listeners, exports and the interfaces other features call (`Billing`, `Inventory`, `Moves`, `TermCatalog` …). The demo data reset (`service.setting.DemoResetService`, demo server only) is the one service that writes every feature's tables. |
| 03 | `repository`, `repository.<feature>` | Spring Data JPA repositories (users, sessions, Terms, Room Types and Classes) and SQL stores per feature (`JdbcClient`) for the larger tables. A table is written only by the feature whose prefix it carries. |
| 04 | `entity` | JPA entities of the tables read through JPA. |
| 05 | `dto` | Records shared by several layers (`ListResponse`, `PageQuery`, `TermSummary`). |
| 06 | `event` | 53 domain events (`ApplicationSubmitted`, `PaymentConfirmed`, `MaintenanceReported` …) that carry side effects to other features, mostly notifications. |
| 07 | `security` | `SecurityConfig`, `BearerTokenFilter`, `CurrentUser`, `Role`, `Permission` (the role-by-action table, also shown as the Admin permission matrix), `BlockScope`, `AccountSetupGate`. |
| 08 | `config` | Spring configuration and typed properties (clock, mail, push, payment, door codes, files). |
| 09 | `exception` | `ApiException`, `FieldErrors`, `GlobalExceptionHandler`, `LocalizedErrors` (Vietnamese messages from `i18n/messages_vi.txt`). |
| 10 | `common` | Audit Log, file store and signed links, CSV and XLSX reading and export, search, i18n, the demo scenario data. |

![Web and mobile packages](../../diagrams/out/package-clients.png)

| No | Package | Description |
|---|---|---|
| 11 | `web/src/app` | Router (114 routes), menus per role, session and route guards, toasts, the screen catalogue. |
| 12 | `web/src/pages` | Screens by area: `auth`, `student`, `staff`, `manager`, `admin`, `registration` (registration-period requests, shared with the Admin's Term wizard in `admin`), `transition` (requests window, next-Term fees, turnover), `common` (announcements, not found). |
| 13 | `web/src/components` | `ui` (Button, Field, Table, Overlay, Tag …) and `layout` (StudentLayout, BackOfficeLayout, Block picker, notifications bell). |
| 14 | `web/src/api` | `client` (fetch with the token and `Accept-Language`, error handling, 401 signs out), `endpoints` (one function per API call), `hooks` (`useQuery`, `useMutation`). |
| 15 | `web/src/i18n`, `web/src/lib` | `t()` and the Vietnamese texts; formatting of money, dates and times in the campus time zone. |
| 16 | `mobile/lib` (`main.dart`, `screens/`, `common.dart`) | Flutter screens: sign-in, Home, Room, Payments, Activity; session gate, tabs, theme, common widgets and formats. |
| 17 | `mobile/lib` (`api.dart`, `session.dart`) | `Api` (http, JSON, bearer token, language), `SessionStore` (token storage). |
| 18 | `mobile/lib/push.dart` | FCM: registers the device token with the API, shows messages that arrive while the app is open. |

### 1.3 Technology Declaration

#### 1.3.1 Development technologies

| Layer | Technology and version | Notes |
|---|---|---|
| Front-end (web) | React 19.3, React Router 8.4, Vite 8.3, Tailwind CSS 4.3, lucide-react 1.59, qrcode-generator 1.4.4, Inter font | JavaScript (JSX); built to static files |
| Back-end | Java 21 (Temurin), Spring Boot 4.1.1 (Web MVC, Validation, Security, OAuth2 JOSE, Data JPA, Flyway, Mail, Actuator), Maven | One deployable `campusstay-backend` |
| Mobile | Flutter 3.47.8 (Dart 3.13, Material 3), http 1.6, shared_preferences 2.5, qr_flutter 4.1 (QR), firebase_core 5.1 + firebase_messaging 17.0, google_sign_in 7.2 (Credential Manager); Android host: Android Gradle Plugin 9.1 | compileSdk/targetSdk 36, minSdk 26 (Android 8.0) |
| Database | PostgreSQL 17 (production: Azure Database for PostgreSQL Flexible Server; tests: Testcontainers `postgres:17-alpine`; development: local PostgreSQL), Flyway migrations V1–V59 | Schema owned by Flyway; the migrations are the database script |
| Testing | JUnit 5, AssertJ, Spring Boot Test, Testcontainers 2.0, Maven Surefire (unit) and Failsafe (integration) | 235 automated tests (section 3 of Report 5) |
| Packaging and runtime | Docker (API image built by GitHub Actions), Docker Compose, Caddy 2 | Images in GitHub Container Registry |

#### 1.3.2 Third-party services

| Service | Purpose | Data sent | Configured by |
|---|---|---|---|
| Google Identity Services | Authentication: sign in with an FPT Google account (web popup or redirect code flow, Android Credential Manager) | The authorization code or ID token; the API receives email, name, Google subject and hosted domain | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (server), `VITE_GOOGLE_CLIENT_ID` (web) |
| Firebase Cloud Messaging | Push notifications to the Android app | Device token, notification title, body and link (never a door code or an amount owed by someone else) | `FIREBASE_CREDENTIALS_FILE` (service account on the server); `google-services.json` in the app (not in Git) |
| Gmail SMTP | Email: password reset, invitations, payment and Utility warnings, Admin campaigns | Recipient address, subject, HTML body; on the demo server emails of fictional accounts go to the team mailbox | `SPRING_MAIL_*` (App Password), `MAIL_REDIRECT_TO` |
| VietQR image service (qr.sepay.vn) | Payment: the QR picture shown on the payment page | Bank, account number, account name, amount, transfer content `CSTAY…` (no personal data, no secret) | `PAYMENT_*` |
| Vercel | Hosting of the web app (static build, CDN, HTTPS) | The built web files; visitors' requests | Vercel project `campusstay-fpt` |
| Microsoft Azure (Azure for Students) | Hosting: VM for the API, managed PostgreSQL | All business data (fictional demo data) | `infra/prod/`, runbook appendix A |
| GitHub, GitHub Actions, GHCR | Source code, CI/CD, container images | Source code, built images | `.github/workflows/backend.yml` |

No AI API is called by the product. Secrets live only in the server's `/opt/campusstay/.env` and the hosting settings, never in Git (`infra/prod/.env.example` lists the names).

#### 1.3.3 Source code and DevOps

| Topic | Practice |
|---|---|
| Platform | GitHub, one monorepo `tisou47/CampusStay-FPT` (ADR-05): `backend/`, `web/`, `mobile/`, `docs/`, `infra/`, `.github/workflows/` |
| Branches | `main` is production. Work is done on a branch per change (`feat/…`, `fix/…`, `docs/…`); until Review 2 each phase of the Change Specification v2 is built on `feat/v2-phase<n>` and merged when the phase is complete, its checks pass and the demo works. `main` is updated only by fast-forward after the checks pass. |
| Commits | Conventional format with the feature code: `feat(web): …`, `fix(bil): …`, `docs: …`. |
| Checks before merging | `mvn -o verify` in `backend/` for any backend change (unit, integration and architecture tests; Testcontainers needs Docker); `npm run build` in `web/` for any web change; `flutter analyze`, `flutter test` and `flutter build apk` in `mobile/` for any mobile change. Never merge with a failing check. |
| CI/CD (backend) | GitHub Actions `backend.yml` on every push to `main` touching `backend/**` or the production stack: job `verify` (`mvn verify` on Ubuntu with Temurin 21), job `image` (Docker build, push to GHCR tagged with the commit SHA and `latest`), job `deploy` (SSH to the VM, `docker compose pull` and `up -d api`, readiness check `GET /api/actuator/health` = UP). Pull requests run `verify` only. |
| CD (web) | Vercel builds production on every push to `main` and a preview deployment for other branches when `web/` changed. |
| Database changes | Only new Flyway migrations (`V<next>__….sql`); an applied migration is never edited; migrations run when the new image starts, after passing `mvn verify`. |

#### 1.3.4 Deployment environments

![Environments and delivery](../../diagrams/out/deployment.png)

| Environment | Where | How it is deployed | Data | Rollback |
|---|---|---|---|---|
| Development (dev) | Each developer's machine: API with profile `dev` on a local PostgreSQL, web with `npm run dev` (Vite proxy to `/api`), mobile app with `flutter run` on an Android emulator or phone | By the developer | Base data seed `R__dev_seed.sql` (8 Blocks, 3,680 Beds, 6,200 fictional students), demo stages | — |
| Test (CI) | GitHub Actions runner | Every push and pull request touching the backend | Testcontainers PostgreSQL 17 with the test seed (2 Blocks, 48 students) | — |
| Preview (web) | Vercel preview URL per branch | Automatic when `web/` changed on a branch | Uses the production API | Not promoted |
| Staging / demo = production | Web https://campusstay-fpt-ten.vercel.app; API https://campusstay-api.eastasia.cloudapp.azure.com/api (Azure VM B2ats v2 in East Asia, Docker Compose in `/opt/campusstay`, Azure Database for PostgreSQL B1ms) | Automatically from `main` (section 1.3.3); nobody deploys by hand | Fictional base data; demo stages 0, A, B, C loaded by Admin › System › Demo data (only with `DEMO_TOOLS=true`); emails of fictional accounts redirected to the team mailbox | API: set `API_TAG=<previous SHA>` in `.env` and `docker compose up -d api` (≤ 5 min); web: promote the previous Vercel deployment; database: Azure point-in-time restore (7 days) |

Before the final defense the production server is also the demo (staging) environment declared for Defense 1.1: the council's scenarios run on it with data loaded by the demo tool, which is a script in the repository (`backend/src/main/resources/db/demo/`), so every run is repeatable.

#### 1.3.5 AI tools

| Tool | Model | Stages where it is used | Rules followed |
|---|---|---|---|
| Claude Code (Anthropic), in IntelliJ IDEA, VS Code and the Claude desktop app | Claude Opus family (Claude Opus 5.5 at the time of writing) | Specification: drafting the Change Specification v2, SRS tables and business rules from the team's decisions. Design: ADRs, the draw.io diagrams (laid out by generators in `docs/tools/`), database migrations. Code: backend features, web screens, Android screens, generators in `docs/tools/`. Testing: integration tests and the test catalog. Review: code review of each change and the BM02 self-review with the standard prompt. | Every AI output is reviewed and tested (`mvn verify`, `npm run build`) before it reaches `main`; no real personal data, passwords, API keys or secrets are given to the tool (fictional seed data; secrets stay in the server `.env` and a local folder outside the repository); each member answers for the parts they own (Report 2, ownership). |

## 2. Database Design

### 2.1 Overview

The database script is the set of Flyway migrations `backend/src/main/resources/db/migration/V1__…sql` to `V59__…sql`, applied automatically when the API starts; the base data are `db/seed/R__dev_seed.sql`. The logical ERDs and table lists below are generated by `docs/tools/gen-db-docs.mjs` from `information_schema` of a database migrated to V59 (98 tables), so every table and key in the ERD exists in the script and every table of the script is in an ERD. The ERDs are drawn in Chen's notation: a rectangle per table, ovals for its key (underlined) and main business attributes, and a diamond per foreign key, named after the column, with 1 on the referenced side and N on the referencing side (1 when the key is also the whole primary key). Tables of another area appear as dashed rectangles. The complete columns, types, checks and indexes are in the migrations.

Conventions: tables are prefixed with their feature (`auth_`, `cfg_`, `inv_`, `app_`, `asg_`, `bil_`, `req_`, `mnt_`, `ntf_`, `shared_`); keys are `BIGINT` identities; money is `BIGINT` VND; times are `TIMESTAMPTZ` in UTC; statuses are upper-case text with a `CHECK`; mutable rows carry a `version` for optimistic locking; JSONB only for snapshots (Invoice lines, contact snapshot, matching snapshot). Reports read 32 views `rpt_v_*`, each defined by the feature that owns the tables.

![Conceptual ERD of the main entities in Chen's notation; the logical ERD of each area (all 98 tables) follows in sections 2.2–2.11](../../diagrams/out/erd-main.png)

Rules guaranteed by the database (the safety net behind the services' checks):

| Rule | Constraint |
|---|---|
| One active Allocation per Bed per Term; one per student per Term | Partial unique indexes `ux_alloc_bed_term`, `ux_alloc_student_term`; Beds locked with `SELECT … FOR UPDATE` when they change hands |
| One live Application per student per Term | `ux_app_one_live_per_term` |
| Published Terms never overlap | Exclusion constraint `ex_term_no_overlap` |
| One live assignment run per Term | `ux_asg_one_live_run` |
| One open claim and one payment per Invoice; one refund per Invoice | `ux_claim_open`, `ux_payment_one_confirmed`, `ux_refund_one_per_invoice` |
| An Invoice's money never changes; Paid and Void are final | Trigger `tr_invoice_fixed` |
| One next-Term fee per Allocation | `ux_invoice_one_term_fee` |
| One current and one waiting door code per Room | `ux_door_code_active`, `ux_door_code_proposed` |
| One open registration-period request per Term | `ux_term_request_open` |

@include _db-design.md

## 3. Detailed Design

### 3.1 State Machines of the Main Entities

Each diagram names, on every transition, what triggers it and the functional requirement (FR) of Report 3 that specifies it; transitions marked *job* are made by the scheduled jobs. The states are the values of the status column of the table named in the title.

#### 3.1.1 Application (`app_application.status`)

The status `DRAFT` exists in the schema but the current flow never stores it: an Application is created when the student submits the wizard.

![State machine: Application](../../diagrams/out/state-application.png)

#### 3.1.2 Allocation in the current Term (`asg_allocation`)

The table stores ACTIVE, ENDED and CANCELLED; the three ACTIVE states are told apart by `code_released_at` and `resident_at`.

![State machine: Allocation in the current Term](../../diagrams/out/state-allocation.png)

#### 3.1.3 Next-Term Allocation (`asg_allocation.renewal`)

![State machine: next-Term Allocation](../../diagrams/out/state-allocation-next.png)

#### 3.1.4 Stay (`asg_stay.status`)

![State machine: Stay](../../diagrams/out/state-stay.png)

#### 3.1.5 Invoice (`bil_invoice.status`)

The status `UPCOMING` exists in the schema for reading only; Invoices are issued Unpaid.

![State machine: Invoice](../../diagrams/out/state-invoice.png)

#### 3.1.6 Payment claim (`bil_payment_claim.status`)

![State machine: payment claim](../../diagrams/out/state-claim.png)

#### 3.1.7 Maintenance Request (`mnt_request.status`)

![State machine: Maintenance Request](../../diagrams/out/state-maintenance.png)

#### 3.1.8 Registration-period request (`cfg_term_request.status`)

![State machine: registration-period request](../../diagrams/out/state-term-request.png)

#### 3.1.9 Next-Term requests

![State machine: Room-Change Request (next Term)](../../diagrams/out/state-room-change.png)

![State machine: swap](../../diagrams/out/state-swap.png)

![State machine: Room Class change of a Room](../../diagrams/out/state-room-class-change.png)

![State machine: extension and end of stay](../../diagrams/out/state-stay-request.png)

#### 3.1.10 Late check-in, termination, door code and Round-2 offer

![State machine: late check-in](../../diagrams/out/state-late-check-in.png)

![State machine: termination](../../diagrams/out/state-termination.png)

![State machine: door code](../../diagrams/out/state-door-code.png)

![State machine: Round-2 offer](../../diagrams/out/state-round2-offer.png)

### 3.2 Activity Diagrams of the Main Workflows

The five main workflows of the system (Design Brief Appendix A1). Lanes are the actors; the System lane holds what the API and its jobs do. Each workflow has one owner, its demo scenarios and its end-to-end test case (Report 5).

| ID | Workflow | Actors | Owner |
|---|---|---|---|
| WF-01 | Registration to residence | Student, Manager, System | Lê Thành Minh Trung |
| WF-02 | Opening a registration period | Manager, Administrator, System, Student | Trần Võ Quang Duy |
| WF-03 | Term transition of continuing residents | Student, Staff, Manager, System | Nguyễn Xuân Lộc |
| WF-04 | Maintenance with routing and time limits | Student, Staff, Manager, System | Võ Minh Luân |
| WF-05 | Monthly Utility, debt and termination | Staff, Student, Manager, System | Lê Thành Minh Trung |

#### 3.2.1 WF-01 Registration to residence

![Activity diagram WF-01: from sign-in to a resident with a door code](../../diagrams/out/act-wf01-registration.png)

#### 3.2.2 WF-02 Opening a registration period

![Activity diagram WF-02: a Manager's request, the Admin's Term wizard, publication](../../diagrams/out/act-wf02-term-opening.png)

#### 3.2.3 WF-03 Term transition

![Activity diagram WF-03: requests window M2–M7, reconciliation, next-Term fees, turnover](../../diagrams/out/act-wf03-term-transition.png)

#### 3.2.4 WF-04 Maintenance with routing and time limits

![Activity diagram WF-04: report, routing, handling, escalation, confirmation](../../diagrams/out/act-wf04-maintenance.png)

#### 3.2.5 WF-05 Monthly Utility, debt and termination

![Activity diagram WF-05: meter readings, Utility Invoices, warnings, termination, check-out](../../diagrams/out/act-wf05-utility.png)

@include r4-detail.md
