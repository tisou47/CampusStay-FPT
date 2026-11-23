| Level | Tests | How they run |
|---|---|---|
| Unit (backend) | 46 | mvn test: one class alone, fakes and stub HTTP servers, no database |
| Integration (backend, Testcontainers) | 343 | mvn verify: the whole Spring application against PostgreSQL 17 in a container, requests through MockMvc |
| Web (node:test) | 7 | npm test in web/: the pure functions of src/lib |
| Mobile (Flutter test) | 30 | flutter test in mobile/: widgets and logic |
