**a) Context:**

The FPT Education Complex in Thái Hòa Ward, Tân Uyên (Bình Dương, part of Ho Chi Minh City since the 2025 provincial merger) broke ground on 18 June 2025 on a site of over 84,000 m² with roughly 130,000 m² of floor area, including lecture halls, dormitories, multi-functional areas and technology learning spaces, and is planned to serve up to 4,000 learners. As a brand-new campus it has no dormitory system yet: no legacy process to migrate, but nothing to run registration, room and bed assignment, payments, Term transitions and maintenance once the dormitories open.

Because the dormitory is not operating yet, the requirements are based on (1) how FPT University's operating dormitories work (registration per Term, Deposit and Balance, room types and classes, Block staff, check-in and check-out), (2) the Ministry of Education's dormitory regulation (Circular 27/2011/TT-BGDĐT) and the practice of large Vietnamese student dormitories such as VNU-HCM's, and (3) the proven scope of student-housing platforms such as StarRez. Every business value (prices, deposit percentage, windows, eligibility, matching criteria, refund and termination rules, time limits) is configuration, so the system can follow the dormitory's real rules when it opens.

CampusStay FPT is not a replacement for FPT University's student information system: the student list and the enrolled list of each Term are imported from files and reconciled. It owns the dormitory workflow: registration periods, Applications, assignment, Invoices and payment confirmation, residence (door codes, check-in and check-out), Term transitions of continuing residents, maintenance and inspections, notifications and reports. It does not process tuition fees.

**b) Proposed Solutions:**

A web app for students (phone-first) and for the dormitory's Staff, Managers and Administrator, an Android app for students, and one REST API with a PostgreSQL database. Students choose a Room Type and a Room Class; a rule-based batch engine places them fairly. Payments are VietQR transfers to the dormitory's account that students claim and Managers confirm.

System actors:

1. Student (applicant and resident)
  - Apply for a Term, invite a roommate (2-bed rooms), pay by VietQR and claim the transfer
  - See the Room, door code, check-in pass and Invoices; report Maintenance Requests
  - In the requests window: extend the stay, end it, ask for a room change, a swap or a Room Class change
2. Staff (per Block)
  - Run the check-in and check-out desk, meter readings, door codes, furniture and inspections
  - Handle Maintenance Requests and decide the next-Term requests of the Block
3. Manager (dormitory manager, every Block; added after Review 1)
  - Request registration periods; verify student accounts; import and reconcile student lists
  - Review Applications, run and approve the assignment, confirm payments, decide late check-ins, terminations and refunds
  - Follow dashboards, reports and overdue requests; set routing rules, time limits and Block settings; manage Staff accounts
4. Administrator
  - Build and publish Terms from the Managers' requests; configure prices, rules, users and notification texts

**c) Functional Requirements:**

Student. The Student shall be able to:

- Sign in with a password or the FPT Google account; a new Google account is verified by a Manager before applying
- Apply for a Term, with eligibility checked, choosing Room Type, Room Class, roommate (2-bed) and stay length (number of Terms), and accept the house rules
- Pay the Deposit, Balance, next-Term fee and Utility Invoices by VietQR transfer and claim the transfer
- See the assigned Room and Bed, roommates, furniture, the door code (once paid and from the check-in start) and the check-in pass
- Ask for a late check-in; answer a Round-2 offer
- Report Maintenance Requests and follow them; extend or end the stay; ask for a next-Term room change, swap or Room Class change
- Receive notifications in the app, by push (Android) and by email

Dormitory Staff. The Staff shall be able to:

- Check students in and out (hand-over, meter reading, damage per furniture item, Utility Deposit settlement)
- Set and confirm door codes, manage furniture and the Block store, run inspections
- Enter or import meter readings and close the month (Utility Invoices split by days lived)
- Handle Maintenance Requests within their time limits; decide next-Term requests; move residents for operational reasons
- Post announcements to the residents of their Blocks

Manager. The Manager shall be able to:

- Request registration periods; verify accounts; import the student list; reconcile the enrolled list
- Review Applications; run the batch assignment, resolve conflicts and approve it; run Round 2
- Confirm or reject payment claims; issue next-Term fees; decide refunds, late check-ins and terminations
- Set routing rules, time limits, Block settings, Room Classes by Term and inspection schedules; manage Staff accounts
- Follow dashboards, the Term dashboard, reports and overdue requests; export every list

Administrator. The Administrator shall be able to:

- Build and publish Terms (timeline, Rooms, prices, rules, information) from the Managers' requests
- Configure Room Types, Room Classes, fees, Utility, eligibility, priority groups, matching criteria, deadlines, refunds and stay rules
- Manage Blocks, Rooms, furniture types, users and roles, notification texts and email campaigns; read the Audit Log

Assignment engine and automation. The system shall automatically:

- Place approved students by gender, Room Type and Class, roommate pairs, priority groups and matching criteria; flag conflicts; give the same result for the same input
- Expire unpaid Deposits, forfeit unpaid Balances, release door codes, run the requests-window milestones, warn and terminate for Utility debt, escalate overdue requests and send reminders

**d) Non-Functional Requirements:**

- Security and privacy: access by role and Block; passwords hashed, door codes encrypted; personal data processed according to the Personal Data Protection Law 91/2025/QH15.
- Performance and capacity: p95 response ≤ 1 s with 200 concurrent users on 3,680 Beds and 6,200 students.
- Integrity: a Bed is never given twice in a Term; money of an Invoice never changes once issued.
- Availability: the API answers its health check in at least 99 % of 5-minute checks during the demo period.
- Configurability: Terms, prices, rules and time limits change without a new release.
- Usability: Vietnamese and English; student portal usable on phones.
- Deployability: every change that passes its tests is deployed automatically; rollback in minutes.

**e) Theory & Practical:**

Documents: Reports 1–7. Technologies:

- React (web app for all roles), Kotlin with Jetpack Compose (Android app for students)
- Spring Boot (Java 21) REST API, PostgreSQL with Flyway migrations
- A rule-based batch room-assignment engine
- Firebase Cloud Messaging, SMTP email, in-app notifications
- VietQR transfer images; Google sign-in for FPT accounts
- Docker, GitHub Actions CI/CD, Vercel and Azure hosting

**f) Products (Expected Deliverables):**

A web app for students and for the dormitory's Staff, Managers and Administrator; an Android app for students; the REST API with its database scripts and automated tests; Reports 1–7.

**g) Proposed Tasks:**

- P1 Literature review: student-housing platforms, Vietnamese dormitory practice and regulation, FPT's dormitory model.
- P2 Requirement analysis: registration, assignment, payments, residence, Term transition, maintenance and Utility workflows.
- P3 System design: architecture, database, REST API, state machines, the assignment engine.
- P4 Registration and payments: registration periods, Applications, assignment, VietQR claims and confirmation.
- P5 Residence and operations: door codes, desk, Term transition, maintenance, Utility and debt.
- P6 Clients and reports: web app for four roles, Android app, dashboards and exports.
- P7 Testing and documentation: automated and system tests, user acceptance, reports and demonstration.
