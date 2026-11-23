import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduledJobs, eventListeners, pageHeader, validationMessages, importedServices, javadocBefore } from './r3parse.mjs'

test('scheduled jobs: setting key and default, or a cron; the method; the Javadoc sentence', () => {
  const src = `class J {
    /** Expires Deposit windows. Runs often. */
    @Scheduled(fixedDelayString = "\${campusstay.app.expiry-interval:5m}", initialDelayString = "1m")
    public void expire() { }
    @Scheduled(cron = "0 0 6 * * *", zone = "Asia/Ho_Chi_Minh")
    void startRuns() { }
}`
  assert.deepEqual(scheduledJobs(src, 'J'), [
    { class: 'J', method: 'expire', schedule: 'every 5m (setting campusstay.app.expiry-interval)', description: 'Expires Deposit windows.' },
    { class: 'J', method: 'startRuns', schedule: 'cron 0 0 6 * * *', description: '' },
  ])
})

test('event listeners: the event type, after commit or not', () => {
  const src = `class L {
    /** Opens the task. */
    @EventListener
    void on(ResidentLeftRoom e) { }
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void onPaid(final PaymentConfirmed e) { }
}`
  assert.deepEqual(eventListeners(src, 'L').map((x) => [x.event, x.method, x.after, x.description]),
    [['ResidentLeftRoom', 'on', false, 'Opens the task.'], ['PaymentConfirmed', 'onPaid', true, '']])
})

test('page header: title and subtitle from string attributes; an expression gives an empty title', () => {
  assert.deepEqual(pageHeader('<PageHeader title="Decisions" subtitle="Requests waiting for you" actions={x} />'), { title: 'Decisions', subtitle: 'Requests waiting for you' })
  assert.deepEqual(pageHeader('<PageHeader title={title}>'), { title: '', subtitle: '' })
})

test('controller helpers: validation messages (unique) and imported services', () => {
  const src = 'import vn.fpt.campusstay.service.billing.FinanceService;\nimport vn.fpt.campusstay.dto.PageQuery;\nrecord R(@NotBlank(message = "Enter it.") String a, @Size(max = 3, message = "Enter it.") String b) {}'
  assert.deepEqual(validationMessages(src), ['Enter it.'])
  assert.deepEqual(importedServices(src), ['FinanceService'])
  assert.equal(javadocBefore('/** One. Two. */\nclass X {}', 17), 'One.')
})
