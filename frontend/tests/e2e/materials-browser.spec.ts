/**
 * Materials Browser E2E tests.
 *
 * Requires authenticated storage state — run `yarn test:e2e:setup` first
 * with PLAYWRIGHT_EMAIL / PLAYWRIGHT_PASSWORD set in .env.playwright.local.
 *
 * Tests assume the G55 project exists and has been seeded via
 *   python manage.py seed_type_definition_layers --project 4d9eb7fe-852f-4722-9202-9039bfbfb0d9
 *
 * Run:
 *   yarn test:e2e                    # all tests
 *   yarn test:e2e materials          # just this file
 *   yarn test:e2e --headed           # watch it work
 *   yarn test:e2e --debug            # Playwright inspector
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');
const G55_PROJECT_ID = '4d9eb7fe-852f-4722-9202-9039bfbfb0d9';
const MATERIALS_URL = `/projects/${G55_PROJECT_ID}/material-library`;

// Skip the whole file if we haven't authed — saves noisy CI failures on fresh checkouts.
test.skip(
  !existsSync(AUTH_FILE),
  `storageState missing at ${AUTH_FILE} — run 'yarn test:e2e:setup' first`,
);

test.describe('Materials Browser', () => {
  test('page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    await page.goto(MATERIALS_URL);
    // Wait for data to arrive and the table/tree to render
    await expect(page.locator('table thead')).toBeVisible({ timeout: 30_000 });

    expect(errors, `Unexpected errors on materials browser:\n${errors.join('\n')}`).toEqual([]);
  });

  test('family tree shows expected Norwegian families with seeded data', async ({ page }) => {
    await page.goto(MATERIALS_URL);
    await expect(page.locator('table thead')).toBeVisible({ timeout: 30_000 });

    // Expected L1 families from the seed recipes (Norwegian labels)
    await expect(page.getByText('Betong', { exact: true })).toBeVisible();
    await expect(page.getByText('Metall', { exact: true })).toBeVisible();
    await expect(page.getByText('Isolasjon', { exact: true })).toBeVisible();
    await expect(page.getByText('Plater', { exact: true })).toBeVisible();
    await expect(page.getByText('Glass', { exact: true })).toBeVisible();
  });

  test('header coverage stats show non-zero materials', async ({ page }) => {
    await page.goto(MATERIALS_URL);
    await expect(page.locator('table thead')).toBeVisible({ timeout: 30_000 });

    // Header shows N materials · M sets. Expect materials > 0.
    const headerText = await page.locator('body').innerText();
    const materialsMatch = headerText.match(/(\d+)\s+materialer/);
    expect(materialsMatch, 'Header should show a material count').not.toBeNull();
    expect(Number(materialsMatch![1])).toBeGreaterThan(0);
  });

  test('tab toggle switches between Materials and Sets', async ({ page }) => {
    await page.goto(MATERIALS_URL);
    await expect(page.locator('table thead')).toBeVisible({ timeout: 30_000 });

    // Click the Sets tab
    await page.getByRole('button', { name: /Sett \(\d+\)/ }).click();

    // Materials table should be gone, set cards should appear
    await expect(page.locator('table thead')).not.toBeVisible();

    // Switch back to Materials
    await page.getByRole('button', { name: /Materialer \(\d+\)/ }).click();
    await expect(page.locator('table thead')).toBeVisible();
  });

  test('lens switch (All / LCA / Procurement) reorders columns', async ({ page }) => {
    await page.goto(MATERIALS_URL);
    await expect(page.locator('table thead')).toBeVisible({ timeout: 30_000 });

    const headers = () => page.locator('table thead th');

    // Default "Alle" shows both LCA and Innkjøp columns
    await expect(headers()).toContainText(['Navn', 'Familie', 'Mengde', 'Brukt i', 'LCA', 'Innkjøp']);

    // Switch to LCA lens — procurement column should disappear
    await page.getByRole('button', { name: /^LCA$/ }).click();
    await expect(headers().filter({ hasText: 'Innkjøp' })).toHaveCount(0);
    await expect(headers().filter({ hasText: 'LCA' })).toHaveCount(1);

    // Switch to Procurement lens — LCA column should disappear
    await page.getByRole('button', { name: /Innkjøp/ }).first().click();
    await expect(headers().filter({ hasText: 'LCA' })).toHaveCount(0);
  });

  test('clicking a family filters the table', async ({ page }) => {
    await page.goto(MATERIALS_URL);
    await expect(page.locator('table thead')).toBeVisible({ timeout: 30_000 });

    // Count all materials initially
    const allRowsCount = await page.locator('table tbody tr').count();
    expect(allRowsCount).toBeGreaterThan(0);

    // Click "Betong" in the family tree
    await page.getByText('Betong', { exact: true }).first().click();

    // Filtered row count should be > 0 and ≤ all rows
    const filteredCount = await page.locator('table tbody tr').count();
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThanOrEqual(allRowsCount);

    // Clear filter button should appear
    await expect(page.getByRole('button', { name: /Nullstill filter/ })).toBeVisible();
  });

  test('search narrows results', async ({ page }) => {
    await page.goto(MATERIALS_URL);
    await expect(page.locator('table thead')).toBeVisible({ timeout: 30_000 });

    const allRowsCount = await page.locator('table tbody tr').count();
    expect(allRowsCount).toBeGreaterThan(1);

    await page.getByPlaceholder(/Søk i materialer/).fill('betong');
    // Give debounce + re-render a moment
    await expect(page.locator('table tbody tr')).not.toHaveCount(allRowsCount);

    const filteredRowsCount = await page.locator('table tbody tr').count();
    expect(filteredRowsCount).toBeGreaterThan(0);
    expect(filteredRowsCount).toBeLessThan(allRowsCount);
  });

  test('clicking a material row opens the detail panel', async ({ page }) => {
    await page.goto(MATERIALS_URL);
    await expect(page.locator('table thead')).toBeVisible({ timeout: 30_000 });

    // Click the first row
    await page.locator('table tbody tr').first().click();

    // Detail panel should show the "Material" label and quantities section
    await expect(page.getByText('MATERIAL', { exact: true }).or(page.getByText('Material', { exact: true }))).toBeVisible();
    await expect(page.getByText(/Mengder|Quantities/i)).toBeVisible();
    await expect(page.getByText(/Brukt i|Used in/i)).toBeVisible();
  });

  test('coverage lights are all red (no EPD / procurement data in seeded state)', async ({ page }) => {
    await page.goto(MATERIALS_URL);
    await expect(page.locator('table thead')).toBeVisible({ timeout: 30_000 });

    // The header shows EPD % and procurement %. Both should be 0% for seeded data.
    const headerText = await page.locator('body').innerText();
    expect(headerText).toContain('0%');
    expect(headerText).toMatch(/med EPD|EPD linked/);
  });
});
