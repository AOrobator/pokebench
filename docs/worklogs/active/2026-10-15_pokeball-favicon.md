# Poké Ball favicon (2026-10-15)

Operator request (via coordinator): every viewer page, the stats/comparisons page included, shows a Poké Ball favicon. Local SVG only, no internet assets. Tiny UI change, so no mockup round. Viewer-only: no feature switch (nothing the model sees changes) and no explainer (not a harness feature). Branch `claude/pokeball-favicon`, worktree `/private/tmp/pokebench-favicon`. Local only. Do not restart 8790 (the finals runner lives in that process).

## M1 · Poké Ball favicon

- [x] RED: every static HTML page links `/favicon.svg`; the server serves the local Poké Ball SVG as `image/svg+xml` at `/favicon.svg` and `/favicon.ico` (pages without the link, such as explainers, still get it).
  COMMIT: `test(viewer): every page gets the local Poké Ball favicon` (RED_SHA)
- [ ] GREEN: `packages/viewer/static/favicon.svg`, link tags, server routes.
- [ ] Gates: viewer vitest, coverage ≥90, tsc + eslint.
- [ ] Browser check on an isolated test server (not 8790): tab shows the Poké Ball on /, /comparisons and /play.
- [ ] Review: Claude + Grok.
- [ ] Operator approval, local merge into main. 8790 not restarted.
