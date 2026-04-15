import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for sprucelab frontend.
 *
 * Auth strategy: storageState captured once via the `setup` project.
 * Run `yarn test:e2e:setup` to log in and save state to tests/e2e/.auth/user.json.
 * All subsequent test projects reuse that saved session.
 *
 * The setup reads credentials from env vars:
 *   PLAYWRIGHT_EMAIL=<email>
 *   PLAYWRIGHT_PASSWORD=<password>
 *
 * Place them in frontend/.env.playwright.local (gitignored) — it's sourced by
 * the setup spec via dotenv.
 *
 * See tests/e2e/README.md for full docs.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // sequential — we share a real DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Auto-start the Vite dev server if it's not already running. Reuse if it is.
  webServer: {
    command: 'yarn dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      // Public / unauthenticated tests — no storageState required.
      // Smoke specs run under this project.
      name: 'public',
      use: devices['Desktop Chrome'],
      testMatch: /smoke\.spec\.ts/,
    },
    {
      // Authenticated tests — use the captured storage state from auth.setup.
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: [/.*\.setup\.ts/, /smoke\.spec\.ts/],
    },
  ],
});
