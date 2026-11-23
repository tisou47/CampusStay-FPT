import test from 'node:test'
import assert from 'node:assert/strict'
import { tasksOf, config } from './weekly.mjs'

test('tasks: commits grouped by member and scope, largest group first; the tool\'s own commits are left out', () => {
  const g = tasksOf([
    { author: 'tisou47', subject: 'feat(inv): door codes' }, { author: 'Le Trung', subject: 'fix(inv): a bug' },
    { author: 'vominhluan17', subject: 'feat(vis): Family Day' }, { author: 'Claude', subject: 'feat(web): x' },
  ])
  assert.deepEqual(g.map((x) => [x.who, x.scope, x.commits.length]), [['Lê Thành Minh Trung', 'inv', 2], ['Võ Minh Luân', 'vis', 1]])
})

test('every week from week 1 to the current week has a sheet, with at least one row in each section', () => {
  const c = config()
  assert.deepEqual(c.weeks.map((w) => w.name), Array.from({ length: 12 }, (_, i) => `W${i + 1}`))
  assert.equal(c.weeks[0].week, '07/09/2026-13/09/2026')
  for (const w of c.weeks) for (const k of ['status', 'issues', 'plan', 'other']) assert.ok(w[k].length >= 1, `${w.name}.${k}`)
  assert.ok(c.weeks.find((w) => w.name === 'W11').status.some((r) => r[1] === 'Nguyễn Xuân Lộc'))
})

test('schedule: 15 week columns, the milestones of the team, and every feature shaded only in weeks of the history', async () => {
  const { config, PHASES, featureWeeks } = await import('./schedule.mjs')
  assert.equal(config().headers.length, 15)
  assert.ok(config().rows.every((r) => r.cells.length === 15))
  assert.deepEqual(PHASES.filter((p) => p[3] === 'milestone').map((p) => p[1]), [4, 8, 13])
  const weeks = [...featureWeeks().values()].flatMap((s) => [...s])
  assert.ok(weeks.length > 0 && weeks.every((w) => w >= 7 && w <= 12), 'code exists from week 7 to week 12 only')
})
