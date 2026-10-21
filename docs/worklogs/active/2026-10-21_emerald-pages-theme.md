# Emerald page theme for explainers, reports and reviews

Requested by the operator, 2026-10-21 (thread "Get a local model to catch rayquaza via pokeagent"): explainer pages need to be Pokémon themed, skills must make that the default, and the PokéNav top of the sample looked glitchy.

## Scope
- `docs/design/emerald-pages.css`: viewer PokéNav look (striped viewer blue, navy POKéBENCH bar, red PokéNav device around `main`, pixel-font headings, Emerald text window frame 1 cards from `graphics/text_window/1.png` palette). No ROM art is committed: frames are CSS, colours only.
- `just pages-theme <files>` (`scripts/pages.sh theme`): inlines the stylesheet with Press Start 2P as a data URI, pins the light palette (rewrites `prefers-color-scheme` queries), wraps `<main>` around main-less pages, idempotent.
- Applied to `docs/explainers/*.html` and `docs/experiments/*.html`; text unchanged.
- CLAUDE.md "Explainers" plus feature-explainer, run-analysis, pokebench-review, pokebench-experiment-design and close-the-loop skills make the theme the default.

## Milestones
- [x] M1 sample (runs/mockups/emerald-pages) sent; PokéNav top glitch fixed (one device shape drawn behind `main`, body isolated)
- [x] M2 stylesheet, `pages-theme`, skills, applied to 171 tracked pages
- [ ] M3 review loop (Claude, Grok, GPT lanes), land ff-only on main, theme the four 2026-10-21 reports in runs/reports

## Commits
- COMMIT: `feat(pages): Emerald PokéNav theme for explainers and experiment pages` (4de1aab73)
- COMMIT: `fix(pages): pixel table headers keep whole words on phones` (ef221f0e9)
- Next: env/tests/tooling/test_pages_theme.py (4 tests) for `pages.sh theme`; breaking the block insert or the colour-scheme rewrite fails a test.
- Earlier: pixel table headers no longer break letter by letter on phones (seen in the GLM report's splits table at 375); `pre` scrolls inside the screen.

## Evidence
- All 171 pages at 1280×800 and 375×812 in Chrome: 0 external requests, `<main>` count 1, h1 inside main; only `offscreen-objects-v1.html` scrolls sideways, which it already did before the theme (643px unthemed).
- `just pages-check` on all 171 pages prints nothing; re-running `pages-theme` is byte-identical.
- `pnpm -r test`: agent 3281/3281; viewer 1601/1602, the one failure (`experiment-cli.test.ts` production host pin) passes alone (11/11) and touches nothing changed here.
- Four 2026-10-21 reports themed in runs/reports (not tracked): text identical to the pre-theme copies apart from the style block and colour-scheme queries; 0 requests and 0 page overflow at 1280, 1440 and 375.
