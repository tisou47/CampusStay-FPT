// Fills the Project Weekly Report workbook from the git history: one sheet per week from week 1 (07/09/2026) to the
// current week, tasks per member from the commits, issues from the review, and clearly marked empty fields for what
// the repository cannot know (the weekly plan, the supervisor's remarks).
//   node tools/docs/src/weekly.mjs
import { TEMPLATE_BASE } from '../base.mjs'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUTHORS } from '../gen/parse.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const data = (f) => JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/data', f), 'utf8'))
const GROUP = 'GFA26SE104'
const TODAY = '2026-11-23'
const MARK = 'Not recorded in the repository: the team fills it (docs/SEP490_Report/TEAM-TODO.md)'
const dm = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
const weekStart = (w) => new Date(Date.UTC(2026, 8, 7 + (w - 1) * 7))

/** Commits of one week grouped by member and by the scope of their subject: feat(inv), fix(web), docs … */
export function tasksOf(commits) {
  const by = new Map()
  for (const c of commits) {
    const who = AUTHORS[c.author]
    if (!who) continue
    const m = c.subject.match(/^(\w+)(?:\(([^)]+)\))?[:,]/)
    const scope = m ? (m[2] ?? m[1]) : 'other'
    const key = `${who}|${scope}`
    const g = by.get(key) ?? { who, scope, commits: [] }
    g.commits.push(c)
    by.set(key, g)
  }
  return [...by.values()].sort((a, b) => b.commits.length - a.commits.length)
}

const short = (s) => s.replace(/^\w+(\([^)]*\))?[:,]\s*/, '').replace(/^[a-z]/, (x) => x.toUpperCase())

export function weekConfig(week, history) {
  const start = weekStart(week)
  const end = new Date(+start + 6 * 86400000)
  const name = `W${week}`
  const base = { name, group: GROUP, week: `${dm(start)}-${dm(end)}` }
  const h = history.weeks.find((w) => w.week === week)
  const commits = h ? h.commits : []
  const status = []
  if (!commits.length) {
    status.push(['Analysis and design (no code yet in the repository)', 'Team', 'Completed',
      'Meetings: with the supervisor weekly, online (Google Meet); the team once a week, offline. The details of the week are not recorded in the repository: the team fills them (TEAM-TODO.md).'])
    if (week === 4) status.push(['Review 1', 'Team', 'Completed', 'Review 1 took place on 30/09/2026.'])
  } else {
    for (const g of tasksOf(commits).slice(0, 8)) {
      const subs = [...new Set(g.commits.map((c) => short(c.subject)))]
      status.push([`${g.scope}: ${subs[0].slice(0, 110)}`, g.who, 'Completed',
        `${g.commits.length} commit${g.commits.length > 1 ? 's' : ''} on main. ${subs.slice(1, 4).map((s) => s.slice(0, 90)).join('; ')}${subs.length > 4 ? `; +${subs.length - 4} more` : ''}`.trim()])
    }
    if (week === 8) status.push(['Review 2', 'Team', 'Completed', 'Review 2 took place on 31/10/2026 (tag review-2).'])
    status.push(['Weekly meeting with the supervisor', 'Team', 'Completed', 'Online (Google Meet). Minutes: not recorded in the repository (TEAM-TODO.md).'])
  }
  const issues = week === 11
    ? [['Full code review: 296 findings (1 Critical, 15 High, 108 Medium, 155 Low, 17 ideas)', 'Trung', 'In Progress', 'Wave 1 (52 fixes) merged on 22/11/2026; wave 2 (71 fixes) merged on 23/11/2026.']]
    : week === 12
      ? [['Critical finding BE-AUTH-01: demo accounts with a known password in production', 'Trung', 'Pending', 'Needs a production change approved by the leader before the defense.'],
        ['Low findings (155) and ideas (17) of the review', 'Team', 'Pending', 'Deferred after the defense.']]
      : [['', '', '', 'No issue recorded for this week in the repository.']]
  const plan = week === 12
    ? [['Reports 3–7, test workbooks and review forms rebuilt from the code', 'Team', 'December 2026', 'Defense 1.1 (date to be announced).'],
      ['Android release on GitHub', 'Duy', 'December 2026', ''],
      ['Production settings for the demo (demo password, demo tools)', 'Trung', 'Before Defense 1.1', 'Asks the leader first (production).']]
    : [['', '', '', MARK]]
  const other = [['', '', '', week === 12 ? 'The supervisor\'s remarks of the week: ' + MARK : MARK]]
  return { ...base, status, issues, plan, other }
}

export function config() {
  const history = data('history.json')
  const days = (Date.parse(`${TODAY}T00:00:00Z`) - Date.UTC(2026, 8, 7)) / 86400000
  const last = Math.floor(days / 7) + 1
  return {
    template: 'tools/docs/build/tpl/Project Weekly Report_GroupName.xlsx',
    out: 'docs/SEP490_Report/Project Weekly Report_GroupName.xlsx',
    weeks: Array.from({ length: last }, (_, i) => weekConfig(i + 1, history)),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = TEMPLATE_BASE
  const tpl = 'docs/SEP490_Report/Project Weekly Report_GroupName.xlsx'
  fs.mkdirSync(path.join(root, 'tools/docs/build/tpl'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tools/docs/build/tpl/Project Weekly Report_GroupName.xlsx'), execFileSync('git', ['show', `${base}:${tpl}`], { cwd: root, maxBuffer: 1 << 28 }))
  const cfg = config()
  const out = path.join(root, 'tools/docs/build/weekly.json')
  fs.writeFileSync(out, JSON.stringify(cfg))
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools/docs/pipeline/fill-weekly.ps1'), '-Config', out], { cwd: root, stdio: 'inherit' })
}
