import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseController, parsePermissions, parseRoutes, parseMobileScreens, parseStatusChecks, parseTransitions,
  parseMessagesVi, parseApiErrors, parseTestIds, parseJunitXml, weekOf, parseGitLog,
} from './parse.mjs'

test('controller mappings: class prefix + method path, the require() inside the method', () => {
  const src = `
@RestController
@RequestMapping("/terminations")
class TerminationController {
    @GetMapping
    Page list() { currentUser.require(Permission.TERMINATE_STAYS); return null; }
    @PostMapping("/{id}/cancel")
    void cancel(@PathVariable String id) { }
    @PutMapping(path = "/x", consumes = "a")
    void x() { currentUser.require(Role.STUDENT); }
}`
  assert.deepEqual(parseController(src, 'TerminationController'), [
    { method: 'GET', path: '/terminations', handler: 'list', controller: 'TerminationController', requires: ['Permission.TERMINATE_STAYS'] },
    { method: 'POST', path: '/terminations/{id}/cancel', handler: 'cancel', controller: 'TerminationController', requires: [] },
    { method: 'PUT', path: '/terminations/x', handler: 'x', controller: 'TerminationController', requires: ['Role.STUDENT'] },
  ])
})

test('permissions: label and roles, across wrapped lines', () => {
  const src = `public enum Permission {
    APPLY("Apply for a Bed", Role.STUDENT),
    DECIDE_ROOM_CHANGES("Decide next-Term requests (Staff inside"
            + " their Blocks)", Role.STAFF, Role.MANAGER);
    private final String label;`
  assert.deepEqual(parsePermissions(src), [
    { permission: 'APPLY', label: 'Apply for a Bed', roles: ['STUDENT'] },
    { permission: 'DECIDE_ROOM_CHANGES', label: 'Decide next-Term requests (Staff inside their Blocks)', roles: ['STAFF', 'MANAGER'] },
  ])
})

test('routes: public pages and portal pages with their role; redirects are left out', () => {
  const src = `
      { path: 'signin', element: <SignIn /> },
      portal('student', <StudentLayout />, [
        { index: true, ...page(StudentHome) },
        { path: 'apply', element: <Navigate to="/student/apply/term" replace /> },
        { path: 'apply/term', ...page(ApplyTerm) },
      ]),
      portal('staff', <StaffLayout />, [
        { path: 'desk', ...page(CheckInDesk) },
      ]),`
  assert.deepEqual(parseRoutes(src), [
    { portal: 'public', path: '/signin', component: 'SignIn' },
    { portal: 'student', path: '/student', component: 'StudentHome' },
    { portal: 'student', path: '/student/apply/term', component: 'ApplyTerm' },
    { portal: 'staff', path: '/staff/desk', component: 'CheckInDesk' },
  ])
})

test('mobile screens: widget classes named …Screen or …Page', () => {
  const src = 'class InvoiceScreen extends StatefulWidget {}\nclass _Helper extends StatelessWidget {}\nclass PaymentsPage extends StatelessWidget {}'
  assert.deepEqual(parseMobileScreens(src, 'payments.dart'), [
    { screen: 'InvoiceScreen', file: 'payments.dart' },
    { screen: 'PaymentsPage', file: 'payments.dart' },
  ])
})

test('status CHECK constraints: the latest migration wins', () => {
  const v1 = "CREATE TABLE asg_termination (\n id BIGINT,\n status VARCHAR(12) NOT NULL CHECK (status IN ('NOTICE_SENT', 'CANCELLED')),\n x INT\n);"
  const v2 = "ALTER TABLE asg_termination ADD CONSTRAINT ck_termination_status CHECK (status IN ('NOTICE_SENT', 'OVERDUE', 'CANCELLED', 'CLOSED'));"
  assert.deepEqual(parseStatusChecks([v1, v2]), [
    { table: 'asg_termination', column: 'status', states: ['NOTICE_SENT', 'OVERDUE', 'CANCELLED', 'CLOSED'] },
  ])
})

test('transitions: UPDATE … SET status = … WHERE … status = / IN', () => {
  const src = `class TerminationService {
    void cancel() {
        jdbc.sql("""
                UPDATE asg_termination SET status = 'CANCELLED', cancel_reason = :why
                WHERE id = :id AND status = 'NOTICE_SENT'
                """);
    }
    void overdue() { jdbc.sql("UPDATE asg_termination SET status = 'OVERDUE' WHERE status IN ('NOTICE_SENT')"); }
}`
  assert.deepEqual(parseTransitions(src, 'TerminationService'), [
    { table: 'asg_termination', from: ['NOTICE_SENT'], to: 'CANCELLED', by: 'TerminationService.cancel' },
    { table: 'asg_termination', from: ['NOTICE_SENT'], to: 'OVERDUE', by: 'TerminationService.overdue' },
  ])
})

test('transitions: the enclosing method, not a keyword; one SQL string at a time; store.transition(…) calls', () => {
  const src = `class ApplicationService {
    private final ApplicationStore applications;
    public Result accept(long id) {
        if (ok) {
            jdbc.sql("UPDATE app_roommate_invitation SET responded_at = :now WHERE id = :id");
            jdbc.sql("UPDATE app_roommate_invitation SET status = 'ACCEPTED' WHERE status = 'PENDING'");
        }
        for (var x : xs) {
            applications.transition(id, Set.of("AWAITING_DEPOSIT", "AWAITING_ROOMMATE"), "SUBMITTED");
        }
        record Row(long id, String status) {
        }
        jdbc.sql("""
                INSERT INTO x VALUES (1)
                ON CONFLICT (id) DO UPDATE SET a = 1
                """);
        jdbc.sql("UPDATE app_round2_offer SET status = 'EXPIRED' WHERE id = :id");
        jdbc.sql("UPDATE app_round2_offer SET status = :status WHERE id = :id AND status = 'PENDING'");
        return null;
    }
}`
  assert.deepEqual(parseTransitions(src, 'ApplicationService', { applications: 'app_application' }), [
    { table: 'app_roommate_invitation', from: ['PENDING'], to: 'ACCEPTED', by: 'ApplicationService.accept' },
    { table: 'app_application', from: ['AWAITING_DEPOSIT', 'AWAITING_ROOMMATE'], to: 'SUBMITTED', by: 'ApplicationService.accept' },
    { table: 'app_round2_offer', from: [], to: 'EXPIRED', by: 'ApplicationService.accept' },
  ])
})

test('messages: the Vietnamese file and the API error codes', () => {
  assert.deepEqual(parseMessagesVi('# comment\nThis Term does not exist. ⟶ Học kỳ không tồn tại.\n'),
    { 'This Term does not exist.': 'Học kỳ không tồn tại.' })
  const src = 'throw ApiException.conflict("TERMINATION_CLOSED", "This termination is already closed.");\n'
    + 'throw ApiException.notFound("This Term does not exist.");'
  assert.deepEqual(parseApiErrors(src), [
    { code: 'TERMINATION_CLOSED', kind: 'conflict', message: 'This termination is already closed.' },
    { code: null, kind: 'notFound', message: 'This Term does not exist.' },
  ])
})

test('test ids: the TC id in the Javadoc of the next test method', () => {
  const src = `class SwapIT {
    /** TC-REQ-011: the swap board of the window. */
    @Test
    void swapBoard() throws Exception {}

    /**
     * TC-REQ-012 (business rule): across Blocks.
     */
    @Test
    void crossBlock() {}
}`
  assert.deepEqual(parseTestIds(src, 'SwapIT'), [
    { id: 'TC-REQ-011', class: 'SwapIT', method: 'swapBoard', title: 'the swap board of the window.' },
    { id: 'TC-REQ-012', class: 'SwapIT', method: 'crossBlock', title: '(business rule): across Blocks.' },
  ])
})

test('JUnit XML: one result per test method', () => {
  const xml = '<testsuite name="vn.fpt.campusstay.SwapIT"><testcase name="swapBoard" classname="vn.fpt.campusstay.SwapIT" time="1"/>'
    + '<testcase name="crossBlock" classname="vn.fpt.campusstay.SwapIT"><failure message="x"/></testcase></testsuite>'
  assert.deepEqual(parseJunitXml(xml), [
    { class: 'SwapIT', method: 'swapBoard', result: 'Passed' },
    { class: 'SwapIT', method: 'crossBlock', result: 'Failed' },
  ])
})

test('weeks: Week 1 starts Monday 07/09/2026', () => {
  assert.equal(weekOf('2026-09-07'), 1)
  assert.equal(weekOf('2026-09-13'), 1)
  assert.equal(weekOf('2026-11-02'), 9)
  assert.equal(weekOf('2026-11-23'), 12)
})

test('git log: commits with author, date and files', () => {
  const log = '\u0001abc|2026-11-20|vominhluan17|feat(auth): staff shifts\nbackend/a.java\nweb/b.jsx\n\u0001def|2026-11-21|Le Trung|docs: x\ndocs/CHANGELOG.md\n'
  assert.deepEqual(parseGitLog(log), [
    { sha: 'abc', date: '2026-11-20', author: 'Võ Minh Luân', subject: 'feat(auth): staff shifts', files: ['backend/a.java', 'web/b.jsx'] },
    { sha: 'def', date: '2026-11-21', author: 'Lê Thành Minh Trung', subject: 'docs: x', files: ['docs/CHANGELOG.md'] },
  ])
})

test('URL security rules: first matching rule wins, methods narrow a rule', async () => {
  const { parseSecurityRules, accessOf } = await import('./parse.mjs')
  const src = `.authorizeHttpRequests(auth -> auth
        .requestMatchers(HttpMethod.POST, "/auth/sign-in",
                "/auth/password/reset")
        .permitAll()
        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
        .requestMatchers("/students/**").hasRole("STUDENT")
        .anyRequest().authenticated())`
  const rules = parseSecurityRules(src)
  assert.equal(accessOf(rules, 'POST', '/auth/sign-in'), 'public')
  assert.equal(accessOf(rules, 'GET', '/auth/sign-in'), 'signed in')
  assert.equal(accessOf(rules, 'GET', '/actuator/health/readiness'), 'public')
  assert.equal(accessOf(rules, 'PUT', '/students/me/contacts'), 'STUDENT')
  assert.equal(accessOf(rules, 'GET', '/terminations'), 'signed in')
})

test('status values from a Postgres CHECK definition', async () => {
  const { statesOfCheck } = await import('./parse.mjs')
  assert.deepEqual(statesOfCheck("CHECK (((status)::text = ANY ((ARRAY['NOTICE_SENT'::character varying, 'OVERDUE'::character varying])::text[])))"),
    { column: 'status', states: ['NOTICE_SENT', 'OVERDUE'] })
  assert.deepEqual(statesOfCheck("CHECK ((renewal)::text = ANY (ARRAY['CONTINUING'::text, 'AWAITING_EXTENSION'::text]))"),
    { column: 'renewal', states: ['CONTINUING', 'AWAITING_EXTENSION'] })
  assert.equal(statesOfCheck('CHECK ((price > 0))'), null)
})

test('permissions: a Javadoc brace before the enum does not cut it', () => {
  const src = '/** Uses {@link Role}. */\npublic enum Permission {\n    APPLY("Apply", Role.STUDENT);\n}'
  assert.deepEqual(parsePermissions(src), [{ permission: 'APPLY', label: 'Apply', roles: ['STUDENT'] }])
})

test('permissions: a ; inside a label does not end the enum', () => {
  const src = 'public enum Permission {\n    VIEW("Read; comment", Role.MANAGER,\n            Role.ADMIN),\n    READ("Read", Role.ADMIN);\n    private final String a;\n}'
  assert.deepEqual(parsePermissions(src).map((p) => p.permission), ['VIEW', 'READ'])
})

test('transitions: an INSERT gives the state a row is created in', () => {
  const src = `class ApplicationService {
    void create() {
        jdbc.sql("""
                INSERT INTO app_application (id, code, status, mode)
                SELECT id, 'APP-' || lpad(id::text, 6, '0'), 'AWAITING_DEPOSIT', :mode
                """);
        jdbc.sql("INSERT INTO asg_run (term_id, status) VALUES (:t, 'PROPOSED') RETURNING id");
        jdbc.sql("INSERT INTO x (a, status) VALUES (:a, :status)");
    }
}`
  assert.deepEqual(parseTransitions(src, 'ApplicationService'), [
    { table: 'app_application', from: ['(created)'], to: 'AWAITING_DEPOSIT', by: 'ApplicationService.create' },
    { table: 'asg_run', from: ['(created)'], to: 'PROPOSED', by: 'ApplicationService.create' },
  ])
})

test('transitions: an event listener is named with its event, on(DepositPaid)', () => {
  const src = `class ApplicationService {
    @EventListener
    void on(DepositPaid e) {
        jdbc.sql("UPDATE app_application SET status = 'SUBMITTED' WHERE id = :id AND status = 'AWAITING_DEPOSIT'");
    }
}`
  assert.equal(parseTransitions(src, 'ApplicationService')[0].by, 'ApplicationService.on(DepositPaid)')
})

test('settings from the migrations: inserts with their column lists, then literal updates and deletes, in order', async () => {
  const { parseSettings } = await import('./parse.mjs')
  const v1 = `INSERT INTO cfg_parameter (key, section, label, value_type, value, helper, options, sort_order) VALUES
  ('a.x', 'Sec', 'Label ''A''', 'INT', '5', 'Help, with comma', NULL, 1),
  ('a.y', 'Sec', 'Old', 'BOOL', 'true', NULL, NULL, 2);`
  const v2 = `UPDATE cfg_parameter SET label = 'New', helper = 'H' WHERE key = 'a.y';
UPDATE cfg_parameter SET value = '7' WHERE key LIKE 'a.%';
DELETE FROM cfg_parameter WHERE key = 'a.gone';`
  assert.deepEqual(parseSettings([v1, v2]), [
    { key: 'a.x', section: 'Sec', label: "Label 'A'", valueType: 'INT', value: '7', helper: 'Help, with comma' },
    { key: 'a.y', section: 'Sec', label: 'New', valueType: 'BOOL', value: '7', helper: 'H' },
  ])
})
