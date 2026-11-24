# II. Testing Documentation

Every number in this document comes from one run of all automated suites on the code of this release; the test cases are read from the test code (`backend/src/test`, `web/src/lib`, `mobile/test`). The same cases fill the two workbooks next to this document: **Report5_Test Report.xlsx** (one sheet per feature, with the result of the run) and **Report5_Unit Test.xls** (one sheet per class under unit test).

## 1. Scope of Testing

In scope: the twelve features of the system (Report 3), through the REST API that the web and the mobile app call, plus the logic of the web application and of the Android app. Each backend test case has an id made of TC, the feature code and a number (`TC-BIL-010`), written in the test's comment; the case is the test.

@include _r5-scope.md

Out of scope: the look of the screens (no visual or screenshot tests), load and performance tests, and the external services themselves (Google Sign-In, Firebase Cloud Messaging, SMTP, VietQR, Ollama): the tests replace them with fakes or stub HTTP servers.

## 2. Test Strategy

### 2.1 Testing Types

- **Functional testing** of every endpoint: the request, the response and what the database holds afterwards.
- **Authorization testing**: each role and permission is refused where Report 3 says so (401 without a session, 403 without the permission or outside the Staff member's Blocks or shift).
- **Validation and error testing**: wrong input gets the documented error code and message in both languages.
- **Data integrity testing**: the database constraints (a Bed given once per Term, issued Invoices that cannot change, the state CHECKs) refuse what the services must never write.
- **Regression testing**: each review or audit finding that was fixed got a test that failed before the fix (package `regression`, one class per area).
- **Architecture testing**: `LayeringTest` fails the build when a controller imports a repository, an entity or Spring JDBC, or when a lower layer imports a controller.

### 2.2 Test Levels

@include _r5-levels.md

- **Unit**: one class alone (pricing and refund rules, parsers, schedulers, the assistant's prompt, the layering rule). The classes and their cases are listed in Report5_Unit Test.xls:

@include _r5-units.md

- **Integration**: the whole Spring Boot application started once per test class against PostgreSQL 17 in a Testcontainers container, migrated by Flyway and loaded with the test seed; requests go through MockMvc with real sessions. Most test cases of section 4 are at this level.
- **Web** and **mobile**: the pure logic of `web/src/lib` with the Node.js test runner, and the widgets and logic of the Android app with `flutter test`.
- **Acceptance**: before each review the team walks through the main workflows on production with the demo data stages (Admin › System › Demo data). These walkthroughs are not counted in section 5.

### 2.3 Supporting Tools

| Tool | Use |
|---|---|
| JUnit 5, AssertJ, Spring Boot Test (MockMvc) | backend unit and integration tests |
| Testcontainers (PostgreSQL 17) | a real database for every integration test class |
| JaCoCo | coverage of the backend tests (`backend/target/site/jacoco`) |
| Node.js test runner (`node --test`) | web logic tests |
| Flutter test | mobile widget and logic tests |
| GitHub Actions | runs `mvn verify` and the web checks (`npm test`, the translation check, the build) on every pull request and every push to `main` that touches `backend/` or `web/` (each workflow is filtered by path); a failing test stops the deployment |
| Postman (collection `CampusStay API`) | manual calls during development, Local and Production environments |

## 3. Test Plan

### 3.1 Human Resources

Each member writes the tests of the features they build (Report 2, section on responsibilities); CI runs the backend and web tests on every pull request that touches `backend/` or `web/`.

@include _ownership.md

### 3.2 Test Environment

| Environment | Setup |
|---|---|
| Developer machine | JDK 21, Maven, Docker (for Testcontainers), Node.js 22, Flutter SDK; `mvn -B verify` in `backend/`, `npm test` in `web/`, `flutter test` in `mobile/` |
| CI | GitHub Actions on `ubuntu-latest` (pull requests and pushes to `main` that touch `backend/` or `web/`): Temurin JDK 21 and Docker for the backend, Node.js 22 for the web |
| Acceptance | production: web on Vercel, API on the Azure VM with Azure Database for PostgreSQL, demo data loaded by stage; browsers Chrome and Edge, Android 8.0 or later |

### 3.3 Test Milestones

| Milestone | Date | Testing done |
|---|---|---|
| Review 1 | 30/09/2026 | analysis and design; no code or tests yet |
| Review 2 | 31/10/2026 | integration tests of the features built so far, run by CI |
| Weeks 9–13 | from 02/11/2026 | each new feature merged with its tests; regression tests for every review finding |
| Defense 1.1 | December 2026 | full run of every suite (this report), acceptance walkthrough on production |

## 4. Test Cases

**Traceability.**

@include _r5-trace.md

**Exception scenarios.**

@include _r5-exceptions.md

One table per feature: the id, what the case checks (the test's comment), the procedure (the test and the API calls it makes, in order), the expected result (the HTTP statuses it expects and how many checks it makes) and the result of the run. The same rows, with their preconditions, are in Report5_Test Report.xlsx.

@include _r5-cases.md

## 5. Test Reports

Results of the run, per feature and per level. Pending means the case has not been run yet: the system tests are run by the team on the deployed system, each with a screenshot as evidence.

@include _r5-results.md

**Coverage.**

@include _r5-coverage.md
