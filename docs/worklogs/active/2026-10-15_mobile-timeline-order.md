# Mobile timeline order

Requested by the operator (2026-10-15): on phones the viewer's timeline should come right after the Game Boy.

Viewer-only layout change; no feature switch (feature-switch skill excludes viewer-only changes).

## M1: phone-width order

- [x] RED: `packages/viewer/src/mobile-layout.test.ts` asserts the watch-deck structure and the phone rule. COMMIT: `test: phone-width viewer puts the timeline right under the Game Boy` (2d48ba9)
- [x] GREEN: below 700px `.watch-deck` is a flex column, `.game-stream` is `display:contents`, and `.side` gets `order:1`, so the order is objective, Game Boy, timeline, live panel. Desktop grid unchanged (checked at 1280px).
  - Viewer: 50 files, 649 tests pass; coverage 95.36 lines / 91.13 branches / 94.38 functions; tsc + eslint clean.
- [x] Browser proof at 390px against the live 8790 page with the candidate rule injected client-side (no second server, finals undisturbed): before gba 436 → side 732 → timeline 1274; after gba 436 → timeline 728 → side 1012. Screenshots: `runs/mobile-timeline-order/{before,after}-390px.jpg`.
- [ ] Review: Claude CLI + Grok
- [ ] the operator approves merge; rebase onto main; restart 8790 without touching runs
