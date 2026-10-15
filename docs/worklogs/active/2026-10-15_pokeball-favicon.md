# Poké Ball favicon (2026-10-15)

Operator request (via coordinator): every viewer page, the stats/comparisons page included, shows a Poké Ball favicon. Local SVG only, no internet assets. Tiny UI change, so no mockup round. Viewer-only: no feature switch (nothing the model sees changes) and no explainer (not a harness feature). Branch `claude/pokeball-favicon`, worktree `/private/tmp/pokebench-favicon`. Local only. Do not restart 8790 (the finals runner lives in that process).

## M1 · Poké Ball favicon

- [x] RED: every static HTML page links `/favicon.svg`; the server serves the local Poké Ball SVG as `image/svg+xml` at `/favicon.svg` and `/favicon.ico` (pages without the link, such as explainers, still get it).
  COMMIT: `test(viewer): every page gets the local Poké Ball favicon` (48f8c66)
- [x] GREEN: `packages/viewer/static/favicon.svg`, link tags, server routes.
  COMMIT: `feat(viewer): Poké Ball favicon on every page` (d075b8f)
- [x] Gates: viewer vitest 647 passed (after a viewer build in the fresh worktree); coverage 95.34 lines / 91.15 branches / 94.35 functions; tsc + eslint clean.
- [x] Browser check on an isolated test server (127.0.0.1:8818, startViewer with no queue/autorun, empty runs root; not 8790): /favicon.svg and /favicon.ico both 200 image/svg+xml; /, /comparisons and /play each carry the icon link and their titles (PokeBench Viewer, PokeBench · Runs & Comparisons, PokeBench · Human Play); in the in-app browser /comparisons resolved the link to http://127.0.0.1:8818/favicon.svg and the image decoded; headless Chrome rendered the icon fetched from 8818 at 16/32/128px beside those three titles. Grabbing the real Chrome tab strip needed screen access, which was declined, so the screenshot is a rendered tab strip using the live icon, not a capture of Chrome's own UI.
- [x] Review: Claude + Grok.
  Round 1 (diff e0a0552..d075b8f, sha256 99a0b2c666dea0ee89f0c10bf924044b5d896d5c62b35e4a34874098edfa9694): Claude CLI LGTM. Grok (cursor-grok-4.5-high) BLOCKING: PB13 scored PASS while the browser box was unchecked. Fixed: browser check recorded above; test uses fileURLToPath (Claude hardening note): `test(viewer): record the favicon browser check; resolve the static dir with fileURLToPath` (2c8b1d1).
  Round 2 (fix delta d075b8f..2c8b1d1, sha256 70e1e1a6b80d21bbf70b07b8cf3ab99edb956fefff7de6c5360fd42631be48b8): Claude CLI LGTM, Grok LGTM.
- [ ] Operator approval, local merge into main. 8790 not restarted.
