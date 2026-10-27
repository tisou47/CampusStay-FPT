# II. Project Introduction

## 1. Overview

### 1.1 Project Information

| Item | Value |
|---|---|
| Project name (English) | CampusStay FPT – Dormitory Registration and Room-Scheduling Management System for FPT University's Tân Uyên Campus, Binh Duong |
| Project name (Vietnamese) | CampusStay FPT – Hệ thống quản lý đăng ký ký túc xá và sắp xếp phòng tại cơ sở Tân Uyên (Bình Dương) của Đại học FPT |
| Project code | FA26SE260 |
| Group name | CampusStay FPT |
| Software type | Web application (student portal and back office for Staff, Managers and the Administrator), Android mobile app for students, REST API |
| Duration | 09/2026 – 03/2027 (Fall 2026 capstone; Review 1 on 30/09/2026, Review 2 on 31/10/2026) |
| Repository | https://github.com/tisou47/CampusStay-FPT (tag `review-2`) |
| Running system | Web https://campusstay-fpt-ten.vercel.app · API https://campusstay-api.eastasia.cloudapp.azure.com/api |

### 1.2 Project Team

| Full Name | Student code | Role | Email |
|---|---|---|---|
| Thân Thị Ngọc Vân | — | Supervisor (Lecturer) | vanttn@fpt.edu.vn |
| Lê Thành Minh Trung | SE183752 | Leader: project manager, business analyst, full-stack developer | trungltmse183752@fpt.edu.vn |
| Nguyễn Xuân Lộc | SE183762 | Member: backend developer | locnxse183782@fpt.edu.vn |
| Trần Võ Quang Duy | SE182146 | Member: frontend developer (web) | duytvqse182146@fpt.edu.vn |
| Võ Minh Luân | SE182794 | Member: mobile developer (Android) and tester | luanvmse182794@fpt.edu.vn |

## 2. Product Background

The idea of the project was raised by the supervisor, Ms Thân Thị Ngọc Vân, for the new FPT Education complex in Thái Hòa ward, Tân Uyên (Binh Duong, now part of Ho Chi Minh City). FPT broke ground on 18 June 2025 on about 8.4 ha with roughly 130,000 m² of floor area, including lecture halls and dormitories for up to 4,000 learners. Phase 1 planned to top out the lecture halls and dormitories in Q1 2026 and to start operating in Q3 2026 ([SGGP](https://www.sggp.org.vn/khoi-cong-to-hop-giao-duc-fpt-tai-binh-duong-post800077.html), [Báo Đầu tư](https://baodautu.vn/fpt-khoi-cong-to-hop-giao-duc-tai-binh-duong-quy-mo-4000-nguoi-hoc-d307769.html)).

A new campus has no paper process to migrate, but it also has no system to register students for the dormitory, assign Rooms and Beds, collect dormitory fees, run the front desk and handle maintenance. Without one, the dormitory office would run every Term on spreadsheets, forms and chat groups: payments checked by hand against bank statements, Rooms assigned in a spreadsheet, and door codes and broken furniture tracked on paper.

**Basis for the requirements (Review 1 feedback).** At Review 1 the council asked how the system can be designed while the Tân Uyên dormitory is not yet operating, and asked for a practical solution and a clear picture of how the dormitory works. The team answered in four ways.

1. **FPT's own operating model.** Three Terms a year (Spring, Summer, Fall), student codes, majors, cohorts and the student list the University already keeps. These are facts the team knows as FPT students and are used directly.
2. **Vietnamese practice and rules.** Circular 27/2011/TT-BGDĐT on boarding students (registration, room assignment, house rules, termination of stay) and the online dormitory registration of the VNU-HCM Dormitory Center, which serves its member universities and 23 partner institutions in Ho Chi Minh City; a published guide lists FPT University among the partners ([SGGP](https://www.sggp.org.vn/ky-tuc-xa-dhqg-tphcm-tiep-nhan-hon-12000-tan-sinh-vien-post809948.html), [Luật Minh Khuê](https://luatminhkhue.vn/huong-dan-dang-ky-ky-tuc-xa-dai-hoc-quoc-gia-tp-hcm.aspx)).
3. **Proven functional scope.** Student-housing platforms used worldwide (section 3) show which processes a dormitory office needs: applications, assignment, billing, desk, maintenance, communications and reporting.
4. **A dormitory that can be configured instead of guessed.** Every rule the team cannot confirm today is an Administrator setting: prices per Room Type and Room Class, Deposit percentage and windows, eligibility checks and priority groups, matching weights, deadlines, refund rules, Utility prices and debt limits, time limits for requests. The values the system starts with are recorded as assumptions, and the dormitory office replaces them when it opens.

Following the same feedback, a **Manager** role (dormitory manager) was added between the Staff of one Block and the Administrator: Managers work for every Block and handle registration, assignment, payment confirmation, decisions, finance and reports.

## 3. Existing Systems

### 3.1 StarRez

StarRez is a cloud platform for student housing used by more than 1,300 institutions ([Capterra](https://capterra.com/p/159606/StarRez/), [StarRez](https://starrez.com/campus-life)).

- **Actors:** students (applicant and resident portal), housing staff, administrators.
- **Features:** online applications, room and roommate self-selection with priority by class year or lottery, roommate matching, contracts, billing for terms and billing cycles, move-in and move-out, maintenance, communications and reports.
- **Pros:** complete and proven scope; configurable application forms and charge schedules.
- **Cons:** commercial licence and long setup; built around Western academic calendars, card payments and contracts; no VietQR or Vietnamese language.

### 3.2 RMS Mercury

Mercury is a university housing and conference platform ([Capterra](https://capterra.com/p/211433/Mercury/), [Griffith College](https://www.griffith.ie/offices/it-services/mercury-housing)).

- **Features:** custom housing applications, contracts with electronic signatures, online payments, student self-assignment, room occupancy, roommate preferences, maintenance, alerts and notifications, integration with the student information and finance systems.
- **Pros:** processes built with drag-and-drop tools; integrations.
- **Cons:** commercial licence; payment integrations aimed at card gateways; no local payment methods.

### 3.3 Adirondack Solutions – The Housing Director

The Housing Director handles applications, move-in coordination and occupancy for residence-life offices ([Adirondack Solutions](https://adirondacksolutions.com/), [Emory University](https://it.emory.edu/catalog/teaching-and-learning/adirondack.html)).

- **Features:** online application, roommate and room selection, assignments aligned with the student information system, occupancy tasks.
- **Pros:** strong residence-life operations.
- **Cons:** commercial licence; integration assumes an American SIS.

### 3.4 VNU-HCM Dormitory Center online registration

The dormitory center of Vietnam National University – Ho Chi Minh City opens online registration every school year at sv.ktxhcm.edu.vn; in 2025 it offered more than 12,000 places in rooms of 2 to 8 people to students of its member universities and 23 partner institutions ([SGGP](https://www.sggp.org.vn/ky-tuc-xa-dhqg-tphcm-tiep-nhan-hon-12000-tan-sinh-vien-post809948.html), [HCMUTE guide](https://sao.hcmute.edu.vn/Resources/Docs/SubDomain/sao/TanSV2023/Huong%20dan%20Tan%20SV%202023%20dang%20ky%20KTX%20DH%20Quoc%20Gia%20(11).pdf)).

- **Features:** online registration window, eligibility by school (some schools must recommend their students first), room types by size and price, proof of enrollment.
- **Pros:** free for students; the closest Vietnamese practice; shows the rooms-by-size pricing the team adopted.
- **Cons:** reports describe a congested system at the start of the school year ([PLO](https://plo.vn/tan-sinh-vien-chen-chan-tim-cho-o-ky-tuc-xa-san-lung-nha-tro-o-tphcm-post867983.html)); registration only: no automatic assignment, renewal between Terms, door codes, Utility billing or maintenance in one place.

### 3.5 Comparison

| Capability | StarRez | RMS Mercury | Housing Director | VNU-HCM portal | CampusStay FPT |
|---|---|---|---|---|---|
| Online application with eligibility | Yes | Yes | Yes | Yes | Yes |
| Automatic assignment with roommate matching | Yes | Self-assignment | Yes | No | Yes, reviewed per Block |
| Renewal between Terms without re-applying | Yes | Yes | Yes | No | Yes (requests window M2–M7) |
| Local payment (VietQR) and manual confirmation | No | No | No | Not stated | Yes |
| Utility billing split by days lived | Billing module | Billing | No | No | Yes |
| Door codes, furniture, inspections | Partly | Maintenance | Partly | No | Yes |
| Vietnamese and English | No | No | No | Vietnamese | Yes |
| Licence | Commercial | Commercial | Commercial | Internal | Built for FPT |

## 4. Business Opportunity

The Tân Uyên campus will house up to 4,000 learners and needs its dormitory office to work from the first Term. International platforms cover the processes but need a commercial licence, a long setup, card payments and an English-only interface, and none fits FPT's three-Term calendar, the habit of paying by bank transfer with VietQR, or the student list FPT already keeps. Vietnamese university dormitories show that online registration is expected by students, but their systems stop at registration.

CampusStay FPT adapts the proven scope to FPT: Terms and renewal that follow FPT's calendar, payments by VietQR transfer confirmed by a Manager (no payment gateway contract), student accounts from FPT Google sign-in checked against the student list, Vietnamese and English everywhere, and every business value configurable so the same system can serve FPT's other campuses. Problems it solves that cannot be solved today without it:

- assigning thousands of Beds fairly and quickly with roommate pairs, priorities and gender per Block, and showing every conflict instead of hiding it;
- keeping continuing residents on their Beds between Terms, while every change (room change, swap, Room Class change, extension, end of stay) goes through one window with deadlines;
- following every Invoice from Deposit to Utility debt, with reminders, warnings and refunds by rule;
- running the Block desks: check-in pass, door codes that change when someone leaves, furniture per Room, meter readings, maintenance with time limits.

## 5. Software Product Vision

For FPT University students who want a place in the Tân Uyên dormitory, and for the dormitory office that runs it, CampusStay FPT is a web and Android system that takes a student from sign-in to a Bed and through every Term of their stay, and gives Staff, Managers and the Administrator one place to run registration, assignment, payments, the desks, maintenance and reports. Unlike spreadsheets, forms and chat groups, every step has an owner, a deadline and a record, and every rule is a setting rather than a habit. Unlike licensed international platforms, it speaks Vietnamese, takes VietQR transfers and follows FPT's Terms from day one.

## 6. Project Scope & Limitations

### 6.1 Major Features

- **FE-01 Accounts and access:** sign-in with password or FPT Google account, first password and verification of new student accounts, roles (Student, Staff per Block, Manager, Administrator), student list import, Staff accounts, Audit Log.
- **FE-02 Registration periods and Terms:** a Manager's registration-period request, the Administrator's Term wizard (timeline M1–M7, Blocks and Rooms left out, places, prices fixed per Term, rules), publication with announcements.
- **FE-03 Configuration:** Room Types and Room Classes, Deposit and Utility, eligibility and priority groups, roommate matching, deadlines, refunds, stay and renewal, Block settings, system parameters.
- **FE-04 Applications:** eligibility checks, Room Type and Room Class preference, roommate invitation for 2-bed Rooms, *Gia hạn* (Terms committed), review by Managers, Round-2 offers.
- **FE-05 Assignment and residence:** batch assignment with matching criteria, conflicts and waitlist, approval per Block; Balance and forfeit; door code release; check-in and check-out desk with damage per furniture item; late check-ins; terminations.
- **FE-06 Payments and billing:** Invoices (Deposit, Balance, next-Term fee, Utility, charges), VietQR payment page, "I have transferred" claims confirmed by Managers, receipts, refunds, reminders.
- **FE-07 Term transition:** Stays, the requests window M2–M7 with next-Term Allocations, room changes, swaps and swap board, Room Class changes with consent, extension and end of stay, enrollment reconciliation, next-Term fees, turnover week, operational moves.
- **FE-08 Inventory:** Blocks, Floors, Rooms and Beds, Room Class per Room per Term, furniture items and stores with QR labels, door codes stored encrypted.
- **FE-09 Utility billing:** monthly meter readings (entry or CSV import), Utility Invoices split by days lived, debt warnings and termination.
- **FE-10 Operations:** Maintenance Requests with photos and furniture items, routing rules, time limits and escalations, inspections with checklists and Room checks.
- **FE-11 Communication:** in-app notifications, Android push, email, dormitory board announcements in Vietnamese and English, emails to student groups.
- **FE-12 Reports:** dashboards per role, Term dashboard, occupancy and financial reports, CSV export of every list, back-office search, demo data reset.

### 6.2 Limitations & Exclusions

- **LI-01** CampusStay FPT does not replace FPT's student information system: the student list is imported from files (CSV or XLSX) and reconciled each Term; there is no live connection to the SIS.
- **LI-02** No payment gateway or bank API: students pay by bank transfer to the dormitory account with a VietQR code and claim it; a Manager confirms each claim. Tuition is out of scope.
- **LI-03** Students do not pick a Room or Bed themselves: they choose a Room Type and Room Class (and a roommate for 2-bed Rooms) and the assignment places them.
- **LI-04** No electronic contract signature: students accept the house rules and terms online, and the acceptance is recorded.
- **LI-05** No SMS; communication is in-app, push (Android) and email.
- **LI-06** Door locks are not integrated: Staff set a code on the lock and confirm it in the system.
- **LI-07** No statistical forecast of occupancy: dashboards show current and next-Term figures.
- **LI-08** iOS is not built; students on iPhone use the web portal, which works on phones.
- **LI-09** The rules the dormitory will use are not known yet (the dormitory is not operating): the system starts with assumed values that the Administrator changes.

### 6.3 Sources

Pages opened on 27–28/10/2026: [SGGP – ground-breaking](https://www.sggp.org.vn/khoi-cong-to-hop-giao-duc-fpt-tai-binh-duong-post800077.html), [Báo Đầu tư](https://baodautu.vn/fpt-khoi-cong-to-hop-giao-duc-tai-binh-duong-quy-mo-4000-nguoi-hoc-d307769.html), [SGGP – VNU-HCM dormitory](https://www.sggp.org.vn/ky-tuc-xa-dhqg-tphcm-tiep-nhan-hon-12000-tan-sinh-vien-post809948.html), [Luật Minh Khuê – VNU-HCM dormitory guide](https://luatminhkhue.vn/huong-dan-dang-ky-ky-tuc-xa-dai-hoc-quoc-gia-tp-hcm.aspx), [PLO – new students looking for rooms](https://plo.vn/tan-sinh-vien-chen-chan-tim-cho-o-ky-tuc-xa-san-lung-nha-tro-o-tphcm-post867983.html), [Capterra – StarRez](https://capterra.com/p/159606/StarRez/), [Capterra – Mercury](https://capterra.com/p/211433/Mercury/), [Adirondack Solutions](https://adirondacksolutions.com/).
