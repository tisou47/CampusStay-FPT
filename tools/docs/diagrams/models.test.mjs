import test from 'node:test'
import assert from 'node:assert/strict'
import { erdModels, stateModel, AREAS, overviewErd } from './models.mjs'

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
  assert.deepEqual(m.notWritten, ['OPEN', 'GONE'])
})

test('use cases: one diagram per role, every permission of the role, extra goals for a role', async () => {
  const { useCaseModels } = await import('./models.mjs')
  const ms = useCaseModels([
    { permission: 'APPLY', label: 'Apply for a Bed', roles: ['STUDENT'] },
    { permission: 'DESK', label: 'Check students in and out', roles: ['STAFF', 'MANAGER'] },
  ], { STUDENT: ['Ask the assistant'] })
  const student = ms.find((m) => m.name === '02_Use_Case/usecase-student')
  assert.equal(student.kind, 'usecase')
  assert.deepEqual(student.nodes.filter((n) => n.shape === 'usecase').map((n) => n.label), ['Apply for a Bed', 'Ask the assistant'])
  assert.equal(student.edges.length, 2)
  assert.ok(ms.find((m) => m.name === '02_Use_Case/usecase-manager').nodes.some((n) => n.label === 'Check students in and out'))
})

test('screen flow: a route hangs under its longest parent route, the portal home under sign-in', async () => {
  const { screenFlowModels } = await import('./models.mjs')
  const [m] = screenFlowModels({ web: [
    { portal: 'public', path: '/signin', component: 'SignIn' },
    { portal: 'staff', path: '/staff', component: 'StaffHome' },
    { portal: 'staff', path: '/staff/maintenance', component: 'Maintenance' },
    { portal: 'staff', path: '/staff/maintenance/:id', component: 'MaintenanceDetail' },
  ], mobile: [] }, []).filter((x) => x.name.endsWith('screens-staff'))
  const edges = m.edges.map((e) => `${e.from}>${e.to}`)
  assert.deepEqual(edges, ['/signin>/staff', '/staff>/staff/maintenance', '/staff/maintenance>/staff/maintenance/:id'])
})

test('package diagram: layers with the imports between them; shared packages in their own box, without edges', async () => {
  const { packageModel } = await import('./models.mjs')
  const m = packageModel({ controller: ['service', 'dto'], service: ['repository', 'dto'], repository: [], dto: [] })
  assert.equal(m.name, '04_Package/packages')
  assert.deepEqual(m.edges.map((e) => `${e.from}>${e.to}`), ['controller>service', 'service>repository'])
  assert.equal(m.nodes.find((n) => n.id === 'dto').parent, 'shared')
  assert.equal(m.nodes.find((n) => n.id === 'service').parent, 'layers')
})

test('state machine: with a known INSERT the machine starts there, not at the first CHECK state', () => {
  const m = stateModel({ table: 't', column: 'status', states: ['DRAFT', 'WAITING', 'DONE'], transitions: [
    { from: ['(created)'], to: 'WAITING', by: 'S.create' }, { from: ['WAITING'], to: 'DONE', by: 'S.finish' }] })
  const edges = m.edges.map((e) => `${e.from}>${e.to}`)
  assert.ok(!edges.includes('initial>DRAFT'))
  assert.deepEqual(m.notWritten, ['DRAFT'])
})

test('code-read transitions: a state no code writes (only filtered on) leaves every from list', async () => {
  const { mergeTransitions } = await import('./models.mjs')
  const [t] = mergeTransitions([{ table: 't', column: 'status', states: ['NEW', 'UPCOMING', 'VOID'],
    transitions: [{ from: ['UPCOMING', 'NEW'], to: 'VOID', by: 'S.voidUnpaid' }] }], { t: [{ state: 'UPCOMING', neverWritten: true }] })
  assert.deepEqual(t.transitions, [{ from: ['NEW'], to: 'VOID', by: 'S.voidUnpaid' }])
})

test('class parser: fields, public methods, interface methods, implements', async () => {
  const { parseJavaType } = await import('./models.mjs')
  const entity = parseJavaType(`@Entity
public class TermEntity {
    @Id
    private Long id;
    private String name;
    private static final int X = 1;
    public void publish(Instant at) {
        usedAt = at;
    }
    void hidden() { }
}`)
  assert.deepEqual(entity, { name: 'TermEntity', kind: 'class', fields: ['id: Long', 'name: String'], methods: ['publish()'], implements: [] })
  const port = parseJavaType(`public interface Billing {
    /** Doc. */
    IssuedInvoice issueDeposit(DepositRequest r);
    record DepositRequest(long a) { }
    default boolean x() { return true; }
}`)
  assert.deepEqual(port.methods, ['issueDeposit()', 'x()'])
  assert.equal(port.kind, 'interface')
  assert.deepEqual(parseJavaType('class JdbcBilling implements Billing, Other {\n}').implements, ['Billing', 'Other'])
})

test('class diagram: interfaces of a feature with the classes that implement them', async () => {
  const { portModel } = await import('./models.mjs')
  const m = portModel('billing', [
    { name: 'Billing', kind: 'interface', fields: [], methods: ['issueDeposit()'], implements: [], pkg: 'billing' },
    { name: 'JdbcBilling', kind: 'class', fields: [], methods: [], implements: ['Billing'], pkg: 'billing' },
    { name: 'Other', kind: 'class', fields: [], methods: [], implements: [], pkg: 'billing' },
  ])
  assert.equal(m.name, '06_Class/ports-billing')
  assert.deepEqual(m.nodes.map((n) => n.id), ['Billing', 'JdbcBilling'])
  assert.deepEqual(m.edges, [{ from: 'JdbcBilling', to: 'Billing', dashed: true, arrow: 'triangle' }])
})

test('overviewErd keeps the main entities and the foreign keys between them only', () => {
  const t = (name, fks = []) => ({ name, prefix: name.split('_')[0], columns: [{ name: 'id' }], constraints: [
    { type: 'PK', def: 'PRIMARY KEY (id)' }, ...fks.map(([col, ref]) => ({ type: 'FK', def: `FOREIGN KEY (${col}) REFERENCES ${ref}(id)`, refTable: ref }))] })
  const schema = [t('auth_user'), t('inv_bed'), t('asg_allocation', [['student_id', 'auth_user'], ['bed_id', 'inv_bed'], ['run_id', 'asg_run']]), t('asg_run')]
  const m = overviewErd(schema, ['auth_user', 'inv_bed', 'asg_allocation'])
  assert.equal(m.name, '05_ERD/erd-overview')
  assert.deepEqual(m.entities.map((e) => e.id), ['auth_user', 'inv_bed', 'asg_allocation'])
  assert.deepEqual(m.relationships.map((r) => `${r.from}>${r.to}`), ['asg_allocation>auth_user', 'asg_allocation>inv_bed'])
})

test('overviewErd leaves out the "who did it" columns (…_by)', () => {
  const t = (name, fks = []) => ({ name, prefix: name.split('_')[0], columns: [{ name: 'id' }], constraints: [
    { type: 'PK', def: 'PRIMARY KEY (id)' }, ...fks.map(([col, ref]) => ({ type: 'FK', def: `FOREIGN KEY (${col}) REFERENCES ${ref}(id)`, refTable: ref }))] })
  const m = overviewErd([t('auth_user'), t('bil_invoice', [['student_id', 'auth_user'], ['voided_by', 'auth_user']])], ['auth_user', 'bil_invoice'])
  assert.deepEqual(m.relationships.map((r) => r.label), ['student'])
})
