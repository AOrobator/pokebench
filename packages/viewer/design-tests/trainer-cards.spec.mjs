/* global document, fetch */
import { test, expect } from '@playwright/test';

const fixture = `<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body style="margin:0;background:#1e2c44"><header class="bar"><div class="run-cards" data-ui="run-cards"></div></header><div class="rs-cards" hidden></div></body></html>`;

for (const width of [1280, 1440, 375]) {
  test(`approved cards at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.route('**/approved-card-fixture', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    await page.goto('/approved-card-fixture');
    await page.evaluate(async width => {
      const { cardHtml, cardInputFor } = await import('/app/trainer-card.js');
      const { loadCardArt, fillCards, browserGlyphSheet, drawGlyphs } = await import('/app/card-dom.js');
      const loaded = await loadCardArt(url => fetch(url).then(r => r.json()), browserGlyphSheet(document));
      if (!loaded?.font || !loaded.glyphs) throw Error('Approved font/art did not load');
      const experiment = (arm, trial) => ({ id: 'whole-map-pair-1h-v8', arm, trial, of: 4 });
      const facts = (level, fresh) => ({ live: true, elapsed: 4_159_000, reached: { label: 'Wally tutorial' }, level, total: 48, recovered: false, fresh, cap: 7_200_000 });
      const runs = [
        { id: 'reference-flash', model: 'glm5.3-flash-2h', experiment: null, card: { name: 'BRENDEN', location: 'LITTLEROOT TOWN BRENDANS HOUSE 2F', party: [] } },
        { id: 'reference-bundle-gpu1', model: 'Qwen', experiment: experiment('bundle', 1), card: { name: 'DREDDEN', location: 'PETALBURG CITY', party: [{ speciesId: 280, level: 8, egg: false }] } },
        { id: 'reference-control-gpu0', model: 'Qwen', experiment: experiment('control', 2), card: { name: 'JOHNNY', location: 'LITTLEROOT TOWN', party: [{ speciesId: 280, level: 5, egg: false }] } },
      ];
      // Exercise production identity projection, then freeze only clock/milestone state.
      const completeRuns = runs.map(run => ({ status: "live", splits: [], config: null, elapsedMs: 0, ...run }));
      const inputs = completeRuns.map((run, i) => ({ ...cardInputFor(run, 0, 0, i === 1 ? 'watching' : 'live', completeRuns, loaded.art), facts: facts(i === 0 ? 5 : 36, i === 0) }));
      const row = document.querySelector(width === 375 ? '.rs-cards' : '.run-cards');
      if (width === 375) { document.documentElement.dataset.phone = ''; row.hidden = false; }
      row.innerHTML = inputs.map(input => cardHtml(input, loaded.art, 'wide')).join('');
      fillCards([row], inputs, loaded, drawGlyphs);
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    }, width);
    const row = page.locator(width === 375 ? '.rs-cards' : '.run-cards');
    await expect(row.locator('.tc')).toHaveCount(3);
    await expect(row.locator('.tc-mon')).toHaveCount(2);
    await expect(row.locator('[data-gt="whole-map-pair-1h-v8"]')).toHaveCount(2);
    await expect(row.locator('.tc-ty')).toHaveText(['TYPE/BUNDLE', 'TYPE/CONTROL']);
    await expect(row).toContainText('trial 1/4');
    await expect(row).toContainText('trial 2/4');
    await expect(row).toHaveScreenshot(`cards-${width}.png`, { animations: 'disabled', maxDiffPixels: 0 });
  });
}
