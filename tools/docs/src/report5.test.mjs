import test from 'node:test'
import assert from 'node:assert/strict'
import { methodBody, httpSteps, expectations, caseType, testMethods, controllerOf, exceptionRows } from './report5.mjs'

const SRC = `class PaymentDeskIT {
    /** TC-BIL-010: the list. */
    @Test
    void scopedList() throws Exception {
        String body = "{\\"mode\\":\\"auto\\"}"; // a } in a string
        getAs("/payments", manager).andExpect(status().isOk());
        mvc.perform(post("/payments/" + id + "/confirm").content(body)).andExpect(status().isForbidden());
        assertThat(x).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(ints = { 1, 2 })
    void rejectsNegativeAmounts(int n) { assertThatThrownBy(() -> f(n)); }

    void helper() { }
}`

test('methodBody skips braces inside strings and comments', () => {
  const b = methodBody(SRC, 'scopedList')
  assert.ok(b.startsWith('{') && b.endsWith('}'))
  assert.ok(b.includes('assertThat(x)'))
  assert.ok(!b.includes('rejectsNegativeAmounts'))
})

test('httpSteps lists the calls in order, with concatenated paths marked', () => {
  assert.deepEqual(httpSteps(methodBody(SRC, 'scopedList')), ['GET /payments', 'POST /payments/{…}'])
})

test('expectations names the statuses and counts the checks', () => {
  assert.equal(expectations(methodBody(SRC, 'scopedList')), 'HTTP 200 OK, 403 Forbidden; 3 checks')
})

test('caseType: abnormal for refusals, boundary for limits, else normal', () => {
  assert.equal(caseType('rejectsNegativeAmounts', ''), 'A')
  assert.equal(caseType('lastDayIsTheLimit', ''), 'B')
  assert.equal(caseType('readsViFormat', ''), 'N')
})

test('testMethods finds @Test and @ParameterizedTest methods with their comments', () => {
  assert.deepEqual(testMethods(SRC), [
    { method: 'scopedList', doc: 'TC-BIL-010: the list.' },
    { method: 'rejectsNegativeAmounts', doc: '' },
  ])
})

test('expectations counts assertions made through a helper such as assertError', () => {
  assert.equal(expectations('{ assertError(() -> exchange("used"), "INVALID_CODE"); }'), '1 check')
})

test('controllerOf matches a test step to the endpoint it calls, placeholders on either side', () => {
  const eps = [
    { method: 'POST', path: '/invoices/{id}/claim', controller: 'PaymentClaimController' },
    { method: 'GET', path: '/invoices/{id}', controller: 'StudentInvoiceController' },
    { method: 'GET', path: '/invoices/mine', controller: 'StudentInvoiceController2' },
  ]
  assert.equal(controllerOf('POST /invoices/{…}', eps), 'PaymentClaimController')
  assert.equal(controllerOf('POST /invoices/INV-1/claim', eps), 'PaymentClaimController')
  assert.equal(controllerOf('GET /invoices/mine', eps), 'StudentInvoiceController2')
  assert.equal(controllerOf('GET /invoices/{…}', eps), 'StudentInvoiceController')
})

test('exceptionRows files each flow\'s test cases under the "what if" they answer, and says when none does', () => {
  const flows = [{ id: 'MF-01', name: 'Registration', classes: ['ApplicationsIT'] }]
  const cases = [
    { id: 'TC-APP-003', class: 'ApplicationsIT', title: 'a second Application in the same Term is refused', result: 'Passed' },
    { id: 'TC-APP-009', class: 'ApplicationsIT', title: 'a Staff member cannot review (403)', result: 'Passed' },
    { id: 'TC-APP-010', class: 'ApplicationsIT', title: 'the Deposit deadline passes: the Application expires', result: 'Passed' },
    { id: 'TC-BIL-001', class: 'OtherIT', title: 'invalid amount', result: 'Passed' },
  ]
  const rows = exceptionRows(flows, cases)
  assert.deepEqual(rows.map((r) => [r.category, r.tests.map((t) => t.id).join(',')]), [
    ['Invalid or out-of-range input', ''],
    ['Two users act at once, or the same action twice', 'TC-APP-003'],
    ['A cancellation or a change after approval', ''],
    ['A payment, deadline or outside service fails', 'TC-APP-010'],
    ['A role does another role\'s work', 'TC-APP-009'],
  ])
})
