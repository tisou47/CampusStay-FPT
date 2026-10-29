// Data of the Project Tracking workbook (WBS, Issues, Defects, Q&A) for Review 2, then fills the school's template
// with docs/tools/fill-workbook.ps1.   node docs/reports/src/tracking.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const T = 'Lê Thành Minh Trung', L = 'Nguyễn Xuân Lộc', D = 'Trần Võ Quang Duy', V = 'Võ Minh Luân';

// WBS: every functional requirement of Report 3 (Iteration 1, done) and the work planned after Review 2.
const FEATURE = { AUTH: 'Accounts and access', CFG: 'Registration periods and configuration', INV: 'Inventory', APP: 'Applications', ASG: 'Assignment, residence, Term transition', BIL: 'Payments and billing', REQ: 'Next-Term requests, routing, time limits', MNT: 'Maintenance and inspections', NTF: 'Notifications', RPT: 'Reports', MOB: 'Android app' };
const COMPLEX = new Set(['FR-AUTH-02', 'FR-AUTH-04', 'FR-AUTH-05', 'FR-AUTH-08', 'FR-CFG-03', 'FR-CFG-05', 'FR-INV-04', 'FR-APP-02', 'FR-ASG-01', 'FR-ASG-03', 'FR-ASG-04', 'FR-ASG-06', 'FR-ASG-07', 'FR-ASG-08', 'FR-ASG-10', 'FR-BIL-03', 'FR-BIL-04', 'FR-BIL-05', 'FR-REQ-02', 'FR-REQ-03', 'FR-REQ-05', 'FR-REQ-07', 'FR-MNT-04', 'FR-NTF-02', 'FR-RPT-02', 'FR-MOB-01']);
const SIMPLE = new Set(['FR-APP-06', 'FR-CFG-02', 'FR-CFG-07', 'FR-INV-05', 'FR-RPT-04', 'FR-NTF-01', 'FR-AUTH-09', 'FR-APP-04']);
const wbs = [];
for (const line of fs.readFileSync(path.join(here, 'r3-fr.md'), 'utf8').split('\n')) {
  const m = line.match(/^#### 3\.\d+\.\d+ (FR-([A-Z]+)-\d+) (.*)$/);
  if (!m) continue;
  wbs.push([String(wbs.length + 1), m[3], FEATURE[m[2]], COMPLEX.has(m[1]) ? 'Complex' : SIMPLE.has(m[1]) ? 'Simple' : 'Medium', `${m[1]} (Report 3 §${line.split(' ')[1]})`, 'Iteration 1', 'Done']);
}
for (const [name, feature, level, details, planned, status] of [
  ['API documentation: Swagger UI and the OpenAPI document; Postman collection by role with smoke tests', 'Testing', 'Medium', 'springdoc-openapi; postman/ (288 requests, 49 smoke tests); docs/tools/generate-postman.mjs', 'Iteration 1', 'Done'],
  ['End-to-end workflow tests WF-01..05 on staging', 'Testing', 'Complex', 'TC-WF-01..05, demo scenarios DS-01..10', 'Iteration 2', 'Pending'],
  ['Automation of the workflow tests in CI', 'Testing', 'Complex', 'API scenario tests (gap G2)', 'Iteration 2', 'Pending'],
  ['Load test NFR-01, uptime monitor NFR-04, deployment times NFR-06', 'Testing', 'Medium', 'TC-NFR-01, 04, 06 (gap G3)', 'Iteration 2', 'Pending'],
  ['Concurrency test one Allocation per Bed per Term', 'Testing', 'Medium', 'TC-NFR-03 (gap G4)', 'Iteration 2', 'Pending'],
  ['Mobile app UI tests (sign-in, payment claim, door code)', 'Mobile app (Flutter)', 'Medium', 'Gap G5', 'Iteration 2', 'Pending'],
  ['Fixes from Review 2 and the self-review (BM02 Planned items)', 'All', 'Medium', 'Review 2 Commitment (BM04)', 'Iteration 2', 'Pending'],
  ['Report 6 User Guides, updated Reports 1–5, Full Software Package', 'Documents', 'Medium', 'Before Defense 1.1', 'Iteration 3', 'Pending'],
  ['Report 7, defense slides, final package', 'Documents', 'Medium', 'Final defense', 'Iteration 3', 'Pending'],
]) wbs.push([String(wbs.length + 1), name, feature, level, details, planned, status]);

const issues = [
  ['Review 1: the Tân Uyên dormitory is not operating; what is the basis of the design?', 'Requirements may not fit real operation', 'High', T, '30/09/2026', '27/10/2026', 'Closed', 'Basis stated in Report 1 §2 and the registration form 2.0: FPT dormitories, Circular 27/2011, VNU-HCM, configurable rules'],
  ['Review 1: what makes the solution practical?', 'Scope credibility', 'High', T, '30/09/2026', '27/10/2026', 'Closed', 'Production deployment with demo stages; configurable rules; Report 1 §5'],
  ['Review 1: identify the current operation of the Tân Uyên dormitory to derive requirements', 'Requirements', 'High', T, '30/09/2026', '27/10/2026', 'Closed', 'Workflows WF-01..05 and business rules (Report 3 §5.1), assumptions listed'],
  ['Review 1: add the Manager role (general management, reports, statistics, Block management)', 'Actors, permissions, screens', 'High', T, '30/09/2026', '24/10/2026', 'Closed', 'Change Specification v2 phase 1–2; Manager portal'],
  ['No bank API or payment-gateway contract for automatic payment matching', 'Payments cannot be confirmed automatically', 'High', T, '20/10/2026', '26/10/2026', 'Closed', 'ADR-22: claims confirmed by Managers (v2 phase 5)'],
  ['Members other than the leader have written little of Iteration 1 code (bus factor)', 'Ownership verification at Review 2 and Defense 1.1', 'High', T, '27/10/2026', '', 'Open', 'Ownership map, training plan (Report 2 §2.3); each member changes their part before Defense 1.1'],
  ['End-to-end workflow tests and NFR measurements not done yet', 'Defense 1.1 thresholds', 'Medium', V, '28/10/2026', '', 'Open', 'Iteration 2 (sprints S5–S6)'],
  ['Defense 1.1 and final defense dates not announced', 'Planning of Iteration 2–3', 'Medium', T, '28/10/2026', '', 'Open', 'Ask the department; plan assumes Defense 1.1 mid-December'],
  ['Azure for Students credit and the free database period', 'Production could stop before the final defense', 'Medium', T, '23/10/2026', '', 'Open', 'Budget alert $5/month; runbook for another VPS'],
];

// Defects: the fix commits of Iteration 1 and the inconsistencies found while writing the Review 2 documents.
const defects = [
  ['Reports', 'Dashboards (all roles)', T, 'Dashboards failed before the first Term existed', T, 'Closed', 'fix(rpt) 22/10/2026; regression TC-RPT-011'],
  ['Reports', 'Occupancy, finance reports', T, 'Past Terms lost their reports; refunds without a Bed were not counted by gender', T, 'Closed', 'fix(rpt) 22/10/2026; TC-RPT-010'],
  ['DevOps', 'Deploy job', T, 'A deploy key pasted with Windows line ends broke the SSH deploy', T, 'Closed', 'fix(deploy) 24/10/2026'],
  ['Web', 'Vercel production build', T, 'Production deployments on Vercel were skipped when only backend files changed', D, 'Closed', 'fix(web) 24/10/2026'],
  ['Accounts', 'Startup', T, 'Spring created a default user and printed its password in the log', T, 'Closed', 'fix(auth) 24/10/2026; TC-AUTH-028'],
  ['Accounts', 'Admin setup checks, texts', T, 'Texts still named "the Block Manager"; the setup check did not ask for Staff per Block', T, 'Closed', 'fix(auth) 24/10/2026'],
  ['Accounts', 'Sign in with Google (web)', T, 'Google sign-in failed when the browser blocked the popup', T, 'Closed', 'fix(auth) 25/10/2026; TC-AUTH-051, 052'],
  ['Web', 'Student Home', T, 'Student Home did not scroll; the Term timeline wrapped', D, 'Closed', 'fix(web) 27/10/2026'],
  ['Web', 'Back-office search, sidebar', T, 'Search label wrapped; sidebar labels cut', D, 'Closed', 'fix(web) 27/10/2026'],
  ['Registration periods', 'Term wizard, Rooms and places step', T, 'Places row misaligned; excluded Rooms typed by hand only', D, 'Closed', 'feat(web) 27/10/2026: import from Excel/CSV; TC-INV-025'],
  ['Billing', 'Utility debt job', T, 'The final warning could be issued again for the same debt', T, 'Closed', 'Fixed with the demo tool 27/10/2026'],
  ['Documents', 'SDD state machines', T, 'Application, Allocation and Invoice state machines missed transitions used in code', T, 'Closed', 'Report 4 §3.1 redrawn from the code 28/10/2026'],
  ['Documents', 'Backend architecture note', T, 'Architecture note still named Flutter for the Android app', V, 'Closed', 'docs 28/10/2026'],
  ['Web', 'Student Home', T, 'Student Home crashed after a Deposit claim while nothing was due and no Bed was given', T, 'Closed', 'fix 28/10/2026 (commit 4138397)'],
  ['Web', 'Manager › Student hub', T, 'The Student hub crashed for a student with a Room (unknown table size)', T, 'Closed', 'fix 28/10/2026 (commit 4138397)'],
  ['Inventory', 'Room map', T, 'The room map showed thin lines instead of bed squares', D, 'Closed', 'fix 28/10/2026 (commit 4138397)'],
  ['Accounts', 'Student list and reconciliation templates', T, 'Excel set to Vietnamese opened the comma CSV template as one column', T, 'Closed', 'fix 28/10/2026: XLSX templates (commit 4138397)'],
  ['Reports', 'Manager and Admin dashboards', T, 'Money collected differed between the dashboards and Collections and refunds (Deposits without a Bed left out); a rate with debt left could read 100 %', T, 'Closed', 'fix 30/10/2026 (A-63); TC-RPT-015'],
  ['Reports', 'Admin dashboard', T, 'Residents counted only desk check-ins, not released door codes (ADR-23)', T, 'Closed', 'fix 30/10/2026 (A-63); TC-RPT-015'],
  ['Documents', 'Web screen map', T, 'The screen map generator found only the public pages after the router loaded pages on first visit', T, 'Closed', 'docs 30/10/2026: generator reads lazy page imports'],
  ['Documents', 'Report 2', T, 'Report 2 PDF still named Kotlin and Jetpack Compose after the mobile app moved to Flutter', V, 'Open', 'Rebuild Report 2 from its source (Flutter since 28/10/2026)'],
];

const qa = [
  ['30/09/2026', 'How can a dormitory that does not operate yet be specified?', 'Review 1 council', 'High', 'Closed', 'Use FPT\'s operating dormitories, regulations and comparable systems; keep rules configurable (Report 1 §2)'],
  ['30/09/2026', 'Which roles are needed?', 'Review 1 council', 'High', 'Closed', 'Add the Manager (general management, reports, Block management)'],
  ['20/10/2026', 'Is the scope of the API contract and UI confirmed?', 'Team → mentor', 'High', 'Closed', 'Confirmed by the mentor (ADR-12)'],
  ['24/10/2026', 'May payments be confirmed by Managers instead of a bank integration?', 'Team → mentor', 'High', 'Closed', 'Yes; no bank contract is available (ADR-22)'],
  ['28/10/2026', 'May the production server serve as the staging (demo) environment for Defense 1.1?', 'Team → reviewers', 'Medium', 'Open', 'Proposed in Report 4 §1.3.4; to confirm at Review 2'],
  ['28/10/2026', 'Is the NFR-01 load test on a local server with the production configuration accepted?', 'Team → reviewers', 'Medium', 'Open', 'Proposed in the Design Brief §7; to confirm at Review 2'],
  ['28/10/2026', 'Dates of Defense 1.1 and the final defense?', 'Team → department', 'Medium', 'Open', ''],
];

const cfg = {
  template: 'templates/SEP490_docs/Report3_Project Tracking.xlsx',
  out: 'docs/reports/out/SWP490_FA26SE260_R2_ProjectTracking.xlsx',
  sheets: [
    { name: 'WBS', startRow: 8, startCol: 1, rows: wbs },
    { name: 'Issues', startRow: 4, startCol: 1, rows: issues.map((r, i) => [String(i + 1), ...r]) },
    { name: 'Defects', startRow: 4, startCol: 1, rows: defects },
    { name: 'Q&A', startRow: 4, startCol: 1, rows: qa },
  ],
};
const file = path.join(root, 'docs/reports/build/tracking.json');
fs.writeFileSync(file, JSON.stringify(cfg, null, 1));
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'docs/tools/fill-workbook.ps1'), '-Config', file], { stdio: 'inherit', cwd: root });
