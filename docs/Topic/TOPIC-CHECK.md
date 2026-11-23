# Topic form check (Phieu_FA26SE260.docx against the code, 23/11/2026)

The registration form was **not edited**. Below, each place where it says something the system does differently, then what the system has that the form does not name. Decide per line whether to change the form, the code, or to explain it at the defense (Report 1, section 6, already lists the limitations).

## Same as the form

- Name (English and Vietnamese), the Tân Uyên campus, the team and the supervisor.
- Technologies: React (web), Flutter (Android app), Spring Boot, PostgreSQL, a rule-based assignment engine, Firebase Cloud Messaging and email, VietQR, Docker.
- Students apply each Term with eligibility checks, see their assignment, invoices and requests; Staff manage inventory, room changes, check-in and check-out, inspections and maintenance; Admins configure Terms, eligibility, prices and the assignment rules; reports of occupancy and finance; automatic reminders; conflict detection in the assignment.

## Different from the form

| # | The form says | The system does | Where |
|---|---|---|---|
| 1 | Students "browse … bed vacancies with photos/floor plans" and "select a preferred room/bed" | Students choose a Room Type and a Room Tier (with prices and furniture); the engine assigns the Room and Bed. No photos or floor plans of Rooms. | Student › Registration; Report 3 |
| 2 | Students receive a "digital housing contract" | No contract document: the Allocation, its Invoices and the house rules published with the Term. | — |
| 3 | Pay "via a VietQR-compatible digital payment method"; NFR "integrate … with a VietQR-compatible payment gateway" | A VietQR image for the bank transfer; the student claims the transfer and a Manager confirms it against the bank statement (ADR-22). No payment gateway. | Report 4, ADR-22 |
| 4 | Three actors: Student, Dormitory Staff, Administrator; Staff "review and approve applications" and "run … batch room assignment" | Four roles: a **Manager** role does the review, the assignment, payment confirmations and the Term transition for every Block (ADR-19); Staff work in their Block. | Report 3, actors |
| 5 | Communicate "via in-app notification, email, or SMS" | In-app notifications, push (FCM) and email; no SMS. | NTF |
| 6 | Eligibility "e.g., year of study, program, distance from campus" | Eligibility: enrolled, one live Application, no overdue Invoice, Beds for the student's gender, contact details complete. Year of study and hometown far from campus are **priority groups** in the assignment, not eligibility. Program is a roommate-matching criterion (same major). | Admin › Who may apply, Roommate matching |
| 7 | "Manage integration with the university's central student information system" (also an NFR) | No live integration: the student list is imported from a CSV/XLSX file and each Term's enrolled list is reconciled by upload. | Manager › Students, Reconciliation |
| 8 | "Forecast occupancy and vacancy trends per term" | Occupancy and vacancy reports of the current data; no forecast. | Manager › Reports |
| 9 | "Self-service check-in/check-out with a digital room-condition report" | Check-in is self-service (the student's inventory, reviewed by Staff); check-out is done by Staff at the desk with the student. | Report 6, section 3.7 |
| 10 | NFR: personal and financial data "encrypted" | Access by role and Block, HTTPS everywhere, door codes encrypted in the database; other personal data is protected by access control and the managed database's own storage encryption, not by field encryption in the application. | Report 3, NFRs |

## In the system, not in the form

Term transition (stay, extend, change Room, swap, next-Term fees, reconciliation), utility metering and billing with debt warnings and termination, door codes, furniture and Room Classes per Term, Family Day visitors, the Staff weekly schedule and shift checks, the students' AI assistant, the Audit Log, and demo data stages.
