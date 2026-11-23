// The actual project schedule (docs/SEP490_Report/Report2_Sample Project Schedule.pdf): a Gantt-style table of the 15
// weeks from 07/09/2026. Rows: the milestones and phases (the calendar given by the team) and one row per feature,
// shaded in the weeks in which a commit on main touched its code. The ProjectLibre file (.pod) is left untouched.
//   node tools/docs/src/schedule.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { weekOf } from '../gen/parse.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const WEEKS = 15
const dm = (w, add = 0) => {
  const d = new Date(Date.UTC(2026, 8, 7 + (w - 1) * 7 + add))
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Phases and milestones: [label, firstWeek, lastWeek, kind]. Dates come from the team; the phases from the history. */
export const PHASES = [
  ['Analysis and design (waterfall)', 1, 6, 'phase'],
  ['Review 1: 30/09/2026', 4, 4, 'milestone'],
  ['First implementation: slices S0–S7, deployment, mobile app', 7, 8, 'phase'],
  ['Review 2: 31/10/2026', 8, 8, 'milestone'],
  ['Polish, mobile app, Family Day', 9, 10, 'phase'],
  ['Hand-over, Staff shifts and workload, Admin screens', 11, 11, 'phase'],
  ['Code review and two fix waves', 11, 12, 'phase'],
  ['Reports, test workbooks and review forms rebuilt from the code', 12, 13, 'phase'],
  ['Defense 1.1: December 2026 (date to be announced)', 13, 15, 'milestone'],
]

const FEATURE_OF = [
  [/^backend\/.*\/(?:service|controller|repository)\/auth\//, 'Accounts, staff and audit'],
  [/^backend\/.*\/(?:service|controller|repository)\/setting\//, 'Terms and settings'],
  [/^backend\/.*\/(?:service|controller|repository)\/inventory\//, 'Inventory'],
  [/^backend\/.*\/(?:service|controller|repository)\/application\//, 'Applications'],
  [/^backend\/.*\/(?:service|controller|repository)\/assignment\//, 'Assignment and residence'],
  [/^backend\/.*\/(?:service|controller|repository)\/billing\//, 'Billing'],
  [/^backend\/.*\/(?:service|controller|repository)\/request\//, 'Requests and Term transition'],
  [/^backend\/.*\/(?:service|controller|repository)\/maintenance\//, 'Maintenance and inspections'],
  [/^backend\/.*\/(?:service|controller|repository)\/notification\//, 'Notifications'],
  [/^backend\/.*\/(?:service|controller|repository)\/report\//, 'Reports'],
  [/^backend\/.*\/(?:service|controller|repository)\/visitor\//, 'Family Day'],
  [/^backend\/.*\/(?:service|controller|repository)\/assistant\//, 'AI assistant'],
  [/^mobile\/lib\//, 'Student mobile app'],
  [/^(infra|\.github)\//, 'Infrastructure and CI/CD'],
]

/** feature → Set of weeks in which a commit on main touched its code. */
export function featureWeeks() {
  const log = execFileSync('git', ['log', 'origin/main', '--no-merges', '--format=%x01%ad', '--date=short', '--name-only'],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
  const by = new Map(FEATURE_OF.map(([, n]) => [n, new Set()]))
  let week = null
  for (const line of log.split('\n')) {
    if (line.startsWith('\x01')) { week = weekOf(line.slice(1)); continue }
    const hit = FEATURE_OF.find(([re]) => re.test(line.trim()))
    if (hit && week) by.get(hit[1]).add(week)
  }
  return by
}

/** The Gantt table for tools/docs/pipeline/make-gantt.ps1: one row per phase or milestone, one per feature. */
export function config() {
  const cells = (on, color, mark = '') => Array.from({ length: WEEKS }, (_, i) => (on(i + 1) ? color + mark : ''))
  const rows = PHASES.map(([label, a, b, kind]) => ({
    label, bold: kind === 'milestone',
    cells: cells((w) => w >= a && w <= b, kind === 'milestone' ? '#f4b183' : '#9dc3e6', kind === 'milestone' && a === b ? '◆' : ''),
  }))
  rows.push({ label: 'Features (weeks with commits on main)', bold: true, section: true, cells: Array(WEEKS).fill('') })
  for (const [label, weeks] of featureWeeks()) if (weeks.size) rows.push({ label, cells: cells((w) => weeks.has(w), '#a9d18e') })
  return {
    title: 'CampusStay FPT: project schedule (actual)',
    intro: 'Group GFA26SE104. Week 1 starts on Monday 07/09/2026 and week 15 ends on 20/12/2026; state on 23/11/2026 (week 12). Blue: phase. Orange: milestone. Green: a week in which a commit on main touched the code of the feature (the repository history starts on 20/10/2026, week 7).',
    footnote: 'The first six weeks were analysis and design without code. The planned dates of the later iterations were not kept in the repository; this table shows what happened.',
    headers: Array.from({ length: WEEKS }, (_, i) => `W${i + 1} ${dm(i + 1)}`),
    rows,
    out: 'docs/SEP490_Report/Report2_Sample Project Schedule.pdf',
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = path.join(root, 'tools/docs/build/schedule.json')
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify(config()))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/docs/pipeline/make-gantt.ps1'), '-Config', cfg], { cwd: root, stdio: 'inherit' })
}
