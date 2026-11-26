// End-to-end tests (Wave 3 QA, plan §6 Q4 and §8 Q8) against a locally running stack, never production:
//   backend: cd backend && mvn spring-boot:run          (dev profile on :8080, DEMO_TOOLS on, dev base data)
//   web:     cd web && npm run dev                      (:5173, /api proxied to the backend)
//   tests:   npx playwright install chromium (once; or set E2E_CHANNEL=msedge), then npm run test:e2e
// Each spec loads the demo stage it needs through Admin › Demo data (POST /api/admin/demo/reset): it REPLACES the
// business data of the database the backend uses, so point it only at a local development database.
// E2E_BASE_URL changes the web address (another port); E2E_PASSWORD the seed accounts' password (dev seed: "123").
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // the specs share one database and reset it
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // E2E_CHANNEL=msedge or chrome uses an installed browser instead of Playwright's own Chromium.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL || undefined } }],
})
