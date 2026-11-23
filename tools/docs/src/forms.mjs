// Fills the Review 2 forms (BM01 Design Brief, BM02 Self-Review, BM03 Record of Changes, BM04 Commitment) in place, from
// the code as it is now (user decision 23/11/2026), through pipeline/fill-form.ps1. Each form starts from its untouched
// template at the branch base. Numbers come from tools/docs/data; BM02 keeps the AI findings of the 28/10/2026 run exactly
// (data/selfreview.json) and adds their status today. Fields only people can fill (reviewers, approvals, signatures,
// reviewers' verification) stay empty.
//   node tools/docs/src/forms.mjs [BM01 BM02 BM03 BM04]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEATURES } from './partials.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const data = (f) => JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/data', f), 'utf8'))
const DIR = 'docs/SEP490_R2_BM04_Review2-Document'
const DATE = '23/11/2026'
const VERSION = '2.0 (Defense 1.1)'
const PROJECT = "CampusStay FPT – Dormitory Registration and Room-Scheduling Management System for FPT University's Tân Uyên Campus"
const T = 'Lê Thành Minh Trung', L = 'Nguyễn Xuân Lộc', D = 'Trần Võ Quang Duy', V = 'Võ Minh Luân'
const TEAM = `GFA26SE104 — ${T} (Leader, SE183752), ${L} (SE183782), ${D} (SE182146), ${V} (SE182794)`
const SUPERVISOR = 'Thân Thị Ngọc Vân'
const REPO = 'https://github.com/tisou47/CampusStay-FPT (branch main)'

const tests = data('tests.json')
const machines = data('machines.json')
const byClass = {}
for (const c of tests.cases) (byClass[c.class] ??= []).push(c.id)
const sortIds = (ids) => [...ids].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
const casesOf = (prefix) => tests.cases.filter((c) => c.id.split('-')[1] === prefix)
const range = (prefix) => { const ids = sortIds(casesOf(prefix).map((c) => c.id)); return ids.length ? `${ids[0]}…${ids.at(-1).split('-')[2]} (${ids.length})` : '—' }
const automated = tests.runs.backendUnit + tests.runs.backendIt + tests.runs.web
const allTests = automated + tests.runs.mobile
const transitions = machines.reduce((n, m) => n + (m.transitions?.length ?? 0), 0)
const notWritten = machines.filter((m) => m.notWritten.length)

// The mandatory features: the twelve feature packages, with acceptance criteria their integration tests check.
const ACTORS = { AUTH: 'Student, Manager, Admin', CFG: 'Manager, Admin', INV: 'Staff, Manager, Admin', APP: 'Student, Manager', ASG: 'Student, Staff, Manager',
  BIL: 'Student, Staff, Manager', REQ: 'Student, Staff, Manager', MNT: 'Student, Staff, Manager', NTF: 'All', RPT: 'Staff, Manager, Admin', VIS: 'Student, Staff, Manager', AST: 'Student' }
const ACCEPT = {
  AUTH: 'The 5th wrong password locks the account for 15 min; a new @fpt.edu.vn Google account has no password until it sets one; an unverified student cannot apply; no session → 401, missing permission → 403',
  CFG: 'A second open request for a Term is refused; milestones out of order are named per field; publishing fixes the Term\'s prices and rules',
  INV: 'A Room whose Beds are given keeps its Room Class; a door code is shown only to residents of the Room; moving an item updates the Room\'s conformance',
  APP: 'Submitting creates an Awaiting Deposit Application and a Deposit Invoice (Deposit % × Term price); a second Application or a stay above the maximum is refused',
  ASG: 'The same input gives the same proposal; commit creates Allocations and Balance Invoices; an unpaid Balance at its deadline is forfeited; check-in needs the Balance paid',
  BIL: 'A claim stops the deadline; a rejection needs a reason; a Paid or Void Invoice cannot be claimed or changed; Utility Invoices are split by days and residents',
  REQ: 'An approved change moves the next-Term Bed; M7 releases Beds whose fee is unpaid; a request gets the routed Staff and the Block\'s SLA',
  MNT: 'Other Blocks\' Staff do not see a request; a failed inspection item opens a Maintenance Request; the student confirms the fix or reopens it',
  NTF: 'Every notification exists in Vietnamese and English; push after commit; an email that fails is retried up to 5 times',
  RPT: 'Exports are CSV with the screen\'s columns and audited; search stays in the user\'s Blocks; reports read only the report views',
  VIS: 'A time slot never takes more guests than its places; a pass checks a guest in once; an overdue unconfirmed guest cannot be checked out by Staff',
  AST: 'The assistant answers only from the student\'s own data; door-code questions get a fixed answer; an answer in another script is refused',
}
// Main author of each feature's backend package (git, tools/docs/src/_ownership.md).
const FEATURE_OWNER = { AUTH: T, CFG: T, INV: T, APP: T, ASG: T, BIL: T, REQ: T, MNT: L, NTF: T, RPT: T, VIS: V, AST: V }
const features = FEATURES.map(([code, name, , , tc]) => [`F-${code}`, name, ACTORS[code], ACCEPT[code], range(tc), 'Done'])

// The main workflows (activity diagrams, Report 4 / Report 6 §3.2–3.9) and the five committed in BM04.
const WORKFLOWS = [
  { id: 'WF-01', act: 'act-01-registration', name: 'Registration, payment and assignment', actors: 'Student, Manager', trigger: 'A Term\'s registration opens', outcome: 'Students hold a Bed and a Balance Invoice', features: 'F-APP, F-BIL, F-ASG', states: 'Application: Awaiting Deposit → Submitted → Approved → Allocated; Invoice: Unpaid → Paid', owner: T, support: D, classes: ['ApplicationsIT', 'PaymentClaimIT', 'PaymentsIT', 'PaymentDeskIT', 'AssignmentIT', 'Round2IT'], section: '09_Activity act-01; Report 6 §3.2',
    main: ['D03, stage A: se220001 (fictional) and manager01', 'Apply 4-bed Standard; transfer and claim the Deposit; the Manager confirms; the Application is Submitted', 'Application Submitted, Deposit Paid'],
    exc: ['D12, stage C: se220011, se220012, se220013, manager01', 'se220011\'s Balance was not paid: the Bed is released; the Manager runs Round 2; waitlisted students get held offers', 'Allocation Forfeited; Round-2 offers to the waitlist'] },
  { id: 'WF-02', act: 'act-06-check-in-out', name: 'Check-in and check-out', actors: 'Student, Staff, Manager', trigger: 'The Balance is paid and check-in starts; the stay ends', outcome: 'The student lives in the Room; at the end the Utility Deposit is settled', features: 'F-ASG, F-INV, F-BIL', states: 'Hand-over: In progress → Submitted → Final; Check-out: Pending → Checked out', owner: L, support: T, classes: ['HandoverIT', 'DeskIT', 'LateCheckInIT', 'TerminationIT', 'DoorCodeIT'], section: '09_Activity act-06; Report 6 §3.7',
    main: ['D18, stage D: ss220055 (fictional), Room A-1003', 'Start check-in inventory: door code shown; answer each item and the meters; submit', 'Inventory Final; the student is resident'],
    exc: ['D21, stage D: se210003, staffa01, manager01', 'The student did not leave by the deadline (overdue): Staff record items, damage and meters; the student disputes, a Manager decides', 'Check-out done; refund of the Utility Deposit less the charges'] },
  { id: 'WF-03', act: 'act-04-maintenance', name: 'Maintenance with time limits', actors: 'Student, Staff, Manager', trigger: 'A resident reports a problem', outcome: 'The problem is fixed and confirmed by the student', features: 'F-MNT, F-REQ', states: 'Request: Submitted → Assigned → In progress → Resolved → Closed (or reopened)', owner: L, support: T, classes: ['MaintenanceIT', 'EscalationIT', 'RoutingIT', 'InspectionIT'], section: '09_Activity act-04; Report 6 §3.5',
    main: ['D06, stage A: se200009, staffa02', 'An urgent air-conditioner request is routed to staffa02; start, resolve; the student confirms', 'Request Closed within its SLA'],
    exc: ['Stage A: MR-000338 (Block A, past its 72-hour limit), manager01', 'Manager › Overdue requests: reassign the escalated request with a note', 'Request reassigned; the escalation is recorded'] },
  { id: 'WF-04', act: 'act-07-family-day', name: 'Family Day visitors', actors: 'Student, Staff, Manager', trigger: 'A Manager publishes a Family Day', outcome: 'Guests visit and leave safely, every pass recorded', features: 'F-VIS, F-NTF', states: 'Visitor: Not arrived → Inside → Left', owner: V, support: L, classes: ['FamilyDayIT'], section: '09_Activity act-07; Report 6 §3.8',
    main: ['Stage A plus a Family Day created by manager01 for Block A', 'A resident registers two guests; Staff scan the passes, check them in and out', 'Guests Left; places counted'],
    exc: ['Same Family Day after the slot ended, one guest inside', 'Staff send the reminder; Staff cannot check out the unconfirmed guest; the student confirms the guest is safe', 'Guest checked out after confirmation'] },
  { id: 'WF-05', act: 'act-08-staff-week', name: 'The Staff week', actors: 'Admin, Manager, Staff', trigger: 'The reminder day set by the Admin', outcome: 'Every Staff member knows next week\'s shifts; out-of-shift changes are recorded', features: 'F-AUTH, F-NTF', states: 'Week: planned → sent; change: confirmed outside the shift → recorded', owner: V, support: T, classes: ['WeekScheduleIT', 'ShiftGateIT', 'StaffWorkloadIT', 'BlockStaffIT'], section: '09_Activity act-08; Report 6 §3.9',
    main: ['Stage A: manager01, staffa01', 'Plan next week (copy the week before), send it; Staff see it in My schedule', 'Schedule sent to every Block'],
    exc: ['Stage A: staffa01 with no shift this week', 'Staff change a record: the API asks for a confirmation (428); after confirming, the change is saved and listed in Staff activity', 'Change recorded for the Managers'] },
]
const OTHER = [
  { id: 'WF-06', name: 'Opening a Term', actors: 'Manager, Admin', trigger: 'A Manager requests a registration period', outcome: 'A published Term with fixed prices and rules', features: 'F-CFG', states: 'Term request: Submitted → Done; Term: Draft → Published', owner: T },
  { id: 'WF-07', name: 'Term transition', actors: 'Student, Staff, Manager', trigger: 'Milestone M2 of the Term', outcome: 'Residents keep, change or release their Bed for the next Term', features: 'F-REQ, F-ASG, F-BIL, F-AUTH', states: 'next-Term Allocation: Awaiting extension → Continuing → fee Paid (or released at M7)', owner: T },
  { id: 'WF-08', name: 'Utility billing', actors: 'Student, Staff, Manager', trigger: 'The month\'s meter period', outcome: 'Utility Invoices issued; debts warned', features: 'F-BIL, F-ASG', states: 'Reading: Entered → Confirmed; Invoice: Unpaid → Paid / Overdue', owner: L },
]
const wfTests = (w) => sortIds(w.classes.flatMap((c) => byClass[c] ?? []))
const NFRS = [
  ['NFR-01', 'Usability', 'Texts of the web and API messages with a Vietnamese version', '100 %', 'npm run i18n:check and MessagesTest in CI on every pull request', D],
  ['NFR-02', 'Security', 'Permission and scope tests passing', '100 %', 'Integration tests in CI (mvn verify)', T],
  ['NFR-03', 'Integrity', 'A Bed given twice in a Term; money of an issued Invoice changed', '0', 'Database constraints and the trigger tr_invoice_fixed, with their integration tests', T],
  ['NFR-04', 'Reliability', 'Email delivery attempts before giving up; requests blocked by a mail failure', '≤ 5 attempts with growing delays; 0 blocked', 'Outbox tests (NTF) in CI', V],
  ['NFR-05', 'Performance', 'p95 response time of the main read endpoints at 200 users', '≤ 1 s', 'Load script against a production-size local stack (not in the repository yet: Known Gap G2)', V],
  ['NFR-06', 'Deployability', 'A merge into main reaching healthy production', 'Every deployment checked by /api/actuator/health = UP', 'GitHub Actions deploy job waits for the readiness check', T],
]
const OUT_OF_SCOPE = [
  ['Room or Bed self-selection by students', 'The engine keeps gender and Block rules and fairness (D2)'],
  ['Digital housing contract and e-signature', 'Needs a legal e-signature provider; the Term\'s house rules are published instead'],
  ['SMS notifications', 'Cost; in-app, push and email cover the cases'],
  ['Payment gateway or bank API', 'No contract for a student project: VietQR transfer, claim and Manager confirmation (ADR-22)'],
  ['Live student information system link, occupancy forecasting, iOS app', 'No access or history: list import and reconciliation, current-data reports, the Android app'],
]

function form(name, file, extra) {
  return { name, template: path.join(root, 'tools/docs/build/tpl', `${file}.docx`), out: `${DIR}/${file}`, source: `${DIR}/${file}.docx`, deleteColor: 6710886, ...extra }
}

const BM01 = () => form('BM01', 'SWP490_R2_BM01_Design_Brief_1', {
  paragraphs: [{ after: '2. System at a Glance', text: 'FPT University\'s Tân Uyên campus opens dormitories for thousands of students and needs one system to run them. CampusStay FPT takes a student from sign-in to a Bed and through every Term of the stay: Applications by Room Type and Room Tier, a fair batch assignment, VietQR payments confirmed by Managers, door codes, the check-in inventory and the check-out desk, the Term transition, maintenance with time limits, monthly Utility billing, Family Day visitors, the Staff weekly schedule and reports. Users: students (web and the Android app), Staff of each Block, Managers for every Block and the Administrator. Core value: every Bed, payment and deadline follows one set of configurable rules with an audit trail. Architecture: one Spring Boot API with PostgreSQL, a React web application and a Flutter app (Report 4 §1.1).' }],
  replaceText: [['Automated in CI: at least 50% of the committed total.', `Automated in CI: ${automated} of ${allTests} automated tests (${Math.round((100 * automated) / allTests)} %): the backend and web suites run on every pull request; the ${tests.runs.mobile} Flutter tests run with flutter test.`]],
  tables: [
    { index: 1, column: 2, values: ['FA26SE260', PROJECT, TEAM, SUPERVISOR, REPO, VERSION, DATE] },
    { index: 2, fontSize: 8, widths: [2.6, 3.4, 7.0, 4.0], rows: [
      ['Actors', 'Student, Staff, Admin', 'Student; Staff per Block; Manager for every Block; Admin', 'Review 1 feedback (ADR-19)'],
      ['Room choice, contract, check-in/out', 'Select room/bed; digital contract; self check-in/out', 'Room Type and Tier, engine assigns; house rules per Term; check-in inventory by the student; check-out at the desk', 'Fairness; no e-signature provider'],
      ['Payment, communication', 'VietQR gateway; in-app, email, SMS', 'VietQR transfer + claim confirmed by a Manager; in-app, push, email', 'No bank API; SMS cost'],
      ['Added scope', '—', 'Term transition, registration-period requests, Utility billing and debt, door codes, furniture; after Review 2: Family Day, Staff week, AI assistant', 'A dormitory runs across Terms'],
      ['Integration', 'SIS link; forecast', 'Student list import and reconciliation; reports of current data', 'SIS not accessible'],
    ] },
    { index: 3, fontSize: 8, widths: [6, 11], rows: OUT_OF_SCOPE },
    { index: 4, fontSize: 8, widths: [0.8, 2.3, 3.2, 6.6, 2.0, 2.1], rows: [
      ['D1', 'System structure', 'Microservices; modular monolith', 'One Spring Boot API and one PostgreSQL, layered, features own their tables and talk through ports and events', T, 'Report 4 §1'],
      ['D2', 'How Beds are given', 'First come; by hand; batch engine', 'Students choose Room Type and Tier; a deterministic engine places by priority and fit; a Manager commits', T, 'Report 3 ASG'],
      ['D3', 'Renewal of residents', 'Re-apply each Term; auto-renew', 'Next-Term Allocation on the same Bed at M2; requests to M3; fees after reconciliation; unpaid at M7 releases the Bed', L, 'act-03'],
      ['D4', 'Room Class and prices', 'Class per Floor; editable prices', 'Class per Room per Term; prices fixed in the Term when it is published', D, 'Report 3 CFG, INV'],
      ['D5', 'Notification channels', 'SMS gateway; email only', 'In-app always, FCM push, email through an outbox; two languages', V, 'Report 3 NTF'],
    ] },
    { index: 5, fontSize: 8, widths: [0.8, 4.4, 2.4, 7.2, 2.2], rows: [
      ['R1', 'The dormitory is not operating yet: real operation may differ', 'Rework after opening', 'Every price, window and rule is a setting (55 parameters, the Term wizard); weekly mentor review', T],
      ['R2', 'Manual claim confirmation at the registration peak', 'Students wait', 'A claim stops the deadline; bulk confirmation; hourly summary to Managers', T],
      ['R3', 'One small VM and a burstable database', 'Slow or down at the peak', 'Readiness check and backup before each deployment; NFR-05 load test (G2); a bigger VM in the runbook', V],
    ] },
    { index: 6, fontSize: 8, widths: [0.8, 6.0, 2.6, 4.0, 2.0, 1.6], rows: [
      ['G1', 'Registration form items built differently (room self-selection, contract, gateway, SMS, SIS link, forecast; docs/Topic/TOPIC-CHECK.md)', 'Registration form', 'Explained in BM03; the form is the team\'s to change', T, 'Defense'],
      ['G2', 'NFR-05 load test not in the repository (SR-06)', 'Report 5', 'Load script and one measured run', V, 'Defense'],
      ['G3', `Values allowed by the database but never set: ${notWritten.length} status columns (e.g. Term Closed, SR-13)`, 'Report 4 §3', 'Set them in code or drop them in a migration', T, 'Defense'],
      ['G4', 'Maintenance reopen not limited to once (SR-15)', 'MaintenanceService', 'Enforce the limit or change the rule', L, 'Defense'],
      ['G5', 'Mobile tests run outside CI; APK not attached to a release', 'mobile/, Report 6', 'Add flutter test to CI; publish the APK', D, 'Defense'],
    ] },
    { index: 7, fontSize: 8, widths: [1.3, 3.0, 2.2, 7.4, 2.4, 1.0], rows: features },
    { index: 8, fontSize: 8, widths: [1.4, 2.0, 5.0, 3.2, 5.4], rows: NFRS.map((n) => n.slice(0, 5)) },
    { index: 9, fontSize: 8, widths: [3.0, 2.4, 7.0, 1.8, 2.8], rows: [
      [`${T} (SE183752)`, 'Leader, PM, BA, full-stack, DevOps', 'Applications, billing and assignment; reports; infrastructure and CI', 'WF-01, WF-06, WF-07', 'D1, D2'],
      [`${L} (SE183782)`, 'Full-stack', 'Maintenance; check-in inventory and check-out; Utility; staff and student web pages', 'WF-02, WF-03, WF-08', 'D3'],
      [`${V} (SE182794)`, 'Full-stack', 'Family Day; Staff shifts and workload; AI assistant', 'WF-04, WF-05', 'D5'],
      [`${D} (SE182146)`, 'Mobile and web', 'Flutter Android app; transition pages of the web', 'Supporting WF-01 (mobile)', 'D4'],
    ] },
    { index: 10, fontSize: 8, widths: [1.1, 2.4, 2.2, 2.3, 2.6, 1.6, 3.4, 1.6], rows: [...WORKFLOWS, ...OTHER].map((w) => [w.id, w.name, w.actors, w.trigger, w.outcome, w.features, w.states, w.owner.split(' ').at(-1)]) },
    { index: 11, fontSize: 8, widths: [1.1, 1.2, 1.6, 3.4, 4.8, 3.2, 1.7], rows: WORKFLOWS.flatMap((w, i) => [
      [`DS-${String(2 * i + 1).padStart(2, '0')}`, w.id, 'Main', ...w.main, w.owner.split(' ').at(-1)],
      [`DS-${String(2 * i + 2).padStart(2, '0')}`, w.id, 'Exception', ...w.exc, w.owner.split(' ').at(-1)],
    ]) },
    { index: 12, fontSize: 9, rows: [
      ['Mandatory features', String(features.length), '3', String(tests.cases.length)],
      ['Main workflows (end-to-end)', String(WORKFLOWS.length + OTHER.length), '1', `${WORKFLOWS.length + OTHER.length} (demo walkthroughs)`],
      ['State transitions of main entities', String(transitions), '1', 'in the feature tests'],
      ['Agreed NFRs', String(NFRS.length), '1', String(NFRS.length)],
      ['Committed total', '', '', `${tests.cases.length} automated test cases + ${WORKFLOWS.length + OTHER.length} walkthroughs`],
    ] },
  ],
})

// BM02: the 28/10/2026 run, findings as produced; the response adds what is true today.
const TODAY = {
  'SR-06': 'Still open on 23/11/2026: no load script in the repository (BM01 G2)',
  'SR-07': 'Done on 23/11/2026: Report 3 §5.1 lists the 55 settings with their base values',
  'SR-08': 'Partly on 23/11/2026: 30 automated Flutter tests in Report 5 §4; no manual Android cases',
  'SR-11': 'Still open on 23/11/2026: the production check is not recorded',
  'SR-12': 'Documented on 23/11/2026: Report 4 §3 names, for each status column, the values the code never sets (BM01 G3)',
  'SR-13': 'Still open on 23/11/2026: no code sets a Term Closed (BM01 G3)',
  'SR-15': 'Still open on 23/11/2026: reopening is not limited (BM01 G4)',
  'SR-18': 'Fixed on 23/11/2026: every state machine is generated from the code (docs/Diagrams/08_State_Machine)',
  'SR-19': 'Fixed on 23/11/2026: state machines of every status column, including runs, refunds, check-out and accounts',
  'SR-20': 'Fixed on 23/11/2026: final states have the end marker',
  'SR-21': 'Kept on 23/11/2026: each workflow step has integration tests; the end-to-end runs are demo walkthroughs',
  'SR-22': 'Fixed on 23/11/2026: activity diagrams redrawn and checked against the code (docs/Diagrams/09_Activity)',
  'SR-27': 'Still open on 23/11/2026: A-53 and A-54 are not in tools/postman/api-contract.md',
}
function statusOf(f) {
  const now = TODAY[f.id]
  if (!now) return f.response.split(' ')[0]
  return now.startsWith('Fixed') || now.startsWith('Done') || now.startsWith('Documented') ? 'Fixed' : now.startsWith('Kept') ? 'Kept' : 'Planned'
}
function BM02() {
  const sr = data('selfreview.json')
  const count = (sev, kind) => sr.findings.filter((f) => f.severity === sev && (!kind || statusOf(f) === kind)).length
  return form('BM02', 'SWP490_R2_BM02_Self_Review_Report_1', {
    tables: [
      { index: 1, column: 2, values: ['FA26SE260', PROJECT, TEAM, SUPERVISOR, sr.tool, sr.runDate, sr.tag, '2.0', VERSION, DATE] },
      { index: 3, fontSize: 7, widths: [1.1, 1.5, 2.5, 4.4, 1.3, 3.1, 3.1], rows: sr.findings.map((f) => [f.id, f.category, f.location, f.finding, f.severity, f.evidence, TODAY[f.id] ? `${f.response} · ${TODAY[f.id]}` : f.response]) },
      { index: 4, fontSize: 9, rows: sr.top5.map((t, i) => [String(i + 1), t.id, t.summary]) },
      { index: 5, rows: ['High', 'Medium', 'Low'].map((s) => [s, String(count(s)), String(count(s, 'Fixed')), String(count(s, 'Kept')), String(count(s, 'Planned'))]) },
    ],
  })
}

const BM03 = () => form('BM03', 'SWP490_R2_BM03_Record_of_Changes_1', {
  tables: [
    { index: 1, column: 2, values: ['FA26SE260', PROJECT, TEAM, SUPERVISOR, '1.0 (28/08/2026)', '2.0', VERSION, DATE] },
    { index: 2, fontSize: 8, rows: [
      ['1', '2. Students', 'No members listed', '4 members with student codes, emails and roles', 'Team formed for the capstone', T],
      ['2', '3.2 b) Actors', 'Student, Dormitory Staff, Administrator', 'Student; Staff per Block; Manager for every Block (review, assignment, payments, Term transition); Administrator', 'Review 1 feedback (add the Manager role); ADR-19', T],
      ['3', '3.2 c) Room selection', 'Browse rooms with photos/floor plans; select a room/bed', 'Choose Room Type and Room Tier; the batch engine assigns the Room and Bed', 'Fair placement with gender and Block rules, no race for a Bed', T],
      ['4', '3.2 c) Contract, check-in/out', 'Digital housing contract; self check-in/out', 'House rules published with each Term; the student\'s check-in inventory reviewed by Staff; check-out at the desk', 'No e-signature provider; keys and furniture need Staff', L],
      ['5', '3.2 c) Payment', 'VietQR-compatible payment gateway', 'VietQR transfer; the student claims it, a Manager confirms it (ADR-22)', 'No bank API or gateway contract for a student project', T],
      ['6', '3.2 c) Communication', 'In-app notification, email or SMS', 'In-app notifications, push to the Android app, email, announcements', 'SMS cost', V],
      ['7', '3.2 c) Eligibility', 'Year of study, program, distance from campus', 'Eligibility: enrolled, one live Application, no overdue Invoice, Beds for the gender, contact details; year and hometown are priority groups; program is a matching criterion', 'Rules that can be checked from the student list', T],
      ['8', '3.2 c) Added functions', '—', 'Registration-period requests and the Term wizard; Term transition (M2–M7); Utility billing and debt; door codes; furniture; Family Day; the Staff weekly schedule; the students\' AI assistant', 'A dormitory runs across Terms; Iteration 2 needs (visitors, shifts, help to students)', V],
      ['9', '3.2 c), d) SIS, forecasting', 'Integrate with the SIS; forecast occupancy', 'Import of the student list and reconciliation per Term; reports of current data', 'The SIS is not accessible; a new campus has no history', T],
      ['10', '3.2 e) Technologies', 'ReactJS or Flutter/React Native; Spring Boot or Node.js', 'React web application for all roles; Flutter Android app for students; Spring Boot API; PostgreSQL; Docker, GitHub Actions, Vercel, Azure', 'Team skills; push and Google sign-in on Android', D],
    ] },
  ],
})

function BM04() {
  const wfTables = WORKFLOWS.flatMap((w, k) => {
    const b = 6 + 6 * k
    const ids = wfTests(w)
    const feats = w.features.split(', ').map((id) => features.find((f) => f[0] === id)).filter(Boolean)
    return [
      { index: b, column: 2, values: [w.name, w.owner, w.support, w.actors, w.trigger, w.outcome, w.states, w.section] },
      { index: b + 1, fontSize: 8, rows: feats.map((f) => [f[0], f[1], f[3], f[4]]) },
      { index: b + 2, fontSize: 8, rows: [[`DS-0${k + 1}a`, 'Main', ...w.main, w.owner], [`DS-0${k + 1}b`, 'Exception', ...w.exc, w.owner]] },
      { index: b + 3, fontSize: 9, rows: [
        ['Feature tests (≥ 3 per feature)', String(ids.length), String(ids.length), w.owner],
        ['End-to-end workflow test (≥ 1)', '1', 'No: demo walkthrough', w.owner],
        ['State transition tests (≥ 1 per transition)', 'in the feature tests', 'Yes', w.owner],
        ['Total for this workflow', String(ids.length + 1), String(ids.length), ''],
      ] },
      { index: b + 4, rows: [
        ['Runs end-to-end on staging with seeded data', 'Yes'], ['Main scenario passes', 'Yes'], ['Exception scenarios passing', '1 of 1'],
        ['Test pass rate for this workflow', '100 % of its automated tests (run of 23/11/2026)'], ['Open Critical / High defects', '0'],
      ] },
    ]
  })
  const members = [
    { name: T, id: 'SE183752', role: 'Leader, PM, BA, full-stack, DevOps', wf: 'WF-01', feats: 'F-APP, F-BIL, F-ASG, F-CFG, F-RPT', mods: 'application, billing, assignment, report, setting; infra', dec: 'D1, D2', nfr: 'NFR-02, NFR-03, NFR-06' },
    { name: L, id: 'SE183782', role: 'Full-stack', wf: 'WF-02, WF-03', feats: 'F-MNT, F-REQ (routing), F-ASG (hand-over)', mods: 'maintenance; check-in inventory and check-out; staff and student web pages', dec: 'D3', nfr: '—' },
    { name: D, id: 'SE182146', role: 'Mobile and web', wf: '— (supports WF-01 on mobile)', feats: 'Android app of F-APP, F-BIL, F-MNT', mods: 'mobile/ (Flutter); transition web pages', dec: 'D4', nfr: 'NFR-01' },
    { name: V, id: 'SE182794', role: 'Full-stack', wf: 'WF-04, WF-05', feats: 'F-VIS, F-AST, F-AUTH (shifts and workload)', mods: 'visitor, assistant; Staff shifts and workload', dec: 'D5', nfr: 'NFR-04, NFR-05' },
  ]
  const ownedTests = (m) => WORKFLOWS.filter((w) => w.owner === m.name).reduce((n, w) => n + wfTests(w).length, 0)
  const memberTables = members.flatMap((m, i) => {
    const b = 36 + 5 * i
    return [
      { index: b, column: 2, values: [m.name, m.id, m.role] },
      { index: b + 1, fontSize: 9, rows: [['Main workflow(s) owned', m.wf, ''], ['Mandatory features owned', m.feats, ''], ['Modules / entities owned', m.mods, ''], ['Design decisions owned (D-IDs)', m.dec, ''], ['NFRs responsible', m.nfr, '']] },
      { index: b + 2, fontSize: 9, rows: [['Functional test cases written', String(ownedTests(m) || '—'), 'Defense 1.1'], ['Of which automated in CI', String(ownedTests(m) || '—'), 'Defense 1.1'], ['Demo scenarios presented', WORKFLOWS.filter((w) => w.owner === m.name).map((w) => `DS-0${WORKFLOWS.indexOf(w) + 1}a/b`).join(', ') || '—', 'Defense 1.1'], ['Required fixes owned (section 9)', '', ''], ['Documentation sections (Report / section)', '', '']] },
    ]
  })
  const totalTests = WORKFLOWS.reduce((n, w) => n + wfTests(w).length, 0)
  return form('BM04', 'SWP490_R2_BM04_Review2_Commitment_1', {
    tables: [
      { index: 1, column: 2, values: ['FA26SE260', PROJECT, TEAM, SUPERVISOR, '31/10/2026', '', '', VERSION, DATE] },
      { index: 2, column: 2, values: ['2.0', '', 'Phieu_FA26SE260.docx with SWP490_R2_BM03_Record_of_Changes_1'] },
      { index: 3, fontSize: 8, rows: features.map((f) => [f[0], f[1], f[2], f[3], WORKFLOWS.filter((w) => w.features.includes(f[0])).map((w) => w.id).join(', ') || OTHER.filter((w) => w.features.includes(f[0])).map((w) => w.id).join(', '), FEATURE_OWNER[f[0].slice(2)]]) },
      { index: 4, fontSize: 8, rows: NFRS },
      { index: 5, fontSize: 9, rows: OUT_OF_SCOPE },
      ...wfTables,
      ...memberTables,
      { index: 61, fontSize: 9, rows: [...WORKFLOWS.map((w) => [w.id, w.owner, w.features, '1 / 1', String(wfTests(w).length + 1), String(wfTests(w).length)]), ['Total', '', '', `${WORKFLOWS.length} / ${WORKFLOWS.length}`, String(totalTests + WORKFLOWS.length), String(totalTests)]] },
      { index: 62, fontSize: 8, rows: [...members.map((m) => [m.name, m.wf, m.feats, String(ownedTests(m) || '—'), String(ownedTests(m) || '—'), WORKFLOWS.filter((w) => w.owner === m.name).length * 2 || '—', '']), ['Total', String(WORKFLOWS.length), String(features.length), String(totalTests), String(totalTests), String(2 * WORKFLOWS.length), '']] },
      { index: 63, column: 2, values: [String(WORKFLOWS.length), `${WORKFLOWS.length} / ${WORKFLOWS.length}`, `${tests.cases.length} (all backend test cases)`, `${tests.cases.length}`] },
      { index: 64, fontSize: 9, rows: [
        ['Main workflows', '100% run end-to-end', '100 % (5 of 5)'], ['Demo scenarios', '100% main; ≥ 80% exception', '100 % main; 100 % exception'],
        ['Test case count', '≥ committed number', `${tests.cases.length}`], ['Test pass rate', '≥ 90% overall; 100% main-path tests of mandatory features', '100 % in the run of 23/11/2026'],
        ['Automation', '≥ 50% run in CI', `${Math.round((100 * automated) / allTests)} %`], ['Defects', 'No open Critical or High defects', '0 open High (BM02)'],
        ['Individual', 'Each member demos the workflow they own and meets their delivery commitments', 'Per section 7'],
      ] },
    ],
  })
}

const BASE = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: root, encoding: 'utf8' }).trim()
const ALL = { BM01, BM02, BM03, BM04 }
const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ALL)
fs.mkdirSync(path.join(root, 'tools/docs/build/tpl'), { recursive: true })
for (const name of which) {
  const cfg = ALL[name]()
  fs.writeFileSync(cfg.template, execFileSync('git', ['show', `${BASE}:${cfg.source}`], { cwd: root, maxBuffer: 1 << 28 }))
  const file = path.join(root, 'tools/docs/build', `${name}.json`)
  fs.writeFileSync(file, JSON.stringify(cfg, null, 1))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/docs/pipeline/fill-form.ps1'), '-Config', file], { stdio: 'inherit', cwd: root })
}
