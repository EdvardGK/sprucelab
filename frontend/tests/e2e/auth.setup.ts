/**
 * One-time auth setup for Playwright.
 *
 * Reads PLAYWRIGHT_EMAIL + PLAYWRIGHT_PASSWORD from frontend/.env.playwright.local
 * or process env, logs in through the real Supabase flow, then saves the
 * authenticated storage state to tests/e2e/.auth/user.json.
 *
 * All subsequent test projects (`chromium` etc.) reuse that saved session,
 * so they land on the app already logged in.
 *
 * Run:
 *   yarn test:e2e:setup
 *
 * If credentials are missing, the setup skips gracefully with a clear message
 * so CI doesn't blow up when PLAYWRIGHT_* secrets aren't provisioned.
 */
import { test as setup, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

function loadLocalEnv() {
  const envFile = path.join(__dirname, '..', '..', '.env.playwright.local');
  if (!existsSync(envFile)) return;
  const content = readFileSync(envFile, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

setup('authenticate', async ({ page }) => {
  loadLocalEnv();

  const email = process.env.PLAYWRIGHT_EMAIL;
  const password = process.env.PLAYWRIGHT_PASSWORD;

  if (!email || !password) {
    console.log('\n[auth.setup] PLAYWRIGHT_EMAIL / PLAYWRIGHT_PASSWORD not set.');
    console.log('[auth.setup] Create frontend/.env.playwright.local with:');
    console.log('[auth.setup]   PLAYWRIGHT_EMAIL=you@example.com');
    console.log('[auth.setup]   PLAYWRIGHT_PASSWORD=your-password');
    console.log('[auth.setup] Then re-run: yarn test:e2e:setup');
    console.log('[auth.setup] Skipping auth — authenticated tests will not be able to run.\n');
    setup.skip();
    return;
  }

  const authDir = path.dirname(AUTH_FILE);
  if (!existsSync(authDir)) mkdirSync(authDir, { recursive: true });

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /sprucelab/i })).toBeVisible();

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.startsWith('/login') && !url.pathname.startsWith('/welcome'), {
    timeout: 15_000,
  });

  // Persist authenticated state
  await page.context().storageState({ path: AUTH_FILE });

  console.log(`[auth.setup] Storage state saved to ${AUTH_FILE}`);
});
