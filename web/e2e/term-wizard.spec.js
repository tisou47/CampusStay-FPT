// Flow 3 (plan Q4): an Admin creates a Term in the wizard (General → … → Review) and publishes it.
// Demo stage A: Terms N and N+1 exist; the new Term's stay is years later, so it overlaps none.
import { test, expect } from '@playwright/test'
import { resetDemo, signIn } from './support.js'

test('Admin creates and publishes a Term through the wizard', async ({ page, request }) => {
  await resetDemo(request, 'A')
  const name = `E2E Term ${Date.now().toString().slice(-6)}`

  await signIn(page, 'admin01@fpt.edu.vn')
  await page.goto('/admin/terms/new')
  await page.getByLabel('Name').fill(name)
  for (const [label, day] of [['Stay starts', '05/01/2032'], ['Stay ends', '25/04/2032']]) {
    await page.getByLabel(label).fill(day)
    await page.getByLabel(label).press('Enter')
  }
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/admin\/terms\/[^/]+\?step=timeline/)
  // Registration milestones (spec §5.2 order); the renewal milestones stay empty (optional).
  for (const [label, value] of [
    ['Registration opens', '01/09/2031 08:00'],
    ['Registration closes', '30/09/2031 17:00'],
    ['Assignment results', '15/10/2031 08:00'],
    ['Balance due', '15/11/2031 17:00'],
    ['Check-in from', '01/01/2032'],
    ['Check-in until', '04/01/2032'],
    ['Check-out by', '26/04/2032'],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value)
    await page.getByLabel(label, { exact: true }).press('Enter')
  }

  // Every later step keeps its defaults (prices from the Term before, every Block): save each until the review.
  const publish = page.getByRole('button', { name: 'Publish the term' })
  // Each step remounts after its save: wait for the next step's address before clicking again, or the click lands
  // on the button of the step being replaced.
  for (let step = 0; step < 10 && !(await publish.isVisible()); step++) {
    const current = new URL(page.url()).searchParams.get('step')
    await page.getByRole('button', { name: 'Save and continue' }).click()
    await page.waitForURL((url) => url.searchParams.get('step') !== current)
    await page.waitForLoadState('networkidle')
  }
  await expect(page.getByText('Ready to publish')).toBeVisible()
  await publish.click()
  const dialog = page.getByRole('dialog', { name: `Publish ${name}?` })
  await dialog.getByRole('button', { name: /Publish/ }).click()
  await expect(page.getByText(`${name} published`)).toBeVisible()

  await page.goto('/admin/terms')
  await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Published')
})
