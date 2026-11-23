# II. Project Management Plan

## 1. Overview

### 1.1 Scope & Estimation

**Scope.** CampusStay FPT is the dormitory system described in Report 1 (13 features). Its size is measured on the code of `main`; every number comes from the generators in `tools/docs`:

@include _scope.md

Altogether: 63 REST controllers with 353 endpoints, 133 web pages, 31 mobile screens, 37 permissions, 118 tables and 33 views in 100 Flyway migrations (V1–V103), about 60,000 lines of Java, 50,000 of JavaScript and 11,000 of Dart.

**Estimation.** Estimates made before development are not recorded in the repository; this plan gives what it measured. The repository starts on 20/10/2026 (week 7): weeks 1–6 were analysis and design, so they leave no commits. Weeks 7–12 are measured as commits and *active days* (days on which a member committed):

@include _members.md

Per week (week 1 = Monday 07/09/2026):

@include _weeks.md

Two reading notes. The numbers count work that reached `main`; reviews, meetings and design work leave no trace in them. In the history the leader (Trung) made all commits of week 7 and most of week 8; Lộc and Luân start in week 8, Duy in week 10, and the areas of section 4 follow from that.

**Complexity of the work items.** Each function or screen of the Project Tracking workbook (sheet WBS) is rated Simple, Medium or Complex by the rule of its template (fields on the screen, transactions in the function), counted in the source.

@include _levels.md

### 1.2 Project Objectives

**Product objectives** (from the registration form, *Capstone Project Register*):
- digital dormitory registration and Bed assignment for FPT University's Tân Uyên campus from its first Term: self-service application, roommate wishes, assignment by rule, and notification of the result;
- billing support: Deposit, Balance, Utility and damage Invoices paid by VietQR bank transfer;
- maintenance tracking and inspections, check-in and check-out with a digital room-condition report;
- reporting and configuration for the dormitory office: eligibility rules, fees and Term cycles that the Administrator changes without a developer.

**Project objectives** (calendar of the capstone):

| Milestone | Date | Objective |
|---|---|---|
| Review 1 | 30/09/2026 (week 4) | topic, scope and the approach to a dormitory that is not yet operating |
| Review 2 | 31/10/2026 (week 8) | Reports 1–5 and a working system on the running deployment (tag `review-2`) |
| Defense 1.1 | December 2026 (date to be announced) | the system, Reports 1–7 and the test results; every member explains their part |

**Quality objectives.** `mvn verify` and the web checks pass before every merge; no High or Medium finding of the code review is left open before the defense; production is deployed from `main` only, by the pipeline.

### 1.3 Project Risks

| # | Risk | Impact | Mitigation | Status |
|---|---|---|---|---|
| R-01 | The rules of the Tân Uyên dormitory are not known (it is not operating) | Wrong prices, deadlines or rules | Every business value is a setting (`cfg_parameter`, the Term wizard); the Administrator changes it and the change is audited | Controlled |
| R-02 | Azure for Students limits: a credit budget, a burstable (B-series) VM that is throttled when its CPU credits run out | The API slows down or stops during a demo | Budget alert at 80 %, weekly check of credit and CPU credits (runbook `infra/prod/README.md`); assignment runs and exports are short | Met, controlled |
| R-03 | One VM, one database server: a single point of failure | Downtime or lost data | Managed PostgreSQL with Azure backups; a database backup before each deploy; containers restart on their own | Controlled |
| R-04 | Gaps in the delivery pipeline found by the review (REPO-02, REPO-04, REPO-05, REPO-09): the web had no CI gate, the deploy trusted the server's SSH key on first use, and there was no rollback point | A broken web or API reaches production | Fixed in waves 1 and 2: web checks (tests, i18n, build) in CI, the server's SSH key pinned in a repository variable, backups before the migration runs | Fixed |
| R-05 | Knowledge is concentrated: the leader wrote most of the code (section 4) | Members cannot explain parts of the system at the defense | Each member owns areas and workflows (section 4), follows the training plan (2.3), and explains and changes their part before Defense 1.1 | Open |
| R-06 | The AI assistant needs a model server (Ollama) that the team hosts itself | The assistant is unavailable | `ASSISTANT_BASE_URL` blank switches it off; the web hides the chat; door-code questions never reach the model | Controlled |
| R-07 | Demo accounts with a known password exist in the production database (review finding BE-AUTH-01, the only Critical one) | Anyone could sign in as a demo Manager or Admin | The password of the back-office demo accounts is set on the server, outside git, before the defense; the demo tools are on only while rehearsing. This is a production change that needs the leader's approval | Open |
| R-08 | Sign-in endpoints had no rate limit (BE-AUTH-02) | Demo accounts could be locked during a demo | Per-client and per-account limiter added in wave 1 | Fixed |
| R-09 | Time: 15 weeks for 13 features and a deployed system | Unfinished features | Waterfall for analysis and design (weeks 1–6), then iterations per feature; the review of 296 findings was cut into two fix waves by severity | Controlled |

## 2. Management Approach

### 2.1 Project Process

**Model.** Waterfall for the analysis and design (weeks 1–6: requirements, architecture and design, Review 1), then iterative development, one feature at a time, each ending with a deployed, tested version.

**Phases and milestones** (from the dates above and the repository):

| Phase | Weeks | Result |
|---|---|---|
| Analysis and design | 1–6 | topic and registration form, requirements, Review 1 (30/09/2026, week 4) |
| First implementation | 7–8 | monorepo (20/10/2026), eight slices S0–S7 (accounts to reports), deployment on Vercel and Azure, Flutter app; Review 2 on 31/10/2026 (tag `review-2`) |
| Polish and mobile | 9–10 | student profile, the mobile app with every student feature, Family Day and its statistics, one set of pickers and formats on the web |
| Hand-over, workload and polish | 11 | room hand-over, Staff shifts and workload, Admin settings and screens rebuilt, 234 commits |
| Code review and fixes | 11–12 | 296 findings, two fix waves, final reports |

**Workflow in the repository.**
- A change is made on a branch (`feat/…`, `fix/…`, `docs/…`) and merged into `main` by a pull request; 58 merge commits are on `main` (pull requests up to number 60). Pull requests are named like `feat(web): …`, `fix(bil): …`, `docs: …`.
- CI checks every change: for the backend `mvn verify` (unit tests, then integration tests on a real PostgreSQL in Docker); for the web `npm ci`, `npm test`, `npm run i18n:check` and `npm run build`.
- A merge into `main` deploys production by itself: the backend workflow builds the image, pushes it to GHCR, deploys over SSH and waits for the readiness check; Vercel builds the web.
- The user (leader) merges; nobody pushes to `main` directly.
- Database changes are new Flyway migrations only; an applied migration is never edited.

**Review waves.** A full review of the code (20–22/11/2026) found 296 findings. They were fixed in two waves of branches per area (backend, web, mobile): wave 1 (pull requests 54–56), wave 2 (pull requests 58–60). Each wave was verified on a local run before merging.

### 2.2 Quality Management

| Area | Activity | Measure | Where |
|---|---|---|---|
| Automated tests | unit and integration tests; every test has a test id `TC-<CODE>-<n>` in its Javadoc | 46 backend unit, 343 backend integration (Testcontainers), 7 web, 30 mobile; 380 test ids; all passing on 23/11/2026 | Report 5, `Report5_Test Report.xlsx` |
| Layering | `LayeringTest` fails the build when a controller uses a repository or an entity | runs on every `mvn test` | `backend/CLAUDE.md` |
| Review | a full read of every page and service, with a reproduction run | 296 findings: 1 Critical, 15 High, 108 Medium, 155 Low, 17 ideas; 51 reproduced by a failing test | `review/` |
| Fixes | wave 1 (52) and wave 2 (71) | all 15 High and all 108 Medium findings fixed; the Critical one waits for a production change (R-07); Low findings and ideas deferred | pull requests 54–56, 58–60 |
| Translation | every user-facing message has Vietnamese and English; `MessagesTest` and `i18n:check` fail on a missing text | 323 Vietnamese messages | `tools/docs/data/messages.json` |
| Security | roles and permissions checked on the server for every endpoint; scope by Block | 37 permissions | Report 3 |
| Demo data | demo stages 0, A, B and C reproduce the main flows; the demo reset never runs in production unless `DEMO_TOOLS` is set | – | `backend/CLAUDE.md` |

**Defect handling.** A defect is a finding (id, severity, file, scenario, fix) in the review files; it becomes a branch, then a pull request, then a verified fix. The Project Tracking workbook (sheet Defects) lists them all.

### 2.3 Training Plan

Each member has to hold the knowledge of the areas in section 4. The technologies of the project and who applies them:

| Technology | Used for | Mainly applied by |
|---|---|---|
| Java 21, Spring Boot 4, Spring Security, JDBC | REST API, services, security | Trung, Lộc, Luân |
| PostgreSQL 17, Flyway, Testcontainers | schema, migrations, integration tests | Trung, Lộc |
| React, Vite, Tailwind, TanStack Query | web app | Trung, Lộc, Luân |
| Flutter and Dart | student mobile app | Duy |
| Docker Compose, GitHub Actions, Caddy, Azure, Vercel | deployment and CI | Trung |
| Firebase Cloud Messaging, SMTP, VietQR, Ollama | push, email, payments, assistant | Trung, Luân |

The team learned by working on the code and by reviewing each other's pull requests. Before the defense each member prepares a short explanation of their areas and of one workflow end to end (the sequence diagrams of Report 4 are the aid). Attendance of any formal training session is not recorded in the repository (see `docs/SEP490_Report/TEAM-TODO.md`).

## 3. Project Deliverables

| # | Deliverable | Form | Due / milestone | Status on 23/11/2026 |
|---|---|---|---|---|
| 1 | Capstone project register (registration form) | `docs/Topic` | Review 1 | in `docs/Topic` |
| 2 | Reports 1–5 (introduction, project plan, SRS, SDD, test documentation) | Word and PDF in `docs/SEP490_Report` | Review 2, rebuilt for Defense 1.1 | rebuilt from the code |
| 3 | Reports 6–7 (user guide, final report) | same | Defense 1.1 | in preparation |
| 4 | Review forms (BM01 design brief, BM02 self-review, BM03 record of changes, BM04 commitment) | `docs/SEP490_R2_BM04_Review2-Document` | Defense 1.1 | to be filled from the code |
| 5 | Project Tracking, Project Weekly Report, Project Schedule | Excel and PDF | Review 2 and Defense | updated from the history |
| 6 | Test Report and Unit Test workbook | Excel | Defense 1.1 | from the test runs of 23/11/2026 |
| 7 | Diagrams | draw.io and PNG in `docs/Diagrams`, one folder per diagram type | with Reports 3–4 | 109 diagrams |
| 8 | Source code | GitHub repository `tisou47/CampusStay-FPT` (backend, web, mobile, infra, docs) | continuous | on `main` |
| 9 | Running system | Vercel (web) and Azure (API, PostgreSQL) | continuous | in production |
| 10 | Android application | release on GitHub | Defense 1.1 | to be released |

## 4. Responsibility Assignments

Roles accepted by the team on 23/11/2026, and the areas each member mainly wrote. The percentages are the share of changed lines of each area on `main` (`git log --numstat`); they show who knows an area best, not who is "responsible" for it alone.

| Member | Role | Main areas |
|---|---|---|
| Lê Thành Minh Trung | Leader, project manager, business analyst, full-stack developer, DevOps | requirements and architecture; backend of Applications, Assignment, Billing, Terms and settings, Inventory, Requests, Reports, Notifications and Accounts; web registration, admin, manager and staff pages; CI/CD and production; reviews and merges |
| Nguyễn Xuân Lộc | Full-stack developer | check-in hand-over, utility billing and check-out; Maintenance; web common, staff and student pages; shared components |
| Võ Minh Luân | Full-stack developer | Staff shifts, workload and week schedules; Family Day; the AI assistant; Admin screens |
| Trần Võ Quang Duy | Mobile and web developer | the Flutter student app; web transition pages |

@include _ownership.md

## 5. Project Communications

| What | Who | How | When |
|---|---|---|---|
| Supervisor meeting (progress, feedback) | Ms Thân Thị Ngọc Vân and the team | Google Meet | weekly |
| Team meeting | the team | offline, one a week | weeks 1–8 |
| Team meeting | the team | online, two a day | from week 9 to the defense |
| Daily coordination | the team | Zalo or Messenger, Discord | daily |
| Code and review | the team | GitHub pull requests; the leader merges | per change |
| Documents | the team | Google Drive (the source), mirrored into `docs/` | per change |
| Review and defense | the team, reviewers | Review 1 (30/09/2026), Review 2 (31/10/2026), Defense 1.1 (December 2026) | milestones |

Meeting minutes and attendance are not kept in the repository; the weekly report records the status of each week.

## 6. Configuration Management

### 6.1 Document Management

- The documents live in Google Drive (the source). `tools/sync-docs.ps1` mirrors them into `docs/` of the repository; the change history and the Decision Log are in `docs/CHANGELOG.md`.
- Reports 1–7 are generated: the generators in `tools/docs` read the code and write `tools/docs/data/*.json`; the text is in `tools/docs/src/*.md`; Word pours it into the school's template in place, and `tools/docs/check-docx.ps1` checks the result.
- Every document has a Record of Changes (date, kind of change, who, what). The previous versions of a document stay in git.
- Diagrams are draw.io files with their PNG beside them, one folder per type (context, use case, architecture, package, ERD, class, sequence, state machine, activity, screen flow).
- Review versions are frozen by a git tag (`review-2`).

### 6.2 Source Code Management

- One repository (`tisou47/CampusStay-FPT`): `backend/`, `web/`, `mobile/`, `docs/`, `tools/`, `infra/`, `postman/`.
- Branches off `main`, pull requests, CI checks, merge by the leader; commit messages follow `type(area): subject` (for example `feat(bil): …`).
- Secrets are never committed (`.env`, keys, the Firebase file); production settings are on the server in `/opt/campusstay/.env`, and `infra/prod/.env.example` lists them.
- 33 branches of members are kept unmerged and listed in `review/branches.md`; merged branches are deleted.

### 6.3 Tools & Infrastructures

| Purpose | Tool |
|---|---|
| Backend | Java 21, Spring Boot 4, Maven, PostgreSQL 17, Flyway |
| Web | React, Vite, Tailwind, Vitest |
| Mobile | Flutter and Dart (Android 8.0 and later) |
| CI/CD | GitHub Actions (`backend.yml`, `web.yml`), GHCR |
| Production | Vercel (web), Azure VM with Docker Compose and Caddy (API), Azure Database for PostgreSQL |
| Environments | local (`docker compose`: PostgreSQL and Mailpit), Vercel previews per pull request, production |
| Tests | JUnit 5, Testcontainers, Vitest, Flutter test |
| API | OpenAPI and Swagger UI, the Postman collection `CampusStay API` generated from the OpenAPI |
| Documents | Word and Excel (COM), draw.io, Google Drive |
| Communication | Zalo or Messenger, Google Meet, Discord |
| AI tools | Claude Code (repository work, reviews), a self-hosted Ollama model (the students' assistant) |
