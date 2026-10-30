# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The React web app (`web/`) is the design surface: the student portal and the back office for Staff, Managers and the Admin. The students' Android app (`mobile/`, Flutter) is a companion that follows the phone-first student portal; it is not designed separately here.

## Users

- **Dormitory Staff** (scoped to their Blocks): run the desk (check-in, check-out, late check-in), door codes, room map, furniture, maintenance queue and inspections, meter readings, room changes and swaps inside a Block. Work at a desk on screens 1366 px and wider, many times a day.
- **Managers** (whole dormitory): review Applications, run and commit the assignment, confirm payment claims in bulk, issue next-Term fees, reconcile enrollment, handle overdue requests, staff workload and reports.
- **Administrator**: configures registration periods (Term wizard), prices and fees, rules (admission, matching, refunds, penalties, stay and renewal), notifications, buildings and rooms, system settings.
- **Students** (residents): apply for a Term, pay by VietQR and claim the transfer, see their Room, Bed, roommates and door code, file requests (maintenance, room change, swap, Room Class, extension, end of stay, late check-in). Mostly on phones.

**Priority when needs conflict (user decision, 30/10/2026): Staff and Managers first.** Back-office throughput and correctness win over student-side convenience; the student portal still has to work well on a phone.

Secondary audience: the capstone council and mentor, who see the product through live demos on the production server (Review 2 on 31/10/2026, later reviews and the final defense).

## Product Purpose

CampusStay FPT runs dormitory registration, room and bed allocation, dormitory fees and residence operations for FPT University's new Tân Uyên campus (Bình Dương), so the dormitory works digitally from day one without licensing an international platform such as StarRez. It is a Software Engineering capstone (FA26SE260, Fall 2026), running in production as a demo.

Success: a Term goes from registration period to residents and on to the next Term (renewal, requests window, next-Term fees, turnover) without paper or spreadsheets, with every money and policy step traceable.

## Positioning

Built for one campus's real dormitory rules rather than a generic housing platform: students choose only a Room Type (2/4/6 Beds) and Room Class, never a Room or Bed; a rule-based assignment engine places them, with conflicts flagged for people instead of silently resolved; prices are fixed per Term; payments are claims confirmed by Managers; door codes are released on payment and rotated when someone leaves; continuing residents keep their Bed across Terms.

## Operating Context

- Term lifecycle with milestones (M1…M7): registration period request → Admin wizard and publishing → Applications and Deposits → assignment and Manager commit → Balance, door code release and residence → requests window for the next Term → enrollment reconciliation → next-Term fees → turnover.
- Desk work: lookup by student code, name or QR check-in pass; hand-over items; meter readings and damage per item at check-out.
- Bulk actions are normal (confirm 37 payments, decide requests in bulk); deadlines and time left matter on almost every screen.
- Students' dormitory board carries announcements created by publishing and by every later money or policy change.
- Notifications: in-app, push (Firebase) and email; emails of fictional demo accounts go to the team mailbox.
- Demo reset tool (Admin › System › Demo data, stages 0/A/B/C) produces time-dependent demo states.

## Capabilities and Constraints

- Scope and rules: `docs/01_Change_Spec_v2.md` (wins over the Brief), `docs/00_Project_Brief.md`, API contract `docs/api-contract.md`, screen map `docs/web/01_Screen_Map.md`.
- Two languages: Vietnamese (default) and English across web, API messages, notifications and emails; saved on the account; VI/EN switch in the top bar and on sign-in. Dates `dd/MM/yyyy` (VI) or `d MMM yyyy` (EN); amounts `1.200.000 ₫` (VI) or `1,200,000 VND` (EN). Typed text stays as typed.
- Menus per role are fixed by the spec §11.2; hub pages for Student, Room and Term dashboard; global search in the top bar.
- Back office designed for 1366 px and wider; student portal phone-first.
- Terminology is capitalised domain vocabulary: Term, Application, Room Type, Room Class, Block, Bed, Allocation, Invoice, Deposit, Balance, Utility, Stay, Round 2, Maintenance Request.
- Out of scope: tuition, real FPT SIS integration (seeded student directory), Room or Bed self-selection, SMS, iOS.
- Stack fixed: React 19 + Vite + Tailwind CSS 4, React Router, lucide-react, JavaScript (JSX).

## Brand Commitments

- Name: **CampusStay FPT**. CampusStay has its own identity; FPT University appears in the name and context only (user decision, 30/10/2026). It is not presented as an official FPT University product.
- Colours: FPT Vietnam's palette is binding (user decision, 30/10/2026, during the redesign): FPT orange carries the frame, FPT blue and green appear as small marks (links, done states).
- Google sign-in is limited to `@fpt.edu.vn` accounts.

## Evidence on Hand

- Production demo: web https://campusstay-fpt-ten.vercel.app, API https://campusstay-api.eastasia.cloudapp.azure.com/api.
- Base data: about 6,200 fictional student accounts with fictional `@fpt.edu.vn` addresses; buildings, rooms and Terms from the seed and the demo reset tool.
- Submitted documents: Reports 1–7 in `docs/reports/`; diagrams in `docs/diagrams/`; Vietnamese demo guide in `docs/demo/`.
- Absent and never to be fabricated: real residents, testimonials, usage statistics, occupancy numbers from operation, partnerships or an FPT endorsement. Seeds and tests never hold real people's data.

## Product Principles

1. **Operators first.** Staff and Manager screens optimise for many repeated, correct decisions: one clear primary action per screen, lists with a side panel for details, filters kept per user, bulk actions.
2. **Say it in numbers.** Confirmations state what will happen with counts and amounts ("Confirm 37 payments, 92,500,000 VND"); time left is shown wherever a deadline matters.
3. **Nothing silent.** Conflicts, overdue items and changes surface to a person; money and policy changes become announcements; sensitive views (door codes) are audited.
4. **Next step is obvious.** Empty states say what to do next, errors say how to fix them, and the student Home leads with one "Your next step".
5. **Same meaning everywhere.** One status vocabulary for Invoices, requests, Allocations and Beds across every role and both languages.

## Accessibility & Inclusion

- Status is never shown by colour alone: always a label or an icon (spec §11.1).
- Every screen works in Vietnamese and English; layouts must hold the longer of the two strings.
