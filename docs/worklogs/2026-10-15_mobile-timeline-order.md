# Mobile timeline order

Requested by the operator (2026-10-15): on phones the viewer's timeline should come right after the Game Boy.

Viewer-only layout change; no feature switch (feature-switch skill excludes viewer-only changes).

## M1: phone-width order

- [x] RED: `packages/viewer/src/mobile-layout.test.ts` asserts the watch-deck structure and the phone rule. COMMIT: `test: phone-width viewer puts the timeline right under the Game Boy` (2d48ba9)
- [x] GREEN: below 700px `.watch-deck` is a flex column, `.game-stream` is `display:contents`, and `.side` gets `order:1`, so the order is objective, Game Boy, timeline, live panel. Desktop grid unchanged (checked at 1280px).
  - Viewer: 50 files, 649 tests pass; coverage 95.36 lines / 91.13 branches / 94.38 functions; tsc + eslint clean.
- [x] Browser proof at 390px against the live 8790 page with the candidate rule injected client-side (no second server, finals undisturbed): before gba 436 → side 732 → timeline 1274; after gba 436 → timeline 728 → side 1012. Screenshots: `runs/mobile-timeline-order/{before,after}-390px.jpg`.
- [x] Review on eab2a54: Claude CLI (tools off, diff on stdin) VERDICT: LGTM; Cursor grok-4.7-high VERDICT: LGTM. Non-blocking: `order` moves paint order only, so phone keyboard order is still Game Boy, live panel, timeline; the earlier 700px rule keeps two now-inert grid declarations (left alone to avoid conflicts with parallel viewer edits); the test checks CSS text, with layout proof from the 390px browser check.
- [x] the operator approved merge (2026-10-15 15:37Z). Rebased onto e96676c (docs/skill-only delta); viewer 649 tests pass after rebase.
- [ ] Restart 8790: blocked. The finals runner lives in the 8790 process, so a restart kills the run; waits for the operator's go-ahead.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-15). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
