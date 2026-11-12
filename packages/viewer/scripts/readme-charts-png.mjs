// Render each README chart page (docs/images/charts/*.html, written by `just readme-charts`)
// to its PNG under docs/images/ at 2x, from the page's #c card. Run from the repo root through
// the viewer package so @playwright/test resolves: see the readme-charts recipe in the justfile.
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? ".");
const pages = ["badges-over-time", "badges-for-the-money", "badges-over-time-dark", "badges-for-the-money-dark"];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 900 } });
  for (const name of pages) {
    await page.goto(pathToFileURL(resolve(root, `docs/images/charts/${name}.html`)).href);
    await page.locator("#c").screenshot({ path: resolve(root, `docs/images/${name}.png`) });
    console.log(`wrote docs/images/${name}.png`);
  }
} finally {
  await browser.close();
}
