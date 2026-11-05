# Viewer: auto-updates keep the reader's place

Branch `claude/viewer-scroll-steady`, worktree `/private/tmp/pb-scroll-steady`, based on main 5deb07ba4.
Viewer-only presentation fix, so no feature switch (the feature-switch skill excludes viewer-only changes).

## Report

The operator: something in the viewer moves the scroll position, maybe the new PokéNav splits UI. Fix it and add a skill so auto-updating UI never moves the screen.

## Cause

The 2026-10-25 fixes (`viewer-scroll-refresh`, `viewer-refresh-scroll-audit`) covered focus and pane `scrollTop`. The splits race came later. Its list is newest first and is rebuilt with innerHTML, so a new milestone adds a row above the reader while `scrollTop` stays the same number. Chromium's scroll anchoring cannot help because the anchor node is replaced, and Safari has none.

Headless reproduction on live 8790, six client-side injected `/api/cards` splits, reader mid-list, tracked row: moved 235px desktop and 308px phone in Chromium, 235px and 307px in WebKit.

## Scope

- [x] `steady-scroll.ts`: read the first visible keyed row, put it back after the redraw, restore focus with preventScroll.
- [x] Race rows and controls carry `data-keep` and `data-focus`; renderRace redraws through the helper.
- [x] A same-run refresh never blanks a painted race or resets its filter and folds.
- [x] Repo skill for auto-updating UI, linked from CLAUDE.md.
- [ ] Browser proof, gates, review, landing, viewer refresh, live proof.

## Log

COMMIT: `test(viewer): a redraw keeps the reader's row and focus` (e3c0c3045). RED: the helper does not exist.
GREEN: focused steady-scroll, splits-race, splits-race-honest and run-splits tests, 58 passed; viewer tsc and eslint pass on changed files.
Candidate browser proof: the three changed client modules routed from this branch's dist onto live 8790, same injected splits, rows grew by 6. Tracked row moved 0px Chromium desktop, 1px Chromium phone, 0px WebKit desktop, 0px WebKit phone (was 235, 308, 235, 307).
Ten-minute untouched probes on live 8790 saw real splits land (pane height +97 phone) and the document never moved, so the jump lives in the pane.
