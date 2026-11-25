// Shared steps of the end-to-end specs: English screens, sign-in through the form, demo stage resets.
import { expect } from '@playwright/test'

/** The dev seed's demo password (backend/CLAUDE.md, public until the defence); override with E2E_PASSWORD. */
export const PASSWORD = process.env.E2E_PASSWORD || '123'

/** English screens for every page of this context (the app defaults to Vietnamese). */
export async function english(page) {
  await page.addInitScript(() => localStorage.setItem('campusstay-lang', 'en'))
}

/** Signs in through the sign-in form and waits for the portal. */
export async function signIn(page, email) {
  await english(page)
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL(/\/signin/)
}

/** Loads a demo stage (0, A, B, C, D) as admin01 through the API; the base data must be loaded (dev profile). */
export async function resetDemo(request, stage) {
  const signIn = await request.post('/api/auth/sign-in', { data: { email: 'admin01@fpt.edu.vn', password: PASSWORD } })
  expect(signIn.ok(), await signIn.text()).toBeTruthy()
  const { token } = await signIn.json()
  const reset = await request.post('/api/admin/demo/reset', {
    headers: { Authorization: `Bearer ${token}` },
    data: { stage, confirm: 'RESET' },
    timeout: 170_000,
  })
  expect(reset.ok(), `demo reset ${stage}: ${reset.status()} ${await reset.text()}`).toBeTruthy()
}
