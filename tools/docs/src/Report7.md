# Acknowledgement

We thank our mentor, Ms. Thân Thị Ngọc Vân, for her weekly guidance and her feedback at every review, which shaped the requirements and the design of CampusStay. We also thank FPT University for the capstone programme and the review boards for their comments at Review 1 and Review 2.

# Definition and Acronyms

| Term | Meaning |
|---|---|
| Term | a period of stay with its own registration, prices and rules |
| Block (Building) | a dormitory building; Staff work in their Blocks |
| Room Type / Room Class (Room Tier) | the number of Beds of a Room / its level of furniture and appliances, each with its price |
| Allocation | a Bed given to a student for a Term |
| Deposit / Balance | the part of the Term fee paid on applying / the rest, paid after the assignment |
| Round 2 | offers of the Beds released after the first assignment, to waitlisted students |
| M2 … M7 | the milestones of the Term transition (requests window, filing closed, decisions, reconciliation, next-Term fees, fee deadline) |
| ADR | Architecture Decision Record (the Decision Log of the repository) |
| API / REST | Application Programming Interface / Representational State Transfer |
| CI/CD | Continuous Integration and Continuous Deployment (GitHub Actions) |
| CSV / XLSX | comma-separated values / Excel workbook (imports and exports) |
| ERD | Entity-Relationship Diagram |
| FCM | Firebase Cloud Messaging (push notifications to the Android app) |
| GHCR | GitHub Container Registry |
| JDBC / JPA | Java Database Connectivity / Jakarta Persistence API |
| JWT | JSON Web Token (the Google ID token the API verifies at Google sign-in) |
| LLM | Large Language Model (the students' AI assistant, served by Ollama) |
| OAuth | the authorization protocol behind Google Sign-In |
| SLA | Service Level Agreement: the time limit of a Maintenance Request |
| SMTP | Simple Mail Transfer Protocol (email) |
| TC | Test Case; each id is TC, the feature code and a number, such as `TC-BIL-010` (Report 5) |
| VietQR | the Vietnamese bank-transfer QR code standard used on payment pages |
| VM | Virtual Machine (the Azure server running the API) |
| AUTH, CFG, INV, APP, ASG, BIL, REQ, MNT, NTF, RPT, VIS, AST | the feature codes: accounts, configuration, inventory, applications, assignment and residence, billing, requests, maintenance, notifications, reports, Family Day, AI assistant |

@include Report1.md => # I. Project Introduction

@include Report2.md => # II. Project Management Plan

@include Report3.md => # III. Software Requirement Specification

@include Report4.md => # IV. Software Design Description

@include Report5.md => # V. Software Testing Documentation

@include Report6.md => # VI. Release Package & User Guides
