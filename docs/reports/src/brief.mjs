// Content of the Design Brief (form BM01) and of the registration form's Record of Changes (BM03). Writes the
// configs that docs/tools/fill-form.ps1 puts into the Word forms, then runs it.
//   node docs/reports/src/brief.mjs [BM01|BM03]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const forms = 'D:/Workspace/SWP490_R2_BM04_Review2-Document';
const tc = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/data/testcases.json'), 'utf8'));
const c = tc.counts;
const DATE = '28/10/2026';
const PROJECT = "CampusStay FPT – Dormitory Registration and Room-Scheduling Management System for FPT University's Tân Uyên Campus, Binh Duong";
const T = 'Lê Thành Minh Trung', L = 'Nguyễn Xuân Lộc', D = 'Trần Võ Quang Duy', V = 'Võ Minh Luân';

const ACCEPT = {
 "F-01": "Valid credentials give a session; the 5th wrong password locks the account; a new @fpt.edu.vn Google account gets no password until it sets one; no token → 401, wrong role → 403",
 "F-02": "A pending account cannot apply; verify/reject notifies the student; an import previews each line and saves only valid lines",
 "F-03": "A 2nd open request for a Term is refused; milestones out of order are named per field; publishing fixes the prices",
 "F-04": "Submit creates an Awaiting Deposit Application and a Deposit = Deposit % × Term price; a 2nd Application or stay length above the maximum is refused",
 "F-05": "A claim stops the deadline; a rejection needs a reason and returns the time left (≥ 12 h); a Paid or Void Invoice cannot be claimed",
 "F-06": "A rejection needs a note; the same input gives the same proposal; commit creates Allocations and Balances; Staff cannot run",
 "F-07": "A Balance unpaid at its deadline is forfeited; the code is released only when paid, after check-in start and with a confirmed code",
 "F-08": "Check-in is refused until the Balance is paid; check-out deducts Utility share and damage per item from the Utility Deposit",
 "F-09": "A request after check-in end + max days is refused; approval moves the Balance deadline; rejection needs a reason",
 "F-10": "An approved change moves the next-Term Bed; a Room Class change needs all continuing roommates; extension without debt is automatic",
 "F-11": "M2 creates next-Term Allocations once; M3 releases un-extended Beds; fees wait for decisions and reconciliation; M7 releases unpaid Beds",
 "F-12": "A move reads both meters, charges nothing and asks a new code for the old Room; after fees Staff cannot move next-Term Beds",
 "F-13": "A request gets the routed assignee and the Block deadline (urgent < normal); other Blocks' Staff do not see it; unassigned ones escalate",
 "F-14": "A reading below the previous is refused; a CSV with a bad line saves nothing; closing issues Invoices split by days, rounded up",
 "F-15": "One overdue Utility Invoice gives warning 1 once; two overdue months after the final warning terminate the stay; past move-out it is Overdue",
 "F-16": "A Room whose Beds are given keeps its class; only Managers set classes; moving an item updates conformance",
 "F-17": "Staff announce only to their Blocks; pinned announcements top the board; push after commit, dead tokens disabled",
 "F-18": "Exports are CSV with the screen's columns and audited; search stays in the user's Blocks; Term dashboard shows milestones"
};
const features = tc.features.map((f) => {
  const cases = tc.featureCases.filter((x) => x.group === f.id);
  return [f.id, f.name, f.actors, ACCEPT[f.id], `TC-${f.id.replace('-', '')}-01..${String(cases.length).padStart(2, '0')}`, 'Done'];
});
const wf = tc.workflows;
const pct = (a, b) => `${Math.round((100 * a) / b)} %`;

const BM01 = {
  template: `${forms}/SWP490_R2_BM01_Design_Brief_1.docx`,
  out: 'docs/reports/out/SWP490_FA26SE260_R2_DesignBrief',
  deleteColor: 6710886,
  paragraphs: [
    { after: '2. System at a Glance', text: 'FPT University\'s Tân Uyên campus will open dormitories for thousands of students and has no system to run them. CampusStay FPT takes a student from sign-in to a Bed and through every Term of the stay: Applications by Room Type and Room Class, a fair batch assignment, VietQR payments confirmed by Managers, door codes, the check-in and check-out desk, Term transitions for continuing residents, maintenance with time limits, monthly Utility billing and reports. Users: students (web and Android), Staff of each Block, dormitory Managers and the Administrator. Core value: every Bed, payment and deadline follows one set of configurable rules, with an audit trail, instead of spreadsheets and messages. Architecture: one Spring Boot API with PostgreSQL, a React web app and an Android app (Report 4 §1.1, Figure 1).' },
  ],
  replaceText: [['Automated in CI: at least 50% of the committed total.', `Automated in CI: ${c.automated} of ${c.total} committed test cases (${pct(c.automated, c.total)}); the rest are the end-to-end workflow cases, the manual state transitions and the measured NFRs (Report 5 §4).`]],
  tables: [
    { index: 1, column: 2, values: ['FA26SE260', PROJECT, `CampusStay FPT — ${T} (Leader, SE183752), ${L} (SE183782), ${D} (SE182146), ${V} (SE182794)`, 'Thân Thị Ngọc Vân', 'https://github.com/tisou47/CampusStay-FPT/tree/review-2', '1.0', DATE] },
    { index: 2, fontSize: 9, widths: [2.8, 3.6, 6.6, 4], rows: [
      ['Team, context, actors', 'No members; Bình Dương; Student, Staff, Admin', '4 members; Tân Uyên ward, HCMC; basis of requirements stated; + Manager (all Blocks), Staff per Block', 'Review 1 feedback; 2025 merger'],
      ['Room choice, contract, check-in/out', 'Select room/bed; digital contract; self check-in/out', 'Choose Room Type and Class, engine assigns; consent to rules; desk check-in (QR pass) and check-out (damage per item); door codes', 'Fairness; no e-signature; keys need Staff'],
      ['Payment, communication', 'VietQR payment; in-app, email, SMS', 'VietQR transfer + claim confirmed by a Manager; in-app, push, email', 'No bank API; SMS cost'],
      ['Added scope', '—', 'Term transition (stay length, requests window, next-Term fees), registration-period requests, late check-in, Round 2, Utility and debt', 'Iteration 1: a dorm runs across Terms'],
      ['Integration, technology', 'SIS link; forecast; Flutter', 'Student list import + reconciliation; dashboards; Android (Kotlin)', 'SIS not accessible'],
    ] },
    { index: 3, fontSize: 9, widths: [6, 11], rows: [
      ['Room or Bed self-selection by students', 'The engine keeps gender and Block rules and fairness (D2)'],
      ['Electronic contract signing', 'Needs a legal e-signature provider; consent is recorded instead'],
      ['SMS notifications', 'Cost; in-app, push and email cover the cases'],
      ['Live SIS integration, bank API, forecasting, iOS app', 'No access or contract; list import, reconciliation, Manager confirmation, reports and Android instead'],
    ] },
    { index: 4, fontSize: 9, widths: [0.8, 2.3, 3.2, 6.6, 2.0, 2.1], rows: [
      ['D1', 'System structure', 'Microservices; modular monolith', 'One Spring Boot API + one PostgreSQL, layered packages per feature: Allocation and payment in one ACID transaction; one API for three clients', T, 'SDD §1.1–1.2'],
      ['D2', 'How Beds are given', 'Pick a Bed first come; Staff by hand; batch engine', 'Students choose Room Type and Class; a deterministic engine places by priority and fit; a Manager approves per Block: fair, no race', T, 'FR-ASG-01..03'],
      ['D3', 'Renewal of residents', 'Re-apply each Term; auto-renew', 'Next-Term Allocation on the same Bed at M2; requests to M3, decisions by M4, fees M6, unpaid at M7 releases the Bed', L, 'FR-ASG-07, 08; act-wf03'],
      ['D4', 'Room Class and prices', 'Class per Floor; prices editable', 'Class per Room per Term; prices copied into the Term at publication and locked once Invoices exist', D, 'FR-INV-02, FR-CFG-05'],
      ['D5', 'Notification channels', 'SMS gateway; email only', 'In-app always, FCM push, email via an outbox in the same transaction: no SMS cost, nothing lost, two languages', V, 'FR-NTF-01, 02'],
    ] },
    { index: 5, fontSize: 9, widths: [0.8, 4.4, 2.4, 7.2, 2.2], rows: [
      ['R1', 'Dormitory not operating yet: real operation may differ', 'Rework after opening', "Requirements from FPT's running dorms, Circular 27/2011, VNU-HCM; every price, window and rule configurable; weekly mentor review", T],
      ['R2', 'Manual claim confirmation at the peak (≈ 3,000 Deposits in 48 h)', 'Students wait', 'Claim stops the clock; bulk confirm with count and total; hourly summary', T],
      ['R3', 'One small VM and a Burstable database', 'Slow or down at peak', 'NFR-01 load test; health check and rollback by image tag; bigger VM in the runbook', V],
    ] },
    { index: 6, fontSize: 9, widths: [0.8, 6.0, 2.6, 4.0, 2.0, 1.6], rows: [
      ['G1', 'Registration v1 items not built as written (self-selection, e-contract, self check-in/out, SMS, forecast, live SIS)', 'Registration form', 'Form v2 changes them (BM03)', T, '31/10/2026'],
      ['G2', 'Workflow tests TC-WF-01..05 are manual (SR-21)', 'Report 5 §4.2', 'Run on staging; automate in CI', V, '30/11/2026'],
      ['G3', 'NFR-01, 04, 06 not measured yet (SR-06)', 'Report 5 §4.4', 'Load script, uptime check, run times', V, '15/11/2026'],
      ['G4', 'No concurrency test for one Allocation per Bed per Term (SR-06)', 'TC-NFR-03', 'Parallel-commit test', L, '15/11/2026'],
      ['G5', 'Android app has no automated or manual test cases (SR-08)', 'android/, Report 5', 'UI tests of key screens', V, '30/11/2026'],
      ['G6', 'Statuses in the schema never stored (SR-12); Term never Closed (SR-13)', 'V4, V6, V7; SDD §3.1', 'Drop or use them; close Terms after the stay', T, '15/11/2026'],
      ['G7', 'Round 2 run by a Manager not built; freed Beds not offered (SR-01, High)', 'FR-APP-07', 'Manager run, pool of freed Beds, M8', T, '15/11/2026'],
    ] },
    { index: 7, fontSize: 9, widths: [1.0, 3.3, 2.0, 7.9, 1.9, 0.9], rows: features },
    { index: 8, fontSize: 9, widths: [1.4, 2.3, 5.0, 2.8, 5.5], rows: [
      ['NFR-01', 'Performance', 'p95 of 10 main read endpoints, 200 users, base data', '≤ 1 s; errors < 1 %', 'Load script on a local server with production settings'],
      ['NFR-02', 'Security', 'Permission and scope tests passing', '100 %', 'Integration tests in CI'],
      ['NFR-03', 'Integrity', 'Duplicate Allocations of a Bed in a Term', '0', 'Unique indexes + concurrency test'],
      ['NFR-04', 'Availability', 'Health checks answering UP', '≥ 99 % from 01/11/2026', 'Uptime monitor, every 5 min'],
      ['NFR-05', 'Usability', 'Texts with a Vietnamese translation', '100 %', 'MessagesTest + scan of web routes'],
      ['NFR-06', 'Deployability', 'Push to healthy production; rollback', '≤ 15 min; ≤ 5 min', 'Actions run times; timed rollback'],
    ] },
    { index: 9, fontSize: 9, widths: [3.0, 2.2, 7.0, 1.8, 3.0], rows: [
      [`${T} (SE183752)`, 'Leader, PM, BA, full-stack', 'Applications and payments (APP, BIL claims); assignment and residence (ASG); architecture and DevOps', 'WF-01, WF-05', 'D1, D2; ADR-17, ADR-22; v2 phases 1–8'],
      [`${L} (SE183782)`, 'Backend developer', 'Term transition (requests window, next-Term requests, fees); enrollment reconciliation', 'WF-03', 'D3; v2 phase 6'],
      [`${D} (SE182146)`, 'Frontend developer (web)', 'Registration periods and the Term wizard (CFG + web); inventory, furniture and door-code screens; web UI and i18n', 'WF-02', 'D4; v2 phases 3–4'],
      [`${V} (SE182794)`, 'Mobile developer, tester', 'Android app and push (NTF); maintenance, routing and escalations (MNT, REQ); test documentation', 'WF-04', 'D5; Android app'],
    ] },
    { index: 10, fontSize: 9, widths: [1.1, 2.2, 2.2, 2.1, 2.5, 1.6, 3.5, 1.8], rows: wf.map((w) => [w.id, w.name, w.actors, w.trigger, w.outcome, w.features, w.states, w.owner]) },
    { index: 11, fontSize: 9, widths: [1.1, 1.2, 1.6, 3.0, 4.8, 3.6, 1.7], rows: wf.flatMap((w, i) => [
      [`DS-${String(2 * i + 1).padStart(2, '0')}`, w.id, 'Main', w.main.pre, w.main.steps, w.main.expected, w.owner],
      [`DS-${String(2 * i + 2).padStart(2, '0')}`, w.id, 'Exception', w.exc.pre, w.exc.steps, w.exc.expected, w.owner],
    ]) },
    { index: 12, fontSize: 10, rows: [
      ['Mandatory features', String(c.features), '3', String(c.featureCases)],
      ['Main workflows (end-to-end)', String(c.workflows), '1', String(c.workflows)],
      ['State transitions of main entities', String(c.states), '1', String(c.states)],
      ['Agreed NFRs', String(c.nfrs), '1', String(c.nfrs)],
      ['Committed total', '', '', String(c.total)],
    ] },
  ],
};

// Record of Changes of the registration form (BM03): version 1.0 (28/08/2026) → 2.0.
const BM03 = {
  template: `${forms}/SWP490_R2_BM03_Record_of_Changes_1.docx`,
  out: 'docs/reports/build/SWP490_FA26SE260_R2_BM03',
  deleteColor: 6710886,
  tables: [
    { index: 1, column: 2, values: ['FA26SE260', PROJECT, `CampusStay FPT — ${T} (Leader), ${L}, ${D}, ${V}`, 'Thân Thị Ngọc Vân', '1.0 (28/08/2026)', '2.0 (proposed for Review 2, 31/10/2026)', '2.0', DATE] },
    { index: 2, fontSize: 9, rows: [
      ['1', '2. Students', 'No members listed', '4 members with student codes, emails and roles (phones omitted)', 'Team formed for the capstone', T],
      ['2', '3.2 a) Context', 'Tân Uyên City, Bình Dương; scope adapted from StarRez', 'Tân Uyên, part of Ho Chi Minh City since 2025; basis of the requirements: FPT\'s operating dormitories, Circular 27/2011/TT-BGDĐT, VNU-HCM practice; every business value configurable', 'Review 1 feedback (Q1–Q3: how to specify a dormitory that is not operating yet); 2025 administrative merger', T],
      ['3', '3.2 b) Actors', 'Student, Dormitory Staff / Residence Life Officer, Administrator', 'Student; Staff per Block; Manager for every Block (reports, statistics, decisions, Block management); Administrator', 'Review 1 feedback (Q4: add the Manager role)', T],
      ['4', '3.2 c) Student: room selection', 'Browse and select a room/bed; search and request a roommate', 'Choose Room Type and Room Class; invite a roommate for 2-bed rooms; the batch engine assigns the Bed', 'Iteration 1: fair placement with gender and Block rules and no race for a Bed; the complexity moves into the engine', T],
      ['5', '3.2 c) Student: contract, check-in/out', 'Digital housing contract; self check-in/out with a room-condition report', 'Consent to the house rules recorded; desk check-in with a QR pass; check-out with damage per furniture item; door codes released after payment', 'No legal e-signature provider; keys and doors need Staff at the desk (Iteration 1)', L],
      ['6', '3.2 c) Payment', 'Pay via a VietQR-compatible payment gateway', 'VietQR transfer to the dormitory account; the student claims it, a Manager confirms or rejects it', 'Constraint from partners: no bank API or gateway contract for a student project', T],
      ['7', '3.2 c) Communication', 'In-app notification, email or SMS', 'In-app notifications, push to the Android app, email; announcements board', 'SMS gateway cost; push and email cover the cases', V],
      ['8', '3.2 c) Added functions', '—', 'Registration-period requests and the Term wizard; Term transition (stay length, requests window M2–M7, next-Term fees); late check-in; Round 2; monthly Utility billing and debt; door codes; furniture', 'Iteration 1: a dormitory runs across Terms; these add business complexity', L],
      ['9', '3.2 c) SIS integration, forecasting', 'Integrate with the SIS; forecast occupancy and vacancy', 'Import of the student list and reconciliation of the enrolled list per Term; occupancy and Term dashboards', 'Constraint from data: the SIS is not accessible; a new campus has no history to forecast from', T],
      ['10', '3.2 d) Non-functional requirements', 'Decree 13/2023/NĐ-CP; capacity 4,000 learners; SIS and gateway interoperability', 'Law 91/2025/QH15; measurable NFRs: p95 ≤ 1 s at 200 users, integrity, availability, two languages, deployability', 'The Law replaces the Decree from 01/01/2026; NFRs need metric, threshold and method', V],
      ['11', '3.2 e), f) Technologies, products', 'ReactJS or Flutter/React Native; Spring Boot or Node.js; mobile/web app, staff web app, admin dashboard', 'React web app for all roles; Android app (Kotlin, Jetpack Compose) for students; Spring Boot API; Docker, GitHub Actions, Vercel, Azure', 'Team skills; native push and Google sign-in on Android; one web app for all back-office roles', D],
      ['12', '3.2 g) Proposed tasks', 'P1–P7 around room selection and a payment gateway', 'P1–P7 updated to the scope above', 'Follows changes 4–11', T],
    ] },
    { index: 3, rows: [['', '', ''], ['', '', ''], ['', '', '']] },
  ],
};

const REGISTRATION = {
  template: 'templates/Phieu_FA26SE260.docx',
  html: 'docs/reports/build/Registration.html',
  out: 'docs/reports/out/SWP490_FA26SE260_R2_Registration',
  studentsTable: 2,
  students: [
    ['1', T, 'SE183752', '', 'trungltmse183752@fpt.edu.vn', 'Leader'],
    ['2', L, 'SE183782', '', 'locnxse183782@fpt.edu.vn', 'Member'],
    ['3', D, 'SE182146', '', 'duytvqse182146@fpt.edu.vn', 'Member'],
    ['4', V, 'SE182794', '', 'luanvmse182794@fpt.edu.vn', 'Member'],
  ],
  startText: 'a) Context:',
  endText: '4. Other comments',
  comment: 'Version 2.0 proposed for Review 2 (31/10/2026). The changes from version 1.0 and their reasons are listed in the attached Record of Changes (BM03).',
  replaceText: [['HCM, date 28/08/2026', `HCM, date ${DATE}`]],
  recordOfChanges: `${BM03.out}.docx`,
};

const ps = (script, cfg, name) => {
  const file = path.join(root, `docs/reports/build/${name}.json`);
  fs.writeFileSync(file, JSON.stringify(cfg, null, 1));
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, `docs/tools/${script}`), '-Config', file], { stdio: 'inherit', cwd: root });
};
// Self-review (BM02): the AI's findings exactly as produced (docs/reports/data/selfreview.json, `raw`), the
// team's response per finding and the counts.
function bm02() {
  const sr = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/data/selfreview.json'), 'utf8'));
  const count = (sev, kind) => sr.findings.filter((f) => f.severity === sev && (!kind || f.response.startsWith(kind))).length;
  return {
    template: `${forms}/SWP490_R2_BM02_Self_Review_Report_1.docx`,
    out: 'docs/reports/out/SWP490_FA26SE260_R2_SelfReview',
    deleteColor: 6710886,
    tables: [
      { index: 1, column: 2, values: ['FA26SE260', PROJECT, `CampusStay FPT — ${T} (Leader), ${L}, ${D}, ${V}`, 'Thân Thị Ngọc Vân', sr.tool, sr.runDate, sr.tag, '2.0 (proposed, 28/10/2026)', '1.0', sr.runDate] },
      { index: 3, fontSize: 8, widths: [1.1, 1.6, 2.6, 4.2, 1.3, 3.3, 2.9], rows: sr.findings.map((f) => [f.id, f.category, f.location, f.finding, f.severity, f.evidence, f.response]) },
      { index: 4, fontSize: 9, rows: sr.top5.map((t, i) => [String(i + 1), t.id, t.summary]) },
      { index: 5, rows: ['High', 'Medium', 'Low'].map((s) => [s, String(count(s)), String(count(s, 'Fixed')), String(count(s, 'Kept')), String(count(s, 'Planned'))]) },
    ],
  };
}

const which = process.argv[2] ?? 'BM01';
if (which === 'BM01') ps('fill-form.ps1', BM01, 'BM01');
if (which === 'BM02') ps('fill-form.ps1', bm02(), 'BM02');
if (which === 'Registration') {
  ps('fill-form.ps1', BM03, 'BM03');
  execFileSync('node', [path.join(root, 'docs/tools/md2html.mjs'), path.join(here, 'Registration.md'), path.join(root, REGISTRATION.html)], { stdio: 'inherit' });
  ps('build-registration.ps1', REGISTRATION, 'Registration');
}
