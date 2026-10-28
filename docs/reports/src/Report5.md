# II. Testing Documentation

## 1. Scope of Testing

**Target of test.** The CampusStay API (every endpoint of `docs/api-contract.md`), the business rules behind it, the scheduled jobs, the web app and the Android app, against the functional requirements of Report 3 (FR-AUTH … FR-MOB) and the non-functional requirements NFR-01 … NFR-06.

| In scope | Out of scope (reason) |
|---|---|
| The 18 mandatory features F-01 … F-18 (Design Brief section 6), each with at least one main-flow case, one data or business-rule case and one exception or permission case | Penetration testing and load above 200 concurrent users (not required for one campus; NFR-01 sets the target) |
| The 5 main workflows WF-01 … WF-05, end to end on the staging environment with demo data | Behaviour of Google, Firebase and Gmail themselves (stubbed or replaced in automated tests) |
| Every state transition of the main entities (Application, Allocation, next-Term Allocation, Invoice, payment claim, Maintenance Request) and the invalid transitions that must be refused | iOS (no iOS app) |
| NFR-01 … NFR-06 with their metric, threshold and method | Real bank transfers (claims are confirmed by Managers; transfers use demo accounts) |
| Permissions and data scope of the four roles (Student, Staff, Manager, Admin) | Browsers other than current Chrome, Edge and Firefox |

**Test levels.**

| Level | In charge | Inputs and time | Focus | Acceptance criteria |
|---|---|---|---|---|
| Unit | Developer of the part (Report 2, ownership) | Every change, `mvn test` (seconds) | Pure logic without the database: assignment engine, Utility split, message translation, Google code exchange, FCM sender, export quoting, CORS and mail settings | All unit tests pass |
| Integration | Developer of the feature; reviewed by the leader | Every change and every push, `mvn verify` locally and in GitHub Actions (about 11 minutes on a laptop) | Each endpoint through HTTP with a real PostgreSQL 17 (Testcontainers), Flyway schema and the test seed; rules, permissions, scope, jobs, events | All integration and architecture tests pass; the deploy job runs only then |
| System | Tester (Võ Minh Luân) with each workflow owner | Before each review and before Defense 1.1, on staging with the demo stages | End-to-end workflows and demo scenarios through the web and Android apps; NFR measurements | 100 % of main scenarios and ≥ 80 % of exception scenarios pass; NFR thresholds met |
| Acceptance | Mentor and the team; the council at the defenses | Weekly mentor meetings; Review 2; Defense 1.1 | Demo scenarios DS-01 … DS-10 on the data the council chooses | Scenarios accepted; no open Critical or High defect |

**Constraints and assumptions.** The dormitory is not operating yet, so test data are fictional (8 Blocks, 3,680 Beds, 6,200 students in the base data; 2 Blocks and 48 students in the test seed). Time-driven rules (deadlines, milestones, jobs) are tested by moving the test clock or the dates in the data, not by waiting. Google sign-in is tested with its token check stubbed and once by hand with a real FPT account; push and email are tested against stub servers. The production server is also the staging environment until the final defense (Report 4 section 1.3.4).

## 2. Test Strategy

### 2.1 Testing Types

| Type | Objective | Technique | Completion criteria |
|---|---|---|---|
| Functional testing | Every FR does what Report 3 says, for the right role | Black-box API tests per endpoint (MockMvc over HTTP with JSON), equivalence classes and boundary values from the business rules, decision tables for the assignment and the refund rules | All feature cases pass; every endpoint verified by at least one integration test (`docs/backend/02_Endpoint_Map.md`) |
| State transition testing | Every transition of the main entities happens only on its trigger, and invalid ones are refused | One case per transition of the state machines of Report 4 section 3.1, plus refused transitions | All TC-ST cases pass |
| Business-rule and data validation testing | Calculations and validations are exact | Boundary values (deadlines, stay length, percentages), field validation per field (`details.fields`), money in integer VND | Rule and validation cases pass |
| Security and permission testing | Roles see and change only what they may (NFR-02) | Each protected endpoint called without a token (401), with the wrong role (403) and on another student's or Block's data (404 / 403) | All permission and scope cases pass |
| Integration with external services | Sign-in, push, email and QR keep working when the services answer, fail or are not configured | Stub servers (`MockRestServiceServer`, a stubbed ID-token verifier), configuration switches | Unit and integration cases pass |
| Architecture testing | Calls go one way: controller → service → repository | Source scan (`LayeringTest`) | Passes on every build |
| Regression testing | A change breaks nothing that worked | The whole automated suite runs in CI on every push; a failing test stops the deploy | Green build before every merge to `main` |
| System (end-to-end) testing | The main workflows work from the first actor's action to the business result | Scenario-based manual tests on staging with the demo stages (DS-01 … DS-10) | 100 % main, ≥ 80 % exception scenarios |
| Performance testing | NFR-01 | Load script with 200 virtual users against a local server with the production configuration | p95 ≤ 1 s, errors < 1 % |
| Usability and localisation testing | NFR-05; phone widths | Scan of every web route in Vietnamese; manual review at 375 px and 1366 px | No English left on Vietnamese screens; no horizontal scroll at 375 px |

### 2.2 Test Levels

| Type of tests | Unit | Integration | System | Acceptance |
|---|---|---|---|---|
| Functional | X | X | X | X |
| State transition | | X | X | |
| Business rule and validation | X | X | | |
| Security and permission | | X | X | |
| External services | X | X | X | |
| Architecture | X | | | |
| Regression | X | X | | |
| End-to-end workflows | | | X | X |
| Performance | | | X | |
| Usability and localisation | | | X | X |

### 2.3 Supporting Tools

| Purpose | Tool | Vendor / in-house | Version |
|---|---|---|---|
| Unit and integration tests | JUnit 5 (Jupiter), AssertJ | Open source | Spring Boot 4.1.1 managed |
| API tests through HTTP | Spring Boot Test, MockMvc | VMware (open source) | 4.1.1 |
| Real database in tests | Testcontainers PostgreSQL | Open source | 2.0.5 (image `postgres:17-alpine`) |
| Build and test run | Maven Surefire (unit), Failsafe (integration) | Apache | Maven 3.10 |
| Continuous integration | GitHub Actions (`backend.yml`, job `verify`) | GitHub | — |
| Test catalog and test documents | `docs/tools/generate-catalogs.mjs`, `docs/tools/gen-test-docs.mjs` | In-house | — |
| Demo data for system tests | Admin › System › Demo data (stages 0, A, B, C), `backend/src/main/resources/db/demo/` | In-house | — |
| Load test | Node.js script with 200 virtual users | In-house (planned) | Node 22 |
| Manual API checks | Postman collection `postman/` | Postman | — |
| Browsers and devices | Chrome, Edge; Android emulator (API 35) and an Android phone | Google, Microsoft | Current |

## 3. Test Plan

### 3.1 Human Resources

| Worker / doer | Role | Specific responsibilities |
|---|---|---|
| Lê Thành Minh Trung | Leader, full-stack developer | Test strategy; unit and integration tests of payments, assignment and residence; reviews every test before merge; owner of WF-01 and WF-05 |
| Nguyễn Xuân Lộc | Backend developer | Integration tests of the Term transition (requests window, next-Term requests, reconciliation, fees); owner of WF-03 |
| Trần Võ Quang Duy | Frontend developer (web) | Web checks of registration periods, the Term wizard, inventory screens, the Vietnamese scan; owner of WF-02 |
| Võ Minh Luân | Mobile developer and tester | Test documentation (this report, the Test Report workbook), system tests and demo scenarios, NFR measurements, Android tests; owner of WF-04 |

### 3.2 Test Environment

| Purpose | Tool | Provider | Version |
|---|---|---|---|
| Unit and integration tests (local) | Windows 10/11, JDK 21, Maven, Docker Desktop | Temurin, Docker | Java 21, Docker 29 |
| Integration tests (CI) | GitHub-hosted runner `ubuntu-latest`, Temurin 21, Docker | GitHub | — |
| Test database | PostgreSQL 17 in Testcontainers with the Flyway schema and `db/test-seed` | PostgreSQL | 17 |
| System tests (staging) | Web https://campusstay-fpt-ten.vercel.app, API https://campusstay-api.eastasia.cloudapp.azure.com/api with the demo stages | Vercel, Microsoft Azure | Current `main` |
| Mobile | Android emulator API 35, phones with Android 8.0 or later | Google | — |
| Load test | Local API with the production configuration and the base data | — | — |

### 3.3 Test Milestones

| Milestone task | Start date | End date |
|---|---|---|
| Unit and integration tests written with each feature (Iteration 1, slices S0–S7 and v2 phases 1–8) | 01/10/2026 | 27/10/2026 |
| Test case design for Review 2 (features, workflows, states, NFRs) | 27/10/2026 | 29/10/2026 |
| Review 2 | 31/10/2026 | 31/10/2026 |
| Concurrency test (TC-NFR-03) and load test (TC-NFR-01) | 02/11/2026 | 15/11/2026 |
| End-to-end workflow tests on staging, round 1 (TC-WF-01 … 05, DS-01 … DS-10) | 02/11/2026 | 20/11/2026 |
| Automation of the workflow tests as API scenario tests in CI; Android UI tests | 09/11/2026 | 30/11/2026 |
| Regression and round 2 of system tests before Defense 1.1 | 01/12/2026 | 10/12/2026 |

## 4. Test Cases

The test cases are kept in the workbook `SWP490_FA26SE260_R2_Report5_TestReport.xlsx` (one sheet per mandatory feature, plus Workflows, State transitions and NFRs) with the fields ID, feature or workflow, pre-conditions, steps, data, expected result, how it runs and the actual result. The unit tests are in `SWP490_FA26SE260_R2_Report5_UnitTest.xls`. Every automated case names the test method that runs it; the full list of the 235 automated tests is `docs/backend/04_Test_Catalog.md`, generated from the tests' Javadoc.

@include _tc-count.md

### 4.1 Mandatory Features

Types: *Main* = main flow; *Rule* = data or business rule; *Exception* = error, permission or data scope. *Automated test* is the test case of `docs/backend/04_Test_Catalog.md` that runs the case; its test method is in the Test Report workbook.

@include _tc-features.md

### 4.2 Main Workflows (end to end)

Run on staging with the demo stages (Admin › System › Demo data), one main scenario per workflow; the exception scenarios are the demo scenarios of the Design Brief (Appendix A2).

@include _tc-workflows.md

### 4.3 State Transitions of the Main Entities

One case per transition of the state machines in Report 4 section 3.1, and four invalid transitions that must be refused. *Test* is the automated test case that runs it (its test method is in the Test Report workbook and `docs/backend/04_Test_Catalog.md`); *Manual* cases have no automated test yet and are run on staging.

@include _tc-states.md

### 4.4 Non-Functional Requirements

@include _tc-nfr.md

### 4.5 Unit Tests

| Class under test | Test class | Tests | What is checked |
|---|---|---|---|
| `AssignmentEngine` | `AssignmentEngineTest` | 6 | Pairs share an empty 2-bed Room; ineligible students are never placed; a missing partner blocks the pair; best-fit Room; priority order and the same proposal for the same input; low fit is marked |
| `UtilitySplit` | `UtilitySplitTest` | 4 | Equal shares for a whole month; shares by days lived between meter cuts; rounding up; nothing to share without an end reading |
| `GoogleCodeExchanger` | `GoogleCodeExchangerTest` | 6 | Code exchange with the redirect URI; used or expired code (401); wrong secret (503); Google unreachable (503); no secret, no call; redirect flow |
| `FcmPushSender` | `FcmPushSenderTest` | 3 | Service-account JWT buys an access token; an unregistered token is reported; the JWT is RS256 with the FCM scope |
| `Messages` | `MessagesTest` | 2 | Exact texts and texts with values are translated; what has no translation stays unchanged |
| `EmailSender` configuration | `EmailSenderConfigTest` | 3 | Demo mailbox redirect of fictional accounts; real accounts unchanged; no SMTP, nothing sent or thrown |
| `SecurityConfig` CORS | `SecurityConfigCorsTest` | 2 | Allowed origins and Vercel preview pattern; other origins refused |
| `ExportService` | `ExportServiceTest` | 1 | CSV quoting, empty cells, campus times, formula neutralisation |

## 5. Test Reports

@include _tc-report.md
