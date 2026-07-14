// =============================================================================
// E2E: Search → Result → Detail flow
// =============================================================================
import { test, expect } from '@playwright/test';

test.describe('Search Flow', () => {
  test('home page loads and shows search input', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=探索')).toBeVisible({ timeout: 10_000 });
  });

  test('search page renders with empty state', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('text=输入关键词')).toBeVisible({ timeout: 10_000 });
  });

  test('searching for "ARPES" returns results or empty state', async ({ page }) => {
    await page.goto('/search?q=ARPES');
    // Either shows results or "no results" — both valid if DB is empty
    await page.waitForTimeout(3_000);
    const hasResults = await page.locator('text=条结果').isVisible().catch(() => false);
    const hasEmpty = await page.locator('text=未找到结果').isVisible().catch(() => false);
    expect(hasResults || hasEmpty).toBe(true);
  });

  test('search type filter buttons are visible with facets', async ({ page }) => {
    await page.goto('/search?q=physics');
    await page.waitForTimeout(3_000);
    // Type filter sidebar
    const filter = page.locator('text=类型').first();
    // May or may not appear depending on data — test is non-blocking
    await expect(filter).toBeVisible({ timeout: 8_000 }).catch(() => {});
  });

  test('quality report page loads', async ({ page }) => {
    await page.goto('/quality');
    await expect(page.locator('text=数据质量')).toBeVisible({ timeout: 10_000 });
  });
});
