| ID | NFR | Metric | Threshold | Method | Run | Result |
|---|---|---|---|---|---|---|
| TC-NFR-01 | NFR-01 Performance | p95 of the 10 most used read endpoints with 200 concurrent users on the base data | ≤ 1 s, errors < 1 % | Load script (Node, 200 virtual users, 10 minutes) against a local server with the production configuration | Manual (script) | Not run |
| TC-NFR-02 | NFR-02 Security | Permission and scope tests passing | 100 % | Automated: TC-AUTH-004, 016, TC-APP-009, TC-BIL-006, TC-INV-003, 007, TC-MNT-003, TC-ASG-021, TC-CFG-012 in mvn verify | Automated | Passed |
| TC-NFR-03 | NFR-03 Integrity | Allocations of one Bed in one Term after parallel commits | 0 duplicates | Concurrency test: 20 parallel requests for the same Bed, then count active Allocations per Bed and Term | Automated (planned) | Not run |
| TC-NFR-04 | NFR-04 Availability | Share of 5-minute health checks answering UP | ≥ 99 % from 01/11/2026 | External uptime check of GET /api/actuator/health every 5 minutes | Manual (monitor) | Not run |
| TC-NFR-05 | NFR-05 Usability (two languages) | API messages and web texts with a Vietnamese translation | 100 % | TC-NTF-036, 037 (MessagesTest) and the scan of every web route in Vietnamese | Automated + scan | Passed |
| TC-NFR-06 | NFR-06 Deployability | Time from push to a healthy production API; rollback time | ≤ 15 min; ≤ 5 min | GitHub Actions run duration of the last 10 deployments; timed rollback with API_TAG | Manual (measure) | Not run |
