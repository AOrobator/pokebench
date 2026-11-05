# Viewer: auto-updates keep the reader's place

Branch `claude/viewer-scroll-steady`, worktree `/private/tmp/pb-scroll-steady`, based on main 5deb07ba4.
Viewer-only presentation fix, so no feature switch (the feature-switch skill excludes viewer-only changes).

## Report

The operator: something in the viewer moves the scroll position, maybe the new PokéNav splits UI. Fix it and add a skill so auto-updating UI never moves the screen.

## Cause

The 2026-10-25 fixes (`viewer-scroll-refresh`, `viewer-refresh-scroll-audit`) covered focus and pane `scrollTop`. The splits race came later. Its list is newest first and is rebuilt with innerHTML, so a new milestone adds a row above the reader while `scrollTop` stays the same number. Chromium's scroll anchoring cannot help because the anchor node is replaced, and Safari has none.

Headless reproduction on live 8790, six client-side injected `/api/cards` splits, reader mid-list, tracked row: moved 235px desktop and 308px phone in Chromium, 235px and 307px in WebKit.

## Scope

- [ ] `steady-scroll.ts`: read the first visible keyed row, put it back after the redraw, restore focus with preventScroll.
- [ ] Race rows and controls carry `data-keep` and `data-focus`; renderRace redraws through the helper.
- [ ] A same-run refresh never blanks a painted race or resets its filter and folds.
- [ ] Repo skill for auto-updating UI, linked from CLAUDE.md.
- [ ] Browser proof, gates, review, landing, viewer refresh, live proof.

## Log

