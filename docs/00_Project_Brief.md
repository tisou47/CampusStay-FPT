# 00 — CampusStay FPT Project Brief (Source of Truth)

| Field | Value |
|---|---|
| Version | 1.5 |
| Last updated | 24/10/2026 (Week 7, Sprint 4) |
| Owner | Tisou (Team Leader) |
| Status | Every endpoint of the mentor-confirmed contract (+ ADR-13…18) is built: 162 endpoints, 161 verified by integration tests, all used by the web app (since Change Spec v2 phase 1 the four assignment-approval endpoints stay but are no longer called, C-38). Production runs since 23/10/2026 (web on Vercel, API and database on Azure, ADR-16, ADR-18); see §8a. Sign-in by email (ADR-13) to be confirmed with the mentor (OI-14). **24/10/2026: Change Specification v2 approved** (`docs/01_Change_Spec_v2.md`, ADR-19…27): roles, Term lifecycle with renewal, payments, door codes, furniture, two languages and a new UX, built in 8 phases. Phases 1–3 are in `main` and production (phase 2 "Accounts" and phase 3 "Inventory" merged and deployed on 25/10/2026, Google sign-in switched on); phase 4 "Registration periods" (Managers' requests, the Term wizard with prices fixed per Term, announcements and the dormitory board, grouped configuration, rules screens) is built on `feat/v2-phase4` (26/10/2026) and waits for the merge |

> This file overrides the original registration form (`Ref_Original_Proposal_FA26SE260`). Update this file whenever a decision changes scope, architecture, schedule or conventions, and add a Decision Log entry.
>
> Detailed backend design: `docs/backend/01_Backend_Architecture.md` (endpoints `02_Endpoint_Map.md`, contract changes `03_API_Contract_Changes.md`, tests `04_Test_Catalog.md`). Web API contract: `docs/api-contract.md`. Web screens: `docs/web/01_Screen_Map.md`. Production runbook: `infra/prod/README.md`.

---

## 1. Project identity
- **English name:** CampusStay FPT — Dormitory Registration and Room-Scheduling Management System for FPT University's Tân Uyên Campus, Bình Dương
- **Vietnamese name:** CampusStay FPT — Hệ thống quản lý đăng ký ký túc xá và sắp xếp phòng tại cơ sở Tân Uyên (Bình Dương) của Đại học FPT
- **Topic code:** FA26SE260
- **Program:** Software Engineering capstone, FPT University, Fall 2026
- **Report and defense language:** English

## 2. Problem and value
FPT University's Tân Uyên campus is brand new. It has no legacy paper-based dormitory process to migrate from, but also no dedicated digital system for dormitory registration, room and bed allocation, fee payment and maintenance once the dormitories open. The project builds that system before operations ramp up, so the dormitory can run digitally from day one without licensing a costly international platform (e.g., StarRez).

**Out of scope:** replacing FPT's central student information system (SIS); tuition processing. Fee collection is limited to dormitory charges: Deposit, Balance (term room price), Room-Change difference, and Utility (electricity and water) with a Utility Deposit (ADR-12).

## 3. Actors and confirmed features
Scope below is confirmed by the mentor through the API contract and UI (ADR-12). One Application covers exactly one Term; Period of Stay and renewal are removed.

> **Change Specification v2 (approved 24/10/2026, ADR-19…27):** `docs/01_Change_Spec_v2.md` §3 replaces the actor descriptions below as its phases are built: Managers work for every Block, Staff for their Blocks; students choose *Gia hạn* (1–9 Terms) and continue from Term to Term; payments are confirmed by hand; door codes, furniture and two languages are added. Until a phase is merged, this section describes the running system.

### 3.1 Student (Resident) — Web + Mobile (Android)
1. Submit an Application for the upcoming Term only (the system sets the Term; the student cannot choose it): eligibility check → Room Type + Room Class → roommate step → contact → consent.
2. Choose a **Room Type** (2/4/6 Beds) and **Room Class** (Basic/Standard/Premium); never a specific Room or Bed (ADR-06).
3. 2-bed Room Types: invite one roommate by student code (mutual confirmation within a time window; each pays their own Deposit) or *Match me automatically* with optional free Roommate preferences (region, semester, major). 4/6-bed Room Types are always auto-matched.
4. Pay the Deposit to move the Application into processing; pay the Balance, Utility and Room-Change Invoices via VietQR; download receipts.
5. Respond to Round-2 offers when waitlisted.
6. View Allocation, roommates, check-in window; submit Maintenance Requests (with photos) and Room-Change Requests; post on the swap board and accept swap invitations.
7. Mobile: tracking (Allocation, Invoices, Applications, requests), push notifications and check-in pass. Submissions (registration, Room-Change, Maintenance) happen on the web.

### 3.2 Dormitory Staff / Residence Life Officer — Web
1. Review Applications (single and bulk), confirm payments manually (with receipt), run the assignment engine (dry-run and real), resolve conflicts and submit proposals per Block.
2. Manage Rooms and Beds: out-of-service / back-in-service.
3. Process Maintenance Requests (priority, assignee, visit window, public/internal updates).
4. Decide Room-Change Requests (choose the target Bed) and swaps.
5. Desk: Check-in (lookup by code, name or QR pass; hand-over items) and Check-out (meter reading, condition, key, damage, refund settlement).
6. Enter or import monthly meter readings and close meter periods (issues Utility Invoices); run room inspections.

### 3.3 Block Dormitory Manager — Web (scoped to their Blocks)
1. Approve or return assignment proposals per Block; decide late check-ins, refunds and swaps.
2. Monitor Block finance (collections, overdue, reminders) and Block reports/exports.
3. Manage Block staff (handles, on duty, account requests), routing rules and SLA timers; handle escalations (reassign, temporary Bed).
4. Configure Block settings (desk hours, visiting hours, quiet hours, house rules) and inspection schedules.

### 3.4 Administrator — Web
1. Configure Terms (timeline and publish), Room Types, Room Classes, fees and refund rules, utility pricing, eligibility criteria and priority groups, matching criteria (order, weights, boost) with preview, system parameters.
2. Manage Buildings, Floors and bulk Room creation; manage users, roles and Block scope; view the permission matrix.
3. Manage notification templates (EN/VI) and send email campaigns; manage inspection checklists.
4. Export occupancy and financial reports; read the Audit Log.

### 3.5 System (automated)
- Rule-based batch room-assignment engine (hard constraints, ordered criteria, weights, Roommate-preference boost, conflicts flagged for Staff).
- Scheduled jobs: Deposit window and roommate invitation expiry, overdue Invoices and reminders, SLA timers and escalations, Round-2 offer expiry, inspection runs.
- Push notifications via Firebase Cloud Messaging; in-app notifications; email via SMTP.
- VietQR payment with automatic confirmation from the SePay bank-feed webhook; manual Staff confirmation as fallback.

## 4. MVP prioritization (MoSCoW) — build order
All items below are in scope (mentor-confirmed). MoSCoW now sets the **build order** and what is cut first if time runs out.

| Priority | Items |
|---|---|
| **Must** | Auth (email/password + Google @fpt.edu.vn) + RBAC with Block scope; Audit Log; Terms / Room Types / Room Classes / fees / eligibility / matching configuration; Building–Floor–Room–Bed inventory; Application wizard incl. roommate invitation; Deposit + Balance Invoices with VietQR (SePay) and manual confirmation; assignment engine + conflict resolution + per-Block commit + Manager approval; Check-in / Check-out; Maintenance Request lifecycle; in-app + push notifications; occupancy and financial reports and exports |
| **Should** | Room-Change Requests; swaps and swap board; Round-2 offers; refunds; late check-ins; routing rules, SLA timers and escalations; meter readings and Utility Invoices; Block settings and Block staff; dashboards (Staff, Manager, Admin) |
| **Could** | Room inspections (schedules, checklists, runs); email campaigns; notification-template editor; AI feature |
| **Won't (this term)** | Real FPT SIS integration (mock enrollment data); SMS gateway; occupancy forecasting; tuition; Period of Stay / renewal; Room or Bed self-selection; iOS app |

## 5. Technology stack
| Layer | Choice |
|---|---|
| Web client | React 19 + Vite 8 + Tailwind CSS 4, React Router, lucide-react (JavaScript/JSX, OI-11) |
| Mobile client | Flutter (Dart, null-safe), Android only |
| Backend | Spring Boot 4.1.x, Java 21, Maven, REST API (ADR-04) |
| Database | PostgreSQL 17, Flyway migrations (ADR-11) |
| Code structure | Layered Spring MVC: controller → service → repository / entity (ADR-17) |
| Assignment engine | Rule-based batch engine inside the backend (feature `assignment`, code ASG) |
| Notifications | Firebase Cloud Messaging (firebase-admin), in-app, SMTP email (ADR-09) |
| Payment | VietQR via SePay bank-feed webhook; mock gateway; manual confirmation (ADR-08) |
| Packaging / deploy | Docker, Docker Compose; web on Vercel, API + PostgreSQL on one Ubuntu VPS behind Caddy, GitHub Actions → GHCR (ADR-16) |
| Tooling | GitHub, GitHub Projects, Google Docs / Word, IntelliJ IDEA + Claude Code (backend), VS Code + Claude Code (web) |

## 6. Architecture baseline
**Decision (ADR-01): Monolith.** One Spring Boot deployable, one PostgreSQL database. **Code structure (ADR-17, replaces the package-by-module layout and ADR-10):** layered Spring MVC packages — `controller` (REST endpoints), `service` (business rules, one sub-package per feature), `repository` / `entity` (persistence), plus `dto`, `event`, `config`, `security`, `exception` and `common`. Features use each other through service interfaces or domain events, and each table is written only by the feature that owns its prefix.

Rationale: 16-week term, effectively one developer, three clients sharing one API, strong transactional needs (Allocation and Payment must be consistent). Microservices would add distributed transactions, service discovery, multiple deployments and DevOps cost with no grading benefit. The standard Controller → Service → Repository layout is what the team and the council read fastest.

**Backend features (codes):** AUTH, CFG, INV, APP, ASG, BIL, REQ, MNT, NTF, RPT (+ `common`, not a business feature; its tables keep the `shared_` prefix). The codes are the table prefixes and the test case ids (`TC-<CODE>-NNN`); the code packages use the feature names (`service/billing` for BIL, ADR-17). Contract areas map onto these codes without new codes:

| Contract area | Feature (code) |
|---|---|
| Sign-in, users, roles, Block scope, permissions, Audit Log | AUTH (Audit Log in `common`) |
| Terms, Room Types/Classes, fees, refund rules, utility pricing, eligibility, matching, system parameters, Block settings | CFG |
| Buildings, Floors, Rooms, Beds, out-of-service | INV |
| Applications, roommate invitations, Round-2 offers | APP |
| Assignment runs, proposals, conflicts, commit/approval, Allocation, Check-in / Check-out, late check-ins | ASG |
| Invoices, Payments, VietQR/SePay, refunds, meter readings, Utility Invoices, overdue reminders | BIL |
| Room-Change Requests, swaps, swap board, routing rules, SLA timers, escalations | REQ |
| Maintenance Requests, inspections (schedules, checklists, runs) | MNT |
| In-app/push notifications, templates, device tokens, email campaigns | NTF |
| Dashboards, reports, exports | RPT |

Key design principles:
- No Room/Bed self-selection (ADR-06). Double-booking is prevented at DB level: a partial unique index allows one active Allocation per Bed and one active Allocation per student per Term; commits, Room-Change decisions and swaps lock the affected Beds (`SELECT … FOR UPDATE`) inside one transaction.
- External systems sit behind interfaces or one adapter class each: `EmailSender` (SMTP; without a mail host it only logs the subject; `MAIL_REDIRECT_TO` sends the emails of fictional accounts to one mailbox on the demo server, while real accounts receive their own, spec O-3), `PushSender` (`FcmPushSender`, FCM HTTP v1; without Firebase credentials pushes are dropped), `FileStore` + `FileLinks` (files on a local volume, short-lived signed links), `GoogleIdTokenVerifier` + `GoogleCodeExchanger` (Google sign-in), `SepayInbox` + `BankFeedRetryJob` (SePay webhook inbox, matching retried every minute) and the payment simulator of demo servers (A-08). The student directory is seeded data (mock SIS, ADR-02).
- Assignment engine runs as a triggered batch job per Term: eligibility filter → hard constraints (gender, Block, capacity, roommate pairs) → ordered criteria and weights → proposal → Staff conflict resolution → Manager approval per Block → commit. Conflicts are flagged, not silently resolved. Each run stores the matching-criteria snapshot it used.
- No hard-coded business values: every amount, rate, window and limit is Admin configuration.

## 7. Team (for documentation)
4 members. Tisou: Team Leader, Project Manager, Business Analyst, Frontend and Backend developer. Team composition: 2 Backend, 2 Frontend (Tisou counted in both).

| ID | Member | Role in documents |
|---|---|---|
| M1 | Tisou | Leader, PM, BA, Full-stack |
| M2 | (name TBD) | Backend Developer |
| M3 | (name TBD) | Frontend Developer — Web (ReactJS) |
| M4 | (name TBD) | Frontend Developer — Mobile (Flutter) |

> Assumption to confirm: M4's role. This table gives 2 BE (M1, M2) and 3 FE (M1, M3, M4).

Mentor: Thân Thị Ngọc Vân (Supervisor). No special process requirements.

## 8. Schedule
Assumption: Week 1 starts Monday 07/09/2026; 16 weeks end Sunday 27/12/2026.
Note: the original registration form states a duration of 09/2026 to 03/2027 — confirm the official defense date.

| Sprint | Weeks | Dates | Notes |
|---|---|---|---|
| S1 | W1–W2 | 07/09 – 20/09/2026 | |
| S2 | W3–W4 | 21/09 – 04/10/2026 | |
| S3 | W5–W6 | 05/10 – 18/10/2026 | Review 1 done (date TBD); Figma UI + web front end built |
| S4 | W7–W8 | 19/10 – 01/11/2026 | Current sprint. Done by 24/10: backend architecture and database, all build slices S0–S7 of the endpoint map, web connected to every endpoint, production on Vercel + Azure (§8a) |
| S5 | W9–W10 | 02/11 – 15/11/2026 | |
| S6 | W11–W12 | 16/11 – 29/11/2026 | |
| S7 | W13–W14 | 30/11 – 13/12/2026 | |
| S8 | W15–W16 | 14/12 – 27/12/2026 | Final submission |

Council reviews: Review 1 (done, date TBD), Review 2 (expected 27/10 – 03/11/2026, exact date TBD), Review 3 (date TBD), Final defense (date TBD).

The build slices S0–S7 of `docs/backend/02_Endpoint_Map.md` are groups of endpoints, not these sprints.

## 8a. Current status (24/10/2026)
| Area | State |
|---|---|
| Backend | 181 endpoints (S0–S7 and v2 phases 1–2), all verified (`POST /auth/google` also by hand with a real `@fpt.edu.vn` account on production, 25/10/2026), 37 Flyway migrations, 173 automated tests (`docs/backend/04_Test_Catalog.md`) |
| Web | 83 routes for the public pages and the four roles (11 new: Set a password, Account verification, Students and the student hub for Staff, Managers and the Admin, Import student list, Staff accounts) (`docs/web/01_Screen_Map.md`); Student portal also on phones and tablets. Open: recording a late check-in at the Check-in desk (A-12) and two texts that promise more than the backend does (C-31, C-34), see `03_API_Contract_Changes.md` |
| Production | Web https://campusstay-fpt-ten.vercel.app (Vercel), API https://campusstay-api.eastasia.cloudapp.azure.com/api (Azure for Students VM, managed PostgreSQL); every push to `main` deploys (ADR-16, ADR-18, root `CLAUDE.md`); runs as a demo with the payment simulator and the base data. Google sign-in is on since 25/10/2026 (spec P-1). **Not configured yet:** SMTP and the email redirect (emails are only logged, so password-reset and invitation emails do not arrive), SePay, Firebase (architecture §14.1) |
| Android app | Not started: device-token endpoints, push and the check-in pass payload are ready on the backend (A-05, A-06, A-11) |
| Next | Change Specification v2 (`docs/01_Change_Spec_v2.md` §16): phase 1 (role model, two languages, design system and menus) built on `feat/v2-phase1` and merged into `main` 24/10/2026 (production); phase 2 (accounts) built on `feat/v2-phase2` and merged into `main` 25/10/2026 (production, Google sign-in on); phase 3 (inventory: Room Class per Room per Term, furniture and Room Class requirements, door codes) built on `feat/v2-phase3` and merged into `main` 25/10/2026 (production, `DOOR_CODE_KEY` set on the VM); phase 4 (registration periods: Managers' requests, the Term wizard, announcements and the board, grouped configuration, rules screens) built on `feat/v2-phase4` on 26/10/2026, not merged yet; next phase 5 (money and residence); each phase reaches `main` only when complete (ADR-27). Production email (P-2); the Android app after phase 6; Reports 1–7 (§9); OI-08, OI-09, OI-12, OI-14, OI-15 |

## 9. Required deliverables
Per the school template set (SEP490 Student Guide): Reports 1–7 (Project Introduction, Project Management Plan, SRS, SDD, Test Documentation, User Guides, Final Project Report), plus Project Tracking, Unit Test and Test Report workbooks, source code, database scripts (Flyway migrations) and defense slides.

## 10. Open issues and decisions
| ID | Item | Status |
|---|---|---|
| OI-01 | Fees vs finance boundary | **Closed 20/10/2026:** Admin configures fees, refund rules (with approver per rule) and utility pricing; Manager monitors Block finance, sends reminders and decides refunds for their Block; Admin exports the campus financial report. |
| OI-02 | Staff "related operational work" | **Closed 20/10/2026:** Check-in/Check-out desk, manual payment confirmation, meter readings, room inspections, Room out-of-service. |
| OI-03 | Roommate selection mechanics | **Closed 20/10/2026:** 2-bed only; invite by student code with a privacy-safe check (same answer for every unusable code, limited attempts); partner accepts within `roommateHours`; each pays their own Deposit; otherwise auto-match with optional Roommate preferences. |
| OI-04 | Room Type vs Room Class | **Closed 20/10/2026:** Room Type = number of Beds with a base term price; Room Class = Basic/Standard/Premium with a surcharge rate set per Floor; term price = base price × (1 + surcharge rate), rounded per system parameter. **Revised by ADR-24 (built in v2 phase 3):** the Room Class is set per Room and per Term (the Floor's class only seeds new Rooms); prices unchanged. |
| OI-05 | Eligibility rules | **Partly closed:** Admin toggles eligibility criteria and priority groups; source data is the seeded student directory (mock SIS). Exact criteria list follows the Admin › Eligibility screen. |
| OI-06 | VietQR provider | **Closed 20/10/2026:** SePay bank-feed webhook (ADR-08). |
| OI-07 | Free deployment target with public HTTPS (needed for the SePay webhook) | **Closed 20/10/2026:** ADR-16 (runbook `infra/prod/README.md`); local Docker Compose + Cloudflare Tunnel stays the fallback |
| OI-08 | Official dates for Review 2, Review 3, final defense | Open (Review 2 expected 27/10 – 03/11/2026) |
| OI-09 | M4 role in team table | Open |
| OI-10 | Spring Boot version | **Closed 20/10/2026:** ADR-04 |
| OI-11 | Web app is JavaScript (JSX) with Tailwind CSS, while earlier documents say "ReactJS + TypeScript" and "Ant Design 5". Keep JS or migrate to TypeScript? | **Closed 20/10/2026:** keep JavaScript (JSX) + Tailwind CSS for this term; Reports 3 and 4 describe the actual stack (§5) |
| OI-12 | Personal-data regulation basis: Decree 13/2023/NĐ-CP has been replaced by the Personal Data Protection Law 91/2025/QH15 (effective 01/01/2026) and Decree 356/2025/NĐ-CP. Update NFRs and reports. | Open — documents to update |
| OI-13 | Bank account to link with SePay for the live demo (small real transfers) | **Closed 24/10/2026 (ADR-18):** the demo uses the payment simulator and Staff manual confirmation; SePay with a real account stays optional |
| OI-14 | The mentor-confirmed contract signs in with a username; ADR-13 changes it to the email (contract change B-02). Inform the mentor. | Open — owner: Tisou |
| OI-15 | Change Specification v2 changes mentor-confirmed scope: SePay (a Must item) removed, student sign-up, Managers no longer Block-scoped, renewal and the requests window, payments confirmed by hand (spec §17). Inform the mentor. | Open — owner: Tisou |

## 10a. Repository layout
One Git repository (monorepo, ADR-05) with `backend/` (Spring Boot API), `web/` (React web app), `docs/` (this Brief, the Change Specification v2 `docs/01_Change_Spec_v2.md`, the API contract `docs/api-contract.md`, the backend design in `docs/backend/`, the web screen map in `docs/web/` and the generator of the test catalog and screen map in `docs/tools/`), `infra/` (Docker Compose; `infra/prod/` is the production stack), `.github/workflows/` (CI/CD) and `postman/`. `mobile/` (Flutter) is added when the Android work starts. This Brief is kept at `docs/00_Project_Brief.md` as the single source and re-uploaded to the Claude Project whenever it changes.

## 11. Decision Log
| ID | Date | Decision | Reason |
|---|---|---|---|
| ADR-01 | 14/10/2026 | Monolith architecture (one deployable, one database); its package-by-module layout is replaced by ADR-17 | See §6 |
| ADR-02 | 14/10/2026 | Real SIS integration replaced by mock enrollment data (seeded student directory) | No access to FPT SIS; keeps interface for future integration |
| ADR-03 | 14/10/2026 | Scrum, 2-week sprints, 8 sprints | Matches 16-week term |
| ADR-04 | 20/10/2026 | Spring Boot 4.1.x on Java 21, Maven | 3.5 left OSS support on 30/06/2026; 4.1 is GA and no backend code existed, so no migration cost |
| ADR-05 | 14/10/2026 | Monorepo (backend, web, mobile, docs, infra) | One CLAUDE.md, API contract and clients change in one PR |
| ADR-06 | 20/10/2026 | Students choose Room Type + Room Class only; Rooms/Beds are assigned by the engine and Staff | Matches UI; fairness and gender/Block constraints are easier to guarantee centrally; removes self-selection race conditions |
| ADR-07 | 20/10/2026 | Opaque server-side session tokens (random 256-bit, SHA-256 hash stored, sliding expiry); sign-in by email/password or Google ID token restricted to `hd=fpt.edu.vn`; no self sign-up | Contract uses one bearer token and "401 signs out"; instant revocation on sign-out and account changes; no key management |
| ADR-08 | 20/10/2026 | VietQR payment via SePay webhook (API-key auth, dedup on SePay transaction id, match by unique transfer content); `MockPaymentGateway` for dev; manual Staff confirmation as fallback | Automatic confirmation without a merchant contract; money goes straight to the bank account; resilient demo |
| ADR-09 | 20/10/2026 | Email through an `EmailSender` port with SMTP adapter: Mailpit in development, Gmail SMTP with App Password for the demo | Free; Gmail personal limit (500 messages/day) is enough for a demo; provider can be swapped |
| ADR-10 | 20/10/2026 | ~~Spring Modulith verifies module boundaries~~ (superseded by ADR-17); contract areas mapped onto the 10 module codes, which stay as table prefixes and test ids | Made "strict boundaries" testable; keeps ID conventions stable |
| ADR-11 | 20/10/2026 | PostgreSQL 17 with Flyway SQL migrations; JPA for CRUD, `JdbcClient` SQL for reports and batch | Migrations double as the "Database Script(s)" deliverable; SQL gives control over report queries |
| ADR-12 | 20/10/2026 | Scope extended to the mentor-confirmed API contract: utility billing, swaps, Round-2 offers, refunds, late check-ins, routing/escalation, inspections, email campaigns; Period of Stay and renewal removed | Mentor confirmation after UI review |
| ADR-13 | 20/10/2026 | Password sign-in uses the account **email** and CampusStay's own password (ADR-07); the contract's `username` becomes `email` (B-02). The web app gets Forgot password, Reset password, Set password (invitation) and Change password pages | CampusStay has no access to FPT accounts (ADR-02), so it keeps its own passwords; asking for the Wi-Fi username would suggest typing the FPT password into another system; reset links and invitations are sent by email anyway |
| ADR-14 | 20/10/2026 | `POST /auth/google` accepts either an authorization `code` (web popup, keeps the custom Google button of the approved design) or an ID token `credential` (Android). The server exchanges the code with Google using a client secret, then verifies the ID token the same way in both cases (`hd = fpt.edu.vn`) | The web keeps its Figma design; Android's Google Sign-In returns an ID token; the client secret stays on the server |
| ADR-15 | 20/10/2026 | IDs are **strings** in JSON: every field named `id` or ending in `Id` (B-03, replaces clarification C-01). Java keeps `long`, the database keeps `BIGINT`; amounts and counts stay numbers | URL parameters, `<select>` values and browser storage are strings, so clients compare IDs without conversion; the contract examples already used strings |
| ADR-16 | 20/10/2026 | Deployment: the web app on **Vercel** (Hobby, Git integration, a preview per pull request); the API and PostgreSQL 17 on one **Ubuntu VPS** (x86-64, 2 vCPU / 4 GB recommended, any provider) with Docker Compose and Caddy (Let's Encrypt HTTPS). GitHub Actions runs `mvn verify`, builds the amd64 image to GHCR and deploys over SSH; daily `pg_dump` on the VPS. CORS takes origin patterns so Vercel previews can call the API. *Revised 22/10/2026:* the Oracle Cloud Always Free VM first chosen was dropped because sign-up failed at the card check. Target: an **Azure for Students** VM (B2ats v2 or B2pts v2 in the free hours) with **Azure Database for PostgreSQL** Flexible B1ms (free for 12 months), or any VPS with Postgres in the stack (runbook appendix A). *Live 23/10/2026:* Azure VM `campusstay-vm` (East Asia, B2ats v2) + Azure Database for PostgreSQL (runbook appendix A, layout A); API `https://campusstay-api.eastasia.cloudapp.azure.com/api`, web `https://campusstay-fpt-ten.vercel.app` | A VPS never sleeps, so the 30-second email outbox job, the local `FileStorage` volume and Gmail SMTP work unchanged, and the SePay webhook gets a stable HTTPS URL (OI-07); a small plan costs a few dollars a month and a Vietnamese provider takes bank transfers. Vercel cannot host the long-running Spring Boot process; free PaaS tiers sleep, block SMTP or expire their database |
| ADR-17 | 22/10/2026 | Backend code in layered Spring MVC packages (`controller`, `service`, `repository`, `entity`, `dto`, `event`, `config`, `security`, `exception`, `common`; feature sub-packages inside the layers) instead of ten module packages; Spring Modulith removed, `LayeringTest` checks that calls go controller → service → repository | The standard layout is easier for the team and the council to follow than modules with hidden `internal`/`web` folders; classes moved without behaviour changes |
| ADR-18 | 24/10/2026 | The production server runs as a demo: `PAYMENT_SIMULATOR=true` (and `VITE_PAYMENT_SIMULATOR` on Vercel) enables the payment simulator (A-08) outside the dev profile, and `MAIL_REDIRECT_TO` sends every email to the team mailbox. Firebase push is set up together with the Flutter app. Every change that passes its checks is pushed to `main` and deploys itself (root `CLAUDE.md`) | No bank account or SePay contract is needed to show the payment flow; the 6,200 seed accounts have fictional `@fpt.edu.vn` addresses, so redirecting mail keeps it away from strangers and inside the 500-a-day Gmail limit, and lets the council follow every email in one inbox |
| ADR-19 | 24/10/2026 | Managers work for the whole dormitory (no Block scope); Staff stay scoped to their Blocks; Managers review Applications, run and commit the assignment, confirm payments and issue next-Term fees; room changes and swaps inside one Block are decided by its Staff, across Blocks by a Manager (spec D-09, D-10, §3) | The dormitory has several Managers with the same responsibilities across Blocks; Block-level work (desk, rooms, maintenance, utility) belongs to the Staff |
| ADR-20 | 24/10/2026 | Registration periods: a Manager requests a Term with dates, rooms and prices; the Admin builds it in a wizard with prices per Term, Rooms and places, rules and house rules; publishing and every later money or policy change create announcements on the students' board (spec D-08, D-10, D-11, D-25). *Built 26/10/2026 (phase 4, branch `feat/v2-phase4`):* one open request per Term, answered In progress, Needs changes or Rejected, Done when its Term is published; the wizard saves a Draft after each step and asks a reason for every value that differs from the request; publishing fixes the Term's price table, Deposit, Utility Deposit, eligibility switches, priority-group order and matching snapshot, which every reader then asks the Term for; afterwards a passed date is fixed, an open deadline only moves later and money locks with the first Invoice; Blocks used and Rooms left out bind the assignment and Round 2; renewal milestones are stored, optional until phase 6 uses them; Room Classes per Room stay Manager work (Room Classes by Term) | Managers decide the business values, the Admin the configuration; prices fixed per Term stop default-price edits from changing a running Term; students see every change |
| ADR-21 | 24/10/2026 | *Gia hạn* (1–9 Terms) on the Application; continuing residents keep their Bed into the next Term; a requests window (room change, swap, Room Class change with every continuing resident's consent, extension, end of stay) is decided before the next-Term fees; changes take effect next Term without price differences; enrollment reconciliation each Term. Amends ADR-12 (spec D-03, D-04, D-13…D-15, D-28…D-31) | Real dormitories renew residents; billing the next Term on the next Bed removes prorated charges and credits and their loopholes |
| ADR-22 | 24/10/2026 | Payments: the student claims "I have transferred", which stops the deadline; Managers confirm in bulk or reject. SePay, the bank-feed inbox and the payment simulator are removed. Supersedes ADR-08 and the simulator part of ADR-18 (spec D-12) | No bank account or merchant contract exists; one manual path is simpler to demo, test and explain than three |
| ADR-23 | 24/10/2026 | Door codes: one 6-digit code per Room set by the Block's Staff, released to a resident once paid, from the check-in start and after it is confirmed on the lock; rotated whenever someone leaves; stored encrypted, every view audited. Paying the Balance makes a student a resident; an unpaid Balance forfeits the Deposit and the Bed unless an approved late check-in runs (spec D-18…D-20). *Built 25/10/2026 (phase 3):* codes AES-256-GCM with `DOOR_CODE_KEY`, proposed → confirmed on the lock → retired; check-out and moves to another Room open a rotation task for the Block's Staff; until phase 5 releases codes on payment, a student sees the code of the Room they are checked in to | The code is the real key to the Room; releasing and rotating it is what stops people staying without paying |
| ADR-24 | 24/10/2026 | Room Class per Room per Term, defined by required furniture; every furniture item tracked with its location, status and moves. Revises OI-04 (Room Class per Floor) (spec D-03, D-21). *Built 25/10/2026 (phase 3):* a class set for a Term holds for the later Terms until another is set; it can be set only for a Term not started and only on Rooms whose Beds nobody holds yet for that Term or later, so no price ever changes after it was given; Room Class requirements list the class-defining furniture each class needs, and conformance is shown per Room | Furniture is moved between Rooms; the class must follow what a Room really has |
| ADR-25 | 24/10/2026 | Vietnamese (default) and English for the web, API messages, notifications and emails; the language is saved on the account; typed text stays as typed (spec D-01) | Students and staff work in Vietnamese; the reports and the council use English |
| ADR-26 | 24/10/2026 | Students sign up with Google (`@fpt.edu.vn`): the first sign-in creates the account and asks for a password; the account is verified against the student list imported by Managers, otherwise it waits for a Manager. Amends ADR-07 "no self sign-up" (spec D-05, D-07). *Built 25/10/2026 (phase 2):* a real student who needs a student code that a fictional base-data account holds takes it, and the fictional account continues as `DEMO-<code>`; an import line verifies a waiting account only when its email is the file's or ends with the code; only fictional accounts' emails go to the demo mailbox (O-3) | Real students can join without anyone creating accounts; verification keeps gender, student code and enrollment trustworthy |
| ADR-27 | 24/10/2026 | Demo data comes from an Admin reset tool with three stages, only on the demo server. Until Review 2 each v2 phase is built on its own branch (`feat/v2-phase<n>`) and merged into `main` only when complete and the demo still works; documentation and urgent fixes go to `main` directly (spec D-23, O-1) | Time-dependent states cannot all exist on one date; production must stay demoable while the change is built |
