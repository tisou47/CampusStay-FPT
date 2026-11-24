Each functional requirement of Report 3 section 3 is one controller (the functions of a screen or a group of screens). A test case traces to a requirement when its test code calls one of the requirement's endpoints. 60 of the 63 requirements are reached by at least one test case; the others are listed with "—" and are covered only through other features' flows or by the system tests at the end of section 4.

Table: Requirement to test case traceability
| Feature | Requirement (Report 3 §3) | Endpoints | Test cases |
|---|---|---|---|
| Applications (APP) | Application | 9 | TC-APP-001, TC-APP-002, TC-APP-004, TC-APP-005, TC-APP-006, TC-APP-007 (+12) |
| Applications (APP) | Round2 | 4 | TC-APP-020, TC-APP-021, TC-APP-024 |
| Applications (APP) | Student | 4 | TC-APP-002, TC-APP-005, TC-APP-006, TC-APP-009, TC-APP-023, TC-ASG-010 (+2) |
| Assignment and residence (ASG) | Assignment | 12 | TC-ASG-010, TC-ASG-011, TC-ASG-065 |
| Assignment and residence (ASG) | Check Out Furniture | 8 | TC-ASG-058, TC-ASG-059, TC-ASG-061, TC-ASG-062, TC-INV-030 |
| Assignment and residence (ASG) | Desk | 10 | TC-ASG-020, TC-ASG-021, TC-ASG-022, TC-ASG-046, TC-ASG-058, TC-ASG-060 (+2) |
| Assignment and residence (ASG) | Handover | 15 | TC-ASG-053, TC-ASG-054, TC-ASG-055, TC-ASG-056, TC-ASG-057, TC-ASG-060 (+1) |
| Assignment and residence (ASG) | Late Check In | 5 | TC-ASG-033, TC-ASG-037 |
| Assignment and residence (ASG) | Operational Move | 3 | TC-ASG-043 |
| Assignment and residence (ASG) | Renewal | 6 | TC-ASG-038 |
| Assignment and residence (ASG) | Student Allocation | 1 | TC-ASG-010, TC-ASG-011, TC-ASG-020, TC-ASG-032, TC-ASG-035, TC-ASG-038 (+12) |
| Assignment and residence (ASG) | Termination | 3 | TC-ASG-035, TC-AUTH-055, TC-BIL-048 |
| AI assistant (AST) | Assistant | 2 | TC-AST-001, TC-AST-002, TC-AST-005, TC-AST-009, TC-AST-010, TC-AST-011 (+2) |
| Accounts, staff and audit (AUTH) | Admin User | 5 | TC-AUTH-011, TC-AUTH-012, TC-AUTH-013, TC-AUTH-014, TC-AUTH-015, TC-AUTH-016 (+15) |
| Accounts, staff and audit (AUTH) | Auth | 9 | TC-AUTH-001, TC-AUTH-002, TC-AUTH-003, TC-AUTH-004, TC-AUTH-005, TC-AUTH-006 (+22) |
| Accounts, staff and audit (AUTH) | Block Staff | 14 | TC-AUTH-019, TC-AUTH-057, TC-AUTH-061, TC-AUTH-066, TC-AUTH-067, TC-AUTH-068 (+9) |
| Accounts, staff and audit (AUTH) | Reconciliation | 5 | TC-ASG-044, TC-AUTH-053 |
| Accounts, staff and audit (AUTH) | Refund Account | 3 | TC-APP-025, TC-AUTH-058, TC-BIL-040, TC-BIL-041 |
| Accounts, staff and audit (AUTH) | Staff Account | 4 | TC-AUTH-049, TC-AUTH-050, TC-NTF-040 |
| Accounts, staff and audit (AUTH) | Student Account | 7 | TC-APP-022, TC-AUTH-041, TC-AUTH-042, TC-AUTH-043, TC-AUTH-044, TC-AUTH-045 (+1) |
| Accounts, staff and audit (AUTH) | Student Contact | 6 | TC-AUTH-060 |
| Accounts, staff and audit (AUTH) | Student Import | 5 | TC-AUTH-046, TC-AUTH-047, TC-AUTH-048 |
| Accounts, staff and audit (AUTH) | Student Verification | 2 | TC-AUTH-038, TC-AUTH-039, TC-AUTH-040, TC-AUTH-041 |
| Billing (BIL) | Finance | 9 | TC-BIL-020, TC-BIL-021, TC-BIL-040, TC-RPT-015 |
| Billing (BIL) | Meter | 8 | TC-BIL-023, TC-BIL-024, TC-BIL-025, TC-BIL-026, TC-BIL-039, TC-BIL-045 |
| Billing (BIL) | Payment Claim | 5 | TC-ASG-034, TC-BIL-001, TC-BIL-032, TC-BIL-034 |
| Billing (BIL) | Payment Desk | 3 | TC-BIL-010, TC-BIL-011 |
| Billing (BIL) | Student Invoice | 5 | TC-APP-007, TC-APP-008, TC-ASG-020, TC-ASG-023, TC-ASG-033, TC-ASG-034 (+9) |
| file | File Link | 1 | TC-MNT-015 |
| Inventory (INV) | Admin Building | 5 | TC-CFG-006, TC-INV-001, TC-INV-002, TC-INV-005, TC-INV-012 |
| Inventory (INV) | Admin Furniture | 6 | TC-INV-013, TC-INV-014, TC-INV-026, TC-INV-027 |
| Inventory (INV) | Door Code | 6 | TC-ASG-032, TC-ASG-036, TC-ASG-042, TC-INV-019, TC-INV-020, TC-INV-021 (+1) |
| Inventory (INV) | Furniture | 9 | TC-ASG-045, TC-INV-015, TC-INV-016, TC-INV-017, TC-INV-018, TC-INV-028 (+1) |
| Inventory (INV) | Inventory | 8 | TC-INV-003, TC-INV-004, TC-INV-005, TC-INV-006, TC-INV-007, TC-INV-009 (+5) |
| Inventory (INV) | Room Class | 2 | TC-INV-008, TC-INV-009, TC-INV-010, TC-INV-011 |
| Inventory (INV) | Student Room | 4 | TC-ASG-032, TC-ASG-036, TC-INV-023, TC-INV-029, TC-INV-030 |
| Maintenance and inspections (MNT) | Inspection | 20 | TC-AUTH-101, TC-MNT-004, TC-MNT-005, TC-MNT-006, TC-MNT-007, TC-MNT-010 |
| Maintenance and inspections (MNT) | Maintenance | 7 | TC-AUTH-019, TC-AUTH-072, TC-MNT-001, TC-MNT-002, TC-MNT-008, TC-MNT-011 (+3) |
| Notifications (NTF) | Admin Messaging | 6 | TC-NTF-030, TC-NTF-031, TC-NTF-032, TC-NTF-038 |
| Notifications (NTF) | Announcement | 5 | TC-CFG-021, TC-CFG-022, TC-CFG-024, TC-NTF-041, TC-NTF-042, TC-NTF-043 |
| Notifications (NTF) | Device | 2 | — |
| Notifications (NTF) | Notification | 3 | TC-APP-002, TC-APP-005, TC-APP-010, TC-APP-020, TC-APP-021, TC-APP-026 (+40) |
| Reports (RPT) | Report | 9 | TC-BIL-050, TC-RPT-001, TC-RPT-002, TC-RPT-003, TC-RPT-004, TC-RPT-005 (+7) |
| Reports (RPT) | Search | 1 | — |
| Requests and Term transition (REQ) | Escalation | 2 | TC-REQ-026 |
| Requests and Term transition (REQ) | Next Term Request | 6 | — |
| Requests and Term transition (REQ) | Room Change | 5 | TC-REQ-001, TC-REQ-002 |
| Requests and Term transition (REQ) | Routing | 4 | TC-REQ-013 |
| Requests and Term transition (REQ) | Student Requests | 1 | TC-MNT-001 |
| Requests and Term transition (REQ) | Swap | 8 | TC-REQ-010, TC-REQ-011 |
| Terms and settings (CFG) | Admin Catalog | 6 | TC-CFG-005, TC-CFG-006, TC-CFG-007, TC-CFG-008, TC-INV-005, TC-INV-009 |
| Terms and settings (CFG) | Admin Policy | 13 | TC-AUTH-079, TC-CFG-008, TC-CFG-009, TC-CFG-010, TC-CFG-011, TC-CFG-012 (+5) |
| Terms and settings (CFG) | Admin Term | 5 | TC-AUTH-004, TC-CFG-002, TC-CFG-003, TC-CFG-021, TC-CFG-022, TC-CFG-023 (+2) |
| Terms and settings (CFG) | Block Settings | 2 | TC-CFG-014 |
| Terms and settings (CFG) | Catalog | 1 | TC-APP-001, TC-CFG-021 |
| Terms and settings (CFG) | Demo | 3 | TC-CFG-026, TC-CFG-027, TC-CFG-028, TC-CFG-029 |
| Terms and settings (CFG) | Registration Period | 2 | TC-CFG-023 |
| Terms and settings (CFG) | Term | 1 | TC-APP-001, TC-CFG-001, TC-CFG-034 |
| Terms and settings (CFG) | Term Request | 7 | TC-CFG-016, TC-CFG-017, TC-CFG-018, TC-CFG-019, TC-CFG-030 |
| Family Day (VIS) | Family Day | 9 | TC-VIS-001, TC-VIS-002, TC-VIS-003, TC-VIS-004, TC-VIS-006, TC-VIS-007 (+2) |
| Family Day (VIS) | Family Day Stats | 2 | TC-VIS-010 |
| Family Day (VIS) | Student Family Day | 5 | TC-VIS-001, TC-VIS-002, TC-VIS-004, TC-VIS-007, TC-VIS-008, TC-VIS-009 |
| Family Day (VIS) | Visitor Desk | 5 | TC-VIS-007 |
