import test from 'node:test'
import assert from 'node:assert/strict'
import { methodBody, httpSteps, expectations, caseType, testMethods } from './report5.mjs'

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
