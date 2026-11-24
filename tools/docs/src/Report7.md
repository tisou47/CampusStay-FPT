# Acknowledgement

We thank our mentor, Ms. Thân Thị Ngọc Vân, for her weekly guidance and her feedback at every review, which shaped the requirements and the design of CampusStay. We also thank FPT University for the capstone programme and the review boards for their comments at Review 1 and Review 2.

# Definition and Acronyms

Table: Definitions
| Term | Meaning |
|---|---|
| Allocation | a Bed given to a student for a Term |
| Balance | the rest of the Term fee, paid after the assignment |
| Block (Building) | a dormitory building; Staff work in their Blocks |
| Deposit | the part of the Term fee paid when applying |
| M2 … M7 | the milestones of the Term transition: requests window, filing closed, decisions, reconciliation, next-Term fees, fee deadline |
| Room Class (Room Tier) | the level of furniture and appliances of a Room, with its price |
| Room Type | the number of Beds of a Room, with its price |
| Round 2 | offers of the Beds released after the first assignment, to waitlisted students |
| Term | a period of stay with its own registration, prices and rules |
| VietQR | the Vietnamese bank-transfer QR code standard used on payment pages |

Table: Abbreviations
| Abbreviation | Meaning |
|---|---|
| API | Application Programming Interface |
| CI/CD | Continuous Integration and Continuous Deployment (GitHub Actions) |
| CSV | Comma-Separated Values (imports and exports) |
| ERD | Entity-Relationship Diagram |
| FCM | Firebase Cloud Messaging (push notifications to the Android app) |
| GHCR | GitHub Container Registry |
| JDBC | Java Database Connectivity |
| JPA | Jakarta Persistence API |
| JWT | JSON Web Token (the Google ID token the API verifies at Google sign-in) |
| LLM | Large Language Model (the students' AI assistant, served by Ollama) |
| OAuth | Open Authorization, the protocol behind Google Sign-In |
| REST | Representational State Transfer |
| SLA | Service Level Agreement: the time limit of a Maintenance Request |
| SMTP | Simple Mail Transfer Protocol (email) |
| TC | Test Case; each id is TC, the feature code and a number, such as `TC-BIL-010` (Report 5) |
| VM | Virtual Machine (the Azure server running the API) |
| XLSX | Excel workbook format |

Table: Feature codes
| Code | Feature |
|---|---|
| APP | Applications |
| ASG | Assignment and residence |
| AST | AI assistant |
| AUTH | Accounts, staff and audit |
| BIL | Billing |
| CFG | Terms and settings |
| INV | Inventory |
| MNT | Maintenance and inspections |
| NTF | Notifications |
| REQ | Requests and Term transition |
| RPT | Reports |
| VIS | Family Day |

@include Report1.md => # I. Project Introduction

@include Report2.md => # II. Project Management Plan

@include Report3.md => # III. Software Requirement Specification

@include Report4.md => # IV. Software Design Description

@include Report5.md => # V. Software Testing Documentation

@include Report6.md => # VI. Release Package & User Guides
