import test from 'node:test'
import assert from 'node:assert/strict'
import { erdModels, stateModel, AREAS } from './models.mjs'

const schema = [
  { name: 'asg_termination', prefix: 'asg', view: false, columns: [{ name: 'id' }, { name: 'allocation_id' }, { name: 'status' }],
    constraints: [{ name: 'asg_termination_pkey', type: 'PK', def: 'PRIMARY KEY (id)' },
      { name: 'fk1', type: 'FK', def: 'FOREIGN KEY (allocation_id) REFERENCES asg_allocation(id)', refTable: 'asg_allocation' }] },
  { name: 'asg_allocation', prefix: 'asg', view: false, columns: [{ name: 'id' }, { name: 'student_id' }],
    constraints: [{ name: 'asg_allocation_pkey', type: 'PK', def: 'PRIMARY KEY (id)' },
      { name: 'fk2', type: 'FK', def: 'FOREIGN KEY (student_id) REFERENCES auth_user(id)', refTable: 'auth_user' }] },
  { name: 'rpt_v_x', prefix: 'rpt', view: true, columns: [], constraints: [] },
]

test('ERD: one Chen model per area, FKs as relationships, foreign areas as external entities, views left out', () => {
  const [asg] = erdModels(schema).filter((m) => m.name === '05_ERD/erd-asg')
  assert.equal(asg.kind, 'chen')
  assert.deepEqual(asg.entities.map((e) => [e.id, Boolean(e.external)]).sort(),
    [['asg_allocation', false], ['asg_termination', false], ['auth_user', true]])
  assert.deepEqual(asg.relationships.map((r) => [r.from, r.label, r.to, r.fromCard, r.toCard]).sort(), [
    ['asg_allocation', 'student', 'auth_user', 'N', '1'],
    ['asg_termination', 'allocation', 'asg_allocation', 'N', '1'],
  ])
  assert.ok(AREAS.asg)
})

test('state machine: initial → the first state, one edge per code transition, final after terminal states', () => {
  const m = stateModel({
    table: 'asg_termination', column: 'status', states: ['NOTICE_SENT', 'OVERDUE', 'CANCELLED', 'CLOSED'],
    transitions: [
      { from: ['NOTICE_SENT'], to: 'CANCELLED', by: 'TerminationService.cancel' },
      { from: ['NOTICE_SENT'], to: 'OVERDUE', by: 'TerminationService.markOverdue' },
      { from: ['NOTICE_SENT', 'OVERDUE'], to: 'CLOSED', by: 'TerminationService.close' },
    ],
  })
  assert.equal(m.name, '08_State_Machine/state-asg_termination')
  assert.equal(m.kind, 'state')
  const edges = m.edges.map((e) => `${e.from}>${e.to}:${e.label ?? ''}`)
  assert.ok(edges.includes('initial>NOTICE_SENT:'))
  assert.ok(edges.includes('NOTICE_SENT>CANCELLED:cancel'))
  assert.ok(edges.includes('OVERDUE>CLOSED:close'))
  assert.ok(edges.includes('CANCELLED>final:'))
  assert.ok(edges.includes('CLOSED>final:'))
  assert.ok(!edges.includes('NOTICE_SENT>final:'))
})

test('code-read transitions: merged with the generated ones, and each Class.method must exist in the code', async () => {
  const { mergeTransitions, missingMethods } = await import('./models.mjs')
  const merged = mergeTransitions(
    [{ table: 't', column: 'status', states: ['A', 'B'], transitions: [{ from: ['A'], to: 'B', by: 'S.go' }] }],
    { t: [{ from: ['B'], to: 'A', by: 'S.back' }, { from: ['A'], to: 'B', by: 'S.go' }] })
  assert.deepEqual(merged[0].transitions.map((t) => t.by).sort(), ['S.back', 'S.go'])
  const sources = { S: 'class S { void go() {} }' }
  assert.deepEqual(missingMethods(merged, (cls) => sources[cls]), ['t: S.back (no method back in S)'])
})

test('code-read transitions: give the from of a generated one, drop demo-tool writes, key other columns as table.column', async () => {
  const { mergeTransitions } = await import('./models.mjs')
  const [t, c] = mergeTransitions([
    { table: 't', column: 'status', states: ['A', 'B'], transitions: [{ from: [], to: 'B', by: 'S.go' }, { from: [], to: 'A', by: 'Demo.clear' }] },
    { table: 't', column: 'kind', states: ['X', 'Y'], transitions: [] },
  ], { t: [{ from: ['A'], to: 'B', by: 'S.go' }, { to: 'A', by: 'Demo.clear', ignore: true }], 't.kind': [{ from: ['X'], to: 'Y', by: 'S.go' }] })
  assert.deepEqual(t.transitions, [{ from: ['A'], to: 'B', by: 'S.go' }])
  assert.deepEqual(c.transitions, [{ from: ['X'], to: 'Y', by: 'S.go' }])
})

test('state machine: (created) is the initial node; states no code writes are listed, not drawn', () => {
  const m = stateModel({ table: 't', column: 'status', states: ['OPEN', 'INFO', 'GONE'],
    transitions: [{ from: ['(created)'], to: 'INFO', by: 'S.upload' }] })
  const edges = m.edges.map((e) => `${e.from}>${e.to}:${e.label ?? ''}`)
  assert.ok(edges.includes('initial>INFO:upload'))
  assert.ok(!m.nodes.some((n) => n.id === 'GONE'))
  assert.deepEqual(m.notWritten, ['GONE'])
})
