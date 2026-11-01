# Viewer boot: defer workbench until needed

**Started:** 2026-10-31
**Status:** Active; operator authorized investigation + deferral

## Problem Statement

After `viewer-main`, cold start does real catalog work: full `/api/workbench` is ~26 MB / 779 runs, and the live index page still eager-fetches `/api/cards` on the first current snapshot and every `WORKBENCH_POLL_MS`. Live watching already has current projector data for frames, stats and trainer cards. Workbench enrichment should wait until Comparisons / splits / incomplete-card recovery need it.

## Skills Loaded

- close-the-loop, viewer-e2e (browser focus boundary), feature-worklog (bounded)

## Architecture

- `snapshotFirst` / current path paints from `/api/current-runs` + `/current` only at boot.
- `/api/cards` (and therefore workbench reduction for the selected/live set) loads only when enrichment is wanted: incomplete current reconstruction, splits page open, or ended/replay selection.
- Full `/api/workbench` stays the comparisons / workbench.html path; the live index never fetches it.
- Frontier grading remains deferred until the splits page (existing behavior).

## Invariants

- INV-1: A complete live current selection must not request `/api/cards` (or `/api/workbench`) before enrichment is needed.
- INV-2: Incomplete current reconstruction still loads cards for the guarded last-known trainer card.
- INV-3: Opening the splits page still loads cards (recorded splits) and frontier as today.
- INV-4: Trainer-card GPU allocation among live/paused peers still works from the current-synthesized workbench without the historical stub catalog.

## Security Review

No new network surface; only delays an existing read-only loopback fetch. No ROM or credential paths involved.

## Milestones

**M1 — Source: defer cards on current boot**
- [x] RED: complete live mount does not hit `/api/cards`; splits open or incomplete does
- [x] GREEN: gate `loadWorkbench` / `pollCards` for the current path
- [x] Focused viewer tests (`app-current` 24 passed)
- [ ] Land + `just viewer-main` proof that live HyperQwen paints without cold workbench churn

## Closing the Loop

- Focused vitest for the deferral contract.
- After land: `just viewer-main`, confirm live frame/stats without a boot-time `/api/workbench` or eager cards storm; open splits and confirm cards/frontier then load.

## Session Log

- 2026-10-31: operator flagged sus startup work; measured current ~0.4 MB vs workbench ~26 MB; authorized deferral.
- 2026-10-31: source on `5ff236595`; focused suites 144 passed; eslint void-expression fix pending commit.
- 2026-10-31: operator "go for it" → land + `just viewer-main` authorized (operator-directed land; board slot held).

## Surprises

- `/api/cards?run=` still returns ~550 experiment stubs (~196 KB). Cheaper than full workbench, but `loader.current` still starts background log reduction on cache miss, so eager cards at boot are still real work.
- Live GPU trainer allocation only peers with other live/paused cards, which current already supplies.

## Multi-Model Review Log

(none yet)

## Boy Scout Log

(none yet)

## Archive Milestone

(operator-gated)
