**Automated suite.** Run of `mvn verify` on 28/10/2026 (Windows 10, JDK 21, Docker; the same suite runs in GitHub Actions on every push): 238 tests, 238 passed, 0 failed.

| Code | Feature | Tests | Passed | Failed | Not run |
|---|---|---|---|---|---|
| AUTH | Accounts and access | 56 | 56 | 0 | 0 |
| CFG | Configuration and Terms | 29 | 29 | 0 | 0 |
| INV | Inventory | 25 | 25 | 0 | 0 |
| APP | Applications | 15 | 15 | 0 | 0 |
| ASG | Assignment, residence, Term transition | 29 | 29 | 0 | 0 |
| BIL | Billing and Utility | 22 | 22 | 0 | 0 |
| REQ | Requests, routing, time limits | 16 | 16 | 0 | 0 |
| MNT | Maintenance and inspections | 8 | 8 | 0 | 0 |
| NTF | Notifications | 22 | 22 | 0 | 0 |
| RPT | Reports | 14 | 14 | 0 | 0 |
| | **Total with a test case id** | **236** | **236** | **0** | **0** |

**Designed test cases (section 4).**

| Group | Test cases | Passed | Failed | Not run yet | Test coverage | Test successful coverage |
|---|---|---|---|---|---|---|
| Mandatory features | 79 | 79 | 0 | 0 | 100.0 % | 100.0 % |
| Main workflows | 5 | 0 | 0 | 5 | 0.0 % | 0.0 % |
| State transitions | 68 | 57 | 0 | 11 | 83.8 % | 83.8 % |
| NFRs | 6 | 2 | 0 | 4 | 33.3 % | 33.3 % |
| **Total** | **158** | **138** | **0** | **20** | **87.3 %** | **87.3 %** |

**Analysis.**

- Every automated test passes (238 of 238); every endpoint of the API is verified by at least one integration test (`docs/backend/02_Endpoint_Map.md`). The suite runs on every push in GitHub Actions and a failure stops the deployment.
- 20 designed cases are not run yet: the 5 end-to-end workflow cases, 11 state transitions without an automated test and 4 NFR measurements. They are planned for the first round of system tests on staging (section 3.3) and are known gaps G2–G4 of the Design Brief.
- Automation: 138 of 158 designed cases (87.3 %) run in CI, above the 50 % required for Defense 1.1. Of the executed cases, 100 % pass (threshold 90 %), including every main-flow case of the mandatory features.
- Defects: the defects found during Iteration 1 were fixed in the change that found them, each with a regression test (Project Tracking, sheet Defects); no Critical or High defect is open.
