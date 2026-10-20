# 00 — CampusStay FPT Project Brief (Source of Truth)

| Field | Value |
|---|---|
| Version | 1.1 |
| Last updated | 20/10/2026 (Week 7, Sprint 4) |
| Owner | Tisou (Team Leader) |
| Status | Aligned with the mentor-confirmed API contract and UI; backend started |

> This file overrides the original registration form (`Ref_Original_Proposal_FA26SE260`). Update this file whenever a decision changes scope, architecture, schedule or conventions, and add a Decision Log entry.
>
> Detailed backend design lives in `docs/backend/01_Backend_Architecture.md`. The web API contract lives in `docs/api-contract.md`.

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

### 3.1 Student (Resident) — Web + Mobile (Android)
1. Submit an Application for the upcoming Term only (the system sets the Term; the student cannot choose it): eligibility check → Room Type + Room Class → roommate step → contact → consent.
2. Choose a **Room Type** (2/4/6 Beds) and **Room Class** (Basic/Standard/Premium); never a specific Room or Bed (ADR-06).
3. 2-bed Room Types: invite one roommate by student code (mutual confirmation within a time window; each pays their own Deposit) or *Match me automatically* with optional free Roommate preferences (region, cohort, major). 4/6-bed Room Types are always auto-matched.
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
| Web client | React 19 + Vite 8 + Tailwind CSS 4, React Router, lucide-react (JavaScript/JSX, see OI-11) |
| Mobile client | Flutter (Dart, null-safe), Android only |
| Backend | Spring Boot 4.1.x, Java 21, Maven, REST API (ADR-04) |
| Database | PostgreSQL 17, Flyway migrations (ADR-11) |
| Module boundaries | Spring Modulith 2.1.x (verified by test) (ADR-10) |
| Assignment engine | Rule-based batch engine inside the backend (module ASG) |
| Notifications | Firebase Cloud Messaging (firebase-admin), in-app, SMTP email (ADR-09) |
| Payment | VietQR via SePay bank-feed webhook; mock gateway; manual confirmation (ADR-08) |
| Packaging / deploy | Docker, Docker Compose |
| Tooling | GitHub, GitHub Projects, Google Docs / Word, IntelliJ IDEA + Claude Code (backend), VS Code + Claude Code (web) |

## 6. Architecture baseline
**Decision (ADR-01): Modular monolith.** One Spring Boot deployable, one PostgreSQL database, strict module boundaries (package-by-module, modules talk via public service interfaces or domain events, no cross-module table access). Boundaries are enforced by a Spring Modulith verification test (ADR-10).

Rationale: 16-week term, effectively one developer, three clients sharing one API, strong transactional needs (Allocation and Payment must be consistent). Microservices would add distributed transactions, service discovery, multiple deployments and DevOps cost with no grading benefit. Clean module boundaries still demonstrate architectural maturity and keep a future split possible.

**Backend modules:** AUTH, CFG, INV, APP, ASG, BIL, REQ, MNT, NTF, RPT (+ `shared` kernel, not a business module). Contract areas map onto these codes without new codes:

| Contract area | Module |
|---|---|
| Sign-in, users, roles, Block scope, permissions, Audit Log | AUTH (Audit Log in `shared`) |
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
- External systems sit behind ports & adapters: `EnrollmentDirectory` (mock SIS data), `PaymentGateway` (SePay + mock), `PushSender` (FCM + log), `EmailSender` (SMTP), `FileStorage` (local volume), `GoogleIdTokenVerifier`.
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
| S4 | W7–W8 | 19/10 – 01/11/2026 | Current sprint: backend architecture, database, AUTH and core modules |
| S5 | W9–W10 | 02/11 – 15/11/2026 | |
| S6 | W11–W12 | 16/11 – 29/11/2026 | |
| S7 | W13–W14 | 30/11 – 13/12/2026 | |
| S8 | W15–W16 | 14/12 – 27/12/2026 | Final submission |

Council reviews: Review 1 (done, date TBD), Review 2 (expected 27/10 – 03/11/2026, exact date TBD), Review 3 (date TBD), Final defense (date TBD).

## 9. Required deliverables
Per the school template set (SEP490 Student Guide): Reports 1–7 (Project Introduction, Project Management Plan, SRS, SDD, Test Documentation, User Guides, Final Project Report), plus Project Tracking, Unit Test and Test Report workbooks, source code, database scripts (Flyway migrations) and defense slides.

## 10. Open issues and decisions
| ID | Item | Status |
|---|---|---|
| OI-01 | Fees vs finance boundary | **Closed 20/10/2026:** Admin configures fees, refund rules (with approver per rule) and utility pricing; Manager monitors Block finance, sends reminders and decides refunds for their Block; Admin exports the campus financial report. |
| OI-02 | Staff "related operational work" | **Closed 20/10/2026:** Check-in/Check-out desk, manual payment confirmation, meter readings, room inspections, Room out-of-service. |
| OI-03 | Roommate selection mechanics | **Closed 20/10/2026:** 2-bed only; invite by student code with a privacy-safe check (same answer for every unusable code, limited attempts); partner accepts within `roommateHours`; each pays their own Deposit; otherwise auto-match with optional Roommate preferences. |
| OI-04 | Room Type vs Room Class | **Closed 20/10/2026:** Room Type = number of Beds with a base term price; Room Class = Basic/Standard/Premium with a surcharge rate set per Floor; term price = base price × (1 + surcharge rate), rounded per system parameter. |
| OI-05 | Eligibility rules | **Partly closed:** Admin toggles eligibility criteria and priority groups; source data is the seeded student directory (mock SIS). Exact criteria list follows the Admin › Eligibility screen. |
| OI-06 | VietQR provider | **Closed 20/10/2026:** SePay bank-feed webhook (ADR-08). |
| OI-07 | Free deployment target with public HTTPS (needed for the SePay webhook) | Open — demo fallback: local Docker Compose + Cloudflare Tunnel |
| OI-08 | Official dates for Review 2, Review 3, final defense | Open (Review 2 expected 27/10 – 03/11/2026) |
| OI-09 | M4 role in team table | Open |
| OI-10 | Spring Boot version | **Closed 20/10/2026:** ADR-04 |
| OI-11 | Web app is JavaScript (JSX) with Tailwind CSS, while earlier documents say "ReactJS + TypeScript" and "Ant Design 5". Keep JS or migrate to TypeScript? | Open — recommendation: keep JS for this term, document the deviation |
| OI-12 | Personal-data regulation basis: Decree 13/2023/NĐ-CP has been replaced by the Personal Data Protection Law 91/2025/QH15 (effective 01/01/2026) and Decree 356/2025/NĐ-CP. Update NFRs and reports. | Open — documents to update |
| OI-13 | Bank account to link with SePay for the live demo (small real transfers) | Open — owner: Tisou |

## 10a. Repository layout
One Git repository (monorepo, ADR-05) with `backend/` (Spring Boot API), `web/` (React web app), `docs/` (this Brief, the API contract `docs/api-contract.md` and the backend design in `docs/backend/`), `infra/` (Docker Compose) and `postman/`. `mobile/` (Flutter) is added when the Android work starts. This Brief is kept at `docs/00_Project_Brief.md` as the single source and re-uploaded to the Claude Project whenever it changes.

## 11. Decision Log
| ID | Date | Decision | Reason |
|---|---|---|---|
| ADR-01 | 14/10/2026 | Modular monolith architecture | See §6 |
| ADR-02 | 14/10/2026 | Real SIS integration replaced by mock enrollment data (seeded student directory) | No access to FPT SIS; keeps interface for future integration |
| ADR-03 | 14/10/2026 | Scrum, 2-week sprints, 8 sprints | Matches 16-week term |
| ADR-04 | 20/10/2026 | Spring Boot 4.1.x on Java 21, Maven | 3.5 left OSS support on 30/06/2026; 4.1 is GA and no backend code existed, so no migration cost |
| ADR-05 | 14/10/2026 | Monorepo (backend, web, mobile, docs, infra) | One CLAUDE.md, API contract and clients change in one PR |
| ADR-06 | 20/10/2026 | Students choose Room Type + Room Class only; Rooms/Beds are assigned by the engine and Staff | Matches UI; fairness and gender/Block constraints are easier to guarantee centrally; removes self-selection race conditions |
| ADR-07 | 20/10/2026 | Opaque server-side session tokens (random 256-bit, SHA-256 hash stored, sliding expiry); sign-in by email/password or Google ID token restricted to `hd=fpt.edu.vn`; no self sign-up | Contract uses one bearer token and "401 signs out"; instant revocation on sign-out and account changes; no key management |
| ADR-08 | 20/10/2026 | VietQR payment via SePay webhook (API-key auth, dedup on SePay transaction id, match by unique transfer content); `MockPaymentGateway` for dev; manual Staff confirmation as fallback | Automatic confirmation without a merchant contract; money goes straight to the bank account; resilient demo |
| ADR-09 | 20/10/2026 | Email through an `EmailSender` port with SMTP adapter: Mailpit in development, Gmail SMTP with App Password for the demo | Free; Gmail personal limit (500 messages/day) is enough for a demo; provider can be swapped |
| ADR-10 | 20/10/2026 | Spring Modulith verifies module boundaries; contract areas mapped onto the 10 existing module codes (see §6) | Makes "strict boundaries" testable; keeps ID conventions stable |
| ADR-11 | 20/10/2026 | PostgreSQL 17 with Flyway SQL migrations; JPA for CRUD, `JdbcClient` SQL for reports and batch | Migrations double as the "Database Script(s)" deliverable; SQL gives control over report queries |
| ADR-12 | 20/10/2026 | Scope extended to the mentor-confirmed API contract: utility billing, swaps, Round-2 offers, refunds, late check-ins, routing/escalation, inspections, email campaigns; Period of Stay and renewal removed | Mentor confirmation after UI review |
