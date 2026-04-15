/**
 * Public-page smoke tests. No authentication required.
 *
 * These run against the login page and verify that the bundle compiles,
 * loads, and doesn't crash on mount. If these fail, something broke at
 * a fundamental level (TypeScript, build, CSS, etc).
 */
import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('login page renders without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sprucelab/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

    expect(errors, `Unexpected errors on /login:\n${errors.join('\n')}`).toEqual([]);
  });

  test('unauthenticated navigation to a gated page redirects to login', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
  });
});
