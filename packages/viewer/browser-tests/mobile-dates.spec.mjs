/* global document, getComputedStyle */
import { test, expect } from '@playwright/test';

for (const width of [320, 375, 390, 600, 601, 1280, 1440]) {
  test(`date controls stay inside padded card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/comparisons');
    const card = page.locator('.wb-primary-filters');
    const from = page.getByLabel('From date'), through = page.getByLabel('Through date');
    await expect(from).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const filled of [false, true]) {
      if (filled) { await from.fill('2026-10-19'); await through.fill('2026-10-20'); }
      const panel = await card.boundingBox();
      const a = await from.boundingBox(), b = await through.boundingBox();
      for (const box of [a, b]) {
        const inset = width <= 600 ? 26 : 20;
        expect(box.x - panel.x).toBeGreaterThanOrEqual(inset);
        expect(panel.x + panel.width - box.x - box.width).toBeGreaterThanOrEqual(inset);
      }
      if (width <= 600) {
        expect(b.y - a.y - a.height).toBeGreaterThanOrEqual(40);
        for (const field of [from, through]) {
          const padding = await field.evaluate(el => getComputedStyle(el).paddingLeft);
          expect(parseFloat(padding)).toBeGreaterThanOrEqual(16);
          expect((await field.boundingBox()).height).toBeGreaterThanOrEqual(48);
        }
      } else expect(a.y).toBe(b.y);
    }
    await page.getByRole('button', { name: 'CLEAR DATES' }).click();
    await expect(from).toHaveValue(''); await expect(through).toHaveValue('');
    await from.fill('2026-10-21'); await through.fill('2026-10-20');
    await expect(page.locator('[data-wb=date-problem]')).toBeVisible();
    await page.getByRole('button', { name: 'CLEAR DATES' }).focus();
    await page.keyboard.press('Enter');
    await expect(from).toHaveValue(''); await expect(through).toHaveValue('');
    await card.screenshot({ path: `../../runs/mobile-date-results/${test.info().project.name}-${width}.png` });
  });
}
