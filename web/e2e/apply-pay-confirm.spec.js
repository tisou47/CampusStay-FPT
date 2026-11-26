// Flow 1 (plan Q4): a student applies, reports the Deposit transfer, a Manager confirms it with the receipt.
// Demo stage A (registration open); se220001 is the scenario account of D03 (db/demo/scenarios.csv).
import { test, expect } from '@playwright/test'
import { resetDemo, signIn } from './support.js'

const RECEIPT = { name: 'transfer.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex') }

test('student applies → claims the transfer → Manager confirms', async ({ browser, request }) => {
  await resetDemo(request, 'A')

  const student = await (await browser.newContext()).newPage()
  await signIn(student, 'se220001@fpt.edu.vn')
  await student.goto('/student/apply/term')
  await student.getByRole('button', { name: 'Continue' }).click()
  await student.getByRole('radio', { name: /4-bed/ }).first().check()
  await student.getByRole('radio', { name: /Standard/ }).first().check()
  await student.getByRole('button', { name: 'Continue' }).click()
  // 4-bed Rooms match roommates automatically: the wizard skips the Roommate step.
  await student.getByRole('checkbox', { name: /match roommates/ }).check()
  await student.getByRole('checkbox', { name: /dormitory rules/ }).check()
  await student.getByRole('button', { name: 'Continue' }).click()
  await student.getByRole('checkbox', { name: 'I confirm the information above is correct.' }).check()
  await student.getByRole('button', { name: 'Submit and pay deposit' }).click()

  await expect(student).toHaveURL(/\/student\/invoices\/[^/]+\/pay/)
  const invoiceId = decodeURIComponent(student.url().split('/invoices/')[1].split('/')[0])
  await student.getByRole('button', { name: 'I have transferred' }).click()
  await student.getByRole('button', { name: 'Yes, I have transferred' }).click()
  await expect(student.getByText('Transfer reported').first()).toBeVisible()

  const manager = await (await browser.newContext()).newPage()
  await signIn(manager, 'manager01@fpt.edu.vn')
  await manager.goto('/manager/payment-claims')
  await manager.getByRole('searchbox', { name: 'Search' }).or(manager.getByLabel('Search')).first().fill(invoiceId)
  const row = manager.getByRole('row').filter({ hasText: invoiceId })
  await expect(row).toHaveCount(1)
  await row.locator('input[type="file"]').setInputFiles(RECEIPT)
  await expect(row.getByRole('button', { name: 'Replace' })).toBeVisible()
  await row.getByRole('checkbox', { name: `Select ${invoiceId}` }).check()
  await manager.getByRole('button', { name: 'Confirm (1)' }).first().click()
  await manager.getByRole('dialog').getByRole('button', { name: /^Confirm 1 payment/ }).click()
  await expect(manager.getByRole('row').filter({ hasText: invoiceId })).toHaveCount(0)

  await student.goto(`/student/invoices/${invoiceId}`)
  await expect(student.getByText('Paid', { exact: false }).first()).toBeVisible()
})
