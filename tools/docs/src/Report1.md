# II. Project Introduction

## 1. Overview

### 1.1 Project Information

| Item | Value |
|---|---|
| Project name (English) | CampusStay FPT – Dormitory Registration and Room-Scheduling Management System for FPT University's Tân Uyên Campus, Binh Duong |
| Project name (Vietnamese) | CampusStay FPT – Hệ thống quản lý đăng ký ký túc xá và sắp xếp phòng tại cơ sở Tân Uyên (Bình Dương) của Đại học FPT |
| Project code | FA26SE260 |
| Group name | GFA26SE104 |
| Software type | Web application (student portal and back office for Staff, Managers and the Administrator), Android mobile app for students, REST API |
| Duration | 09/2026 – 03/2027 (Fall 2026 capstone, 15 weeks from 07/09/2026; Review 1 on 30/09/2026, Review 2 on 31/10/2026) |
| Repository | https://github.com/tisou47/CampusStay-FPT |
| Running system | Web https://campusstay-fpt-ten.vercel.app · API https://campusstay-api.eastasia.cloudapp.azure.com/api |

### 1.2 Project Team

| Full Name | Role | Email | Mobile |
|---|---|---|---|
| Thân Thị Ngọc Vân | Supervisor (Lecturer) | vanttn@fpt.edu.vn | — |
| Lê Thành Minh Trung (SE183752) | Leader: project manager, business analyst, full-stack developer, DevOps | TrungLTMSE183752@fpt.edu.vn | — |
| Nguyễn Xuân Lộc (SE183782) | Member: full-stack developer (check-in hand-over, utility billing, check-out) | LocNXSE183782@fpt.edu.vn | — |
| Võ Minh Luân (SE182794) | Member: full-stack developer (staff shifts and workload, Family Day, administration screens) | LuanVMSE182794@fpt.edu.vn | — |
| Trần Võ Quang Duy (SE182146) | Member: mobile and web developer | DuyTVQSE182146@fpt.edu.vn | — |

## 2. Product Background

The project idea came from the supervisor, Ms Thân Thị Ngọc Vân, for FPT's new education complex in Thái Hòa ward, Tân Uyên (Binh Duong, part of Ho Chi Minh City since 1 July 2025). FPT broke ground there on 18 June 2025. The site covers more than 84,000 m², with about 130,000 m² of floor area including lecture halls and dormitories, and it is planned to operate from Q3 2026 ([SGGP, 19/06/2025](https://www.sggp.org.vn/khoi-cong-to-hop-giao-duc-fpt-tai-binh-duong-post800077.html)). Press reports give its scale as 4,000 learners ([Báo Đầu tư](https://baodautu.vn/fpt-khoi-cong-to-hop-giao-duc-tai-binh-duong-quy-mo-4000-nguoi-hoc-d307769.html)).

A new campus has no dormitory process yet: no records to migrate, and also no system to run one. FPT's existing dormitories (Hòa Lạc, Đà Nẵng, Quy Nhơn and Cần Thơ) use FPT's own dormitory site, OCD. FPT's Ho Chi Minh City campus pages mention no dormitory (section 3.2). The work a dormitory office has to do every Term is well known from the operating dormitories studied in section 3 and from the rules for resident students (Circular 27/2011/TT-BGDĐT):

- open a registration period: dates, Blocks, Room Types and prices, Deposit, rules;
- take applications with roommate wishes, check that the student is enrolled and eligible, and collect the Deposit;
- review the applications and assign Beds: fairly and by rule, inside each gender's Blocks;
- collect the remaining fee and hand over the Room (door code, furniture and its condition);
- run the stay: maintenance requests, inspections, monthly electricity and water, visitors;
- turn the Term over: who stays, who changes Room, who leaves, and next-Term fees;
- check students out: final meter reading, damage, refund of the Utility Deposit.

CampusStay automates exactly this work. Every value a dormitory office might decide differently (prices, deadlines, refund percentages, eligibility rules, timers) is a setting the Administrator changes, because the Tân Uyên dormitory's own rules were not fixed when the project started.

## 3. Existing Systems

The systems below were read at their own sources on 23/11/2026. The comparison with CampusStay was first made by Trần Võ Quang Duy and then checked again at the sources and against CampusStay's code.

### 3.1 VNU-HCM dormitory system (sv.ktxhcm.edu.vn)

**What it is.** The Centre for Dormitory and Urban Area Management of Vietnam National University HCMC (Trung tâm Quản lý Ký túc xá và Khu đô thị ĐHQG-HCM) runs areas A and B through 7 building-cluster boards and 8 offices. Its student website covers registration, renewal, invoices and check-out ([organisation](https://ktxhcm.edu.vn/gioi-thieu/gioi-thieu-chung/thong-tin-chung-ve-ktx), [guides](https://huongdan.ktxhcm.edu.vn/)).

**Actors.** Students; building-cluster boards (one administrator per building); the Centre's offices (finance, facilities, security, student affairs).

**Features.**
- Online registration in 8 steps:
  - the student chooses School → Area → Gender → Room type → Building → Floor → Room → Bed;
  - ID-card photos are read automatically;
  - the portrait photo is used for the resident card and for FaceID at the gates.
- Approval within 24 hours, payment within 3 days, otherwise the place is released ([2026–2027 notice](https://ktxhcm.edu.vn/sinh-vien-noi-tru/thong-bao-menu/ve-viec-dang-ky-o-ky-tuc-xa-nam-hoc-2026-2027)).
- Payment by QR code with any bank, Momo or ZaloPay; several invoices can be paid at once.
- Yearly renewal in 15 steps: stay in the same room, or move, choosing the new Bed.
- Online check-out request with a bank account for the deposit refund.
- An AI chatbot and a 360° tour.
- Conduct rules with 52 kinds of violation graded over 5 levels, up to being forced to leave ([Decision 370/QĐ-KTX&ĐTĐH, 22/07/2025](https://drive.google.com/file/d/13X8UyblN7f_xa3wz9ZI-wjpr1LeojzgB/view)).

**Pros.** Mature and at very large scale (cluster B.E alone received 6,490 students in 2024–2025). Students pick their own Bed. Payment is fully online, and approval times are committed.

**Cons.**
- Beds go to whoever picks them first: there is no assignment by rule and no roommate matching (friends must pick the same room in time).
- Nothing is paid before approval, so an unpaid approved place is simply released after 3 days.
- Several web systems are needed, plus 24 paper forms (late return, room transfer, staying over Tet …).
- The yearly cycle does not fit FPT's three-Term year.

### 3.2 FPT University dormitory site (OCD, ocd.fpt.edu.vn)

**What it is.** FPT's own dormitory site, "FPT On Campus Dormitory", for the Hòa Lạc, Đà Nẵng, Quy Nhơn and Cần Thơ campuses, with sign-in by Google or FEID ([OCD](https://ocd.fpt.edu.vn/)). The Ho Chi Minh City campus is not in its campus list, and that campus's pages mention no dormitory ([daihoc.fpt.edu.vn/hcm](https://daihoc.fpt.edu.vn/hcm)).

**Actors.** Students, the dormitory board, security.

**Features** (public pages; the booking pages need an account of one of those campuses):
- stays per Term (Spring, Summer, Fall);
- a free electricity and water quota per Term (200 kWh and 12 m³ at Hòa Lạc), with extra use charged;
- a credibility score (CFD): violations deduct points, and the score decides whether a student may stay next Term;
- requests to the board through "My request", and repairs through FPT's CIM ticket system with photos;
- curfew and house rules.

At Đà Nẵng, 4- and 6-bed rooms cost 4,200,000 and 3,600,000 đ per Term (2024 prices) ([FPT University](https://daihoc.fpt.edu.vn/cuoc-song-tai-dai-hoc-fpt/doi-song-sinh-vien-cuoc-song-tai-dai-hoc-fpt/ky-tuc-xa/ky-tuc-xa-truong-dai-hoc-fpt-tram-dung-chan-trong-mo-danh-cho-tan-sinh-vien/)).

**Pros.** It follows FPT's Term structure and its accounts. Utilities are simple (a quota per Term). Repairs reuse FPT's ticket system.

**Cons.**
- It does not serve the new Tân Uyên campus, or Ho Chi Minh City.
- Its public pages show no assignment, no roommate matching, no inspections and no Term-transition work.
- Repairs and requests run in two systems.

### 3.3 StarRez (international student-housing platform)

**What it is.** A commercial housing and residence-life platform used by universities and student-accommodation providers ([starrez.com](https://starrez.com/)). Universities use it for online room selection and roommate matching ([Carleton University](https://carleton.ca/its/2024/starrez-provides-one-stop-solution-for-housing-and-residence-life-services/), [Wellesley College](https://www1.wellesley.edu/news/2019/stories/node/164541)).

**Actors.** Students, residence-life staff, administrators.

**Features.** Online applications; room and roommate self-selection, with roommate profiles and configurable matching ([Room & Roommate](https://www.starrez.com/features/roommate-matching)); assignment; room inventory and inspections; billing; front desk and visitors; communication and reporting.

**Pros.** The complete, proven functional scope of student housing; highly configurable.

**Cons.** A licensed enterprise product. It would need integration with FPT accounts, FPT's Term structure and Vietnamese payment methods (VietQR, bank transfer), and its texts and processes are not designed for a Vietnamese dormitory office.

## 4. Business Opportunity

The Tân Uyên dormitory opens with no system, and neither existing option fits it. FPT's OCD does not serve Ho Chi Minh City campuses. The VNU-HCM system runs a different process: a yearly cycle, students racing for Beds, no deposit and paper forms. A licensed platform such as StarRez is costly and would still have to be adapted to FPT.

The opportunity is to give the new campus, from its first Term, a single system that:
- follows FPT's three-Term year and FPT accounts (Google sign-in with @fpt.edu.vn);
- assigns Beds fairly by rule, with roommate wishes, instead of first come, first served; a Deposit before review keeps applications serious;
- takes payments by VietQR bank transfer, confirmed by Managers against the bank statement;
- covers the whole stay in one place: hand-over at check-in, door codes, maintenance with timers, inspections, monthly utilities split per resident's days, Term transition and check-out;
- lets the dormitory office change every rule and value without a developer, and keeps an audit log of every change;
- gives students an Android app in Vietnamese or English.

## 5. Software Product Vision

For the students and the dormitory office of FPT University's Tân Uyên campus, CampusStay FPT is a web and Android system that runs the whole dormitory Term in one place: registration with roommate wishes, fair Bed assignment, payment by bank transfer, room hand-over, the stay, the move to the next Term and check-out. Unlike operating it with paper, spreadsheets and several unrelated websites, CampusStay keeps one record of each student's stay, applies the office's rules the same way for everyone, tells each student what to do next and when, and shows the office in real time where every Bed, Invoice and request stands.

## 6. Project Scope & Limitations

### 6.1 Major Features

One feature per area of the code (each backend package under `service/` with its screens). The system has 63 REST controllers with 353 endpoints, 133 web pages, 31 mobile screens and 37 permissions.

- **FE-01 Accounts and sign-in (AUTH):**
  - password or Google (@fpt.edu.vn) sign-in; student sign-up with verification by a Manager;
  - student list import;
  - Staff accounts per Block, roles and permissions;
  - staff shifts, week schedules and the shift check on Staff changes;
  - staff workload and reassignment;
  - the audit log.
- **FE-02 Terms and settings (CFG):**
  - Managers' requests for a registration period;
  - the Administrator's Term wizard (timeline, Blocks, prices per Room Type and Room Class, Deposit, rules) and publishing;
  - every business value is a setting.
- **FE-03 Inventory (INV):**
  - Buildings (Blocks), Floors, Rooms and Beds;
  - Room Classes per Term;
  - furniture items with history, Block stores and moves;
  - door codes: proposed, confirmed and rotated when a resident leaves.
- **FE-04 Applications (APP):**
  - the application wizard with eligibility checks, roommate invitation or matching preferences, and the Deposit Invoice;
  - review by Managers;
  - Round 2 offers for waitlisted students.
- **FE-05 Assignment and residence (ASG):**
  - assignment runs with conflicts, per-Block approval and commit into Allocations;
  - check-in with the students' hand-over report and Staff verification;
  - door-code release when the fee is paid;
  - late check-in, forfeits, terminations;
  - check-out with damage and settlement;
  - Term transition: stays, extensions, next-Term Allocations, turnover week and operational moves.
- **FE-06 Billing (BIL):**
  - Invoices with VietQR, payment claims confirmed or rejected by Managers, receipts, refunds by rule;
  - monthly meter readings and cuts, Utility Invoices split per resident's days;
  - utility-debt warnings and termination;
  - Block Finance and next-Term fees.
- **FE-07 Requests (REQ):**
  - room changes, swaps (direct and the swap board), extensions and end of stay;
  - Room Class changes with roommates' consent;
  - routing rules and escalation timers.
- **FE-08 Maintenance (MNT):**
  - Maintenance Requests with photos, priority, assignee and an SLA timer;
  - inspection checklists, schedules and runs whose failed items become Maintenance Requests.
- **FE-09 Notifications (NTF):**
  - in-app notifications, push to Android, and emails, all in Vietnamese and English;
  - templates;
  - announcements, including automatic ones when money or rules change;
  - email campaigns to student groups.
- **FE-10 Reports (RPT):** dashboards per role, Term dashboards, occupancy, financial and Block reports, CSV export of every list, and a back-office search.
- **FE-11 Family Day (VIS):** a Manager opens visiting days with time slots; residents register guests and get a QR pass per guest; Staff check guests in and out at the gate; statistics.
- **FE-12 AI assistant:** students ask questions and get answers based on their own data and the dormitory guide (door codes are never given by the model).
- **FE-13 Student mobile app:** every student feature of the web on Android, with push notifications and deep links.

### 6.2 Limitations & Exclusions

- **LI-01** Payments are not connected to a bank. A student transfers by VietQR and claims the payment, and a Manager confirms it against the bank statement (ADR-22). There is no automatic matching and no online card payment.
- **LI-02** The AI assistant needs a model server (Ollama). Without one (`ASSISTANT_BASE_URL` empty) the assistant is switched off.
- **LI-03** The mobile app is for students and runs on Android 8.0 and later only; there is no iOS build. Staff, Managers and the Administrator use the web app.
- **LI-04** No link to FPT's student information system (FAP). Enrolled students come from a list file a Manager imports, and each Term's reconciliation is done against an uploaded list.
- **LI-05** Gates and locks are not controlled. Door codes are kept and shown in the system, but a Staff member sets them on the lock; there is no FaceID or card reader.
- **LI-06** No conduct records: the system keeps no violations or disciplinary measures. A stay ends only for utility debt, for no longer being enrolled, or by a Manager's termination.
- **LI-07** No fee reductions or exemptions for priority groups. Priority only orders the assignment.
- **LI-08** Each Invoice is paid on its own; there is no single payment for several Invoices.
- **LI-09** Visitors are handled only on Family Days. There is no everyday visitor registration, and no temporary-residence (tạm trú) declaration.
- **LI-10** Tuition and other school fees are out of scope: only dormitory charges (Deposit, room fee, Utility Deposit, utilities, damage).
- **LI-11** The Tân Uyên dormitory's own rules were not known while the system was built. The system starts with assumed values that the Administrator changes.
