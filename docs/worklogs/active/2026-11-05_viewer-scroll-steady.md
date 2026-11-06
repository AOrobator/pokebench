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
COMMIT: `fix(viewer): auto-updates keep the reader's place on the splits page` (981c1c1ce). GREEN.

## Gates

On 981c1c1ce, under the START window: build passes; `just test` passes with agent 2565, viewer 1000, env 2936, gateway 38, no-I/O proof OK. `pnpm -r lint` and ruff pass. Env mypy and `just verify-vendor` fail in this worktree only, on the absent native mGBA binding and uninitialized submodule; both pass on main, and this diff touches nothing under env/ or scripts/.

## Principles Adherence

| ID | Score | Evidence |
|---|---|---|
| PB1 | N/A | No grading change; the race reads the same milestones. |
| PB2 | PASS | No run is filtered or hidden; only where the page sits changes. |
| PB3 | N/A | UI correctness, no model benefit claim. |
| PB4 | N/A | Viewer only; nothing reaches the model. |
| PB5 | PASS | One defect class: redraws moving the reader on the splits page. |
| PB6 | N/A | No context or long-run behavior change. |
| PB7 | PASS | Recordings read-only; proof injects inside the test browser only. |
| PB8 | N/A | No model tools or retries. |
| PB9 | PASS | Reproduced in Chromium and WebKit before the fix; numbers above. |
| PB10 | PASS | No floor, exclude, guard or baseline change. |
| PB11 | PASS | Scroll behavior measured in the real engines, not assumed. |
| PB12 | N/A | No ROM or protected-folder access. |
| PB13 | PASS | RED, GREEN, browser proof, review, landing and live proof tracked here. |

## Multi-Model Review Log

Round 1 on dfd1be8fc, diff SHA-256 7405cc12…. Default Claude login expired, so the Claude lane ran under `~/.claude-review`: BLOCKING. GPT via Codex gpt-5.6-sol: BLOCKING. Fallback reviewer: BLOCKING.
Triage. FIX: earning a badge folded the leg being read (`openLegs`). FIX: a reader at the top was pushed down, including first open, and an anchor below the fold could move the page (`readPlace` holds nothing at the top or below the fold). FIX: a removed run's race stayed up (mode idle clears it). FIX: skill rule 4 wording. FIX, after the badge browser check moved a row 51px: list rows now outrank panels above them (`data-keep-box`), so the earlier rebuttal of that limit is withdrawn.
Round 1 browser proof on the fixes, candidate modules on live 8790: six new splits with the reader mid-list moved the tracked row 0 to 1px in both engines at both sizes. First open stayed at scrollTop 0 for 22s in every case. KNUCKLE_BADGE landing with the reader in the current leg kept the leg open; the tracked row moved 34 to 37px at most, one row, because the new row lands below the held row in that leg.
Round 2 on e45ad1a53, delta from dfd1be8fc. Claude under `~/.claude-review`: BLOCKING, a removed run's race stays up while indexing. GPT: BLOCKING, a row inside a pane but below the screen could anchor. Both fixed in the next commit: the fold is the lower of pane and screen, and the race clears when the run has left the list. Round cap reached, so landing waits for the operator.
