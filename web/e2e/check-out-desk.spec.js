// Flow 2 (plan Q4): Staff checks a student out at the desk: final meters, room condition, settlement summary read
// aloud, complete. Demo stage C (turnover week); se210004 leaves at the end of Term (scenario D11).
import { test, expect } from '@playwright/test'
import { resetDemo, signIn } from './support.js'

test('Staff checks a student out at the desk with the final readings and the settlement', async ({ page, request }) => {
  await resetDemo(request, 'C')
  await signIn(page, 'staffa01@fpt.edu.vn')
  // Outside a planned shift every change asks once; accept it whenever it appears.
  page.on('dialog', (d) => d.accept())
  const shift = page.getByRole('dialog', { name: /Outside your shift|Not your assigned work/ })

  await page.goto('/staff/check-out')
  await page.getByRole('searchbox', { name: 'Search' }).fill('SE210004')
  await page.getByText('SE210004 · ', { exact: false }).first().click()

  // Readings far above any opening meter, so they are never "lower than the last one".
  await page.getByLabel('Electricity (kWh)').fill('99999')
  await page.getByLabel('Water (m³)').fill('9999')
  await page.getByRole('radio', { name: 'Bed, mattress and locker in good condition' }).check()
  await page.getByRole('button', { name: 'Confirm check-out' }).click()
  if (await shift.isVisible().catch(() => false)) await shift.getByRole('button', { name: 'Confirm and continue' }).click()

  const summary = page.getByRole('dialog', { name: /Settlement summary/ })
  await expect(summary).toBeVisible()
  await expect(summary.getByText('Utility deposit held')).toBeVisible()
  await summary.getByRole('button', { name: 'Confirm and complete' }).click()
  if (await shift.isVisible().catch(() => false)) await shift.getByRole('button', { name: 'Confirm and continue' }).click()

  await expect(page.getByText(/checked out/).first()).toBeVisible()
  await page.getByRole('tab', { name: /Checked out/ }).click()
  await expect(page.getByText('SE210004 · ', { exact: false }).first()).toBeVisible()
})
