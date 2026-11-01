# Viewer boot: defer workbench until needed

**Started:** 2026-10-31
**Status:** Active; operator authorized investigation + deferral

## Problem Statement

After `viewer-main`, cold start does real catalog work: full `/api/workbench` is ~26 MB / 779 runs, and the live index page still eager-fetches `/api/cards` on the first current snapshot and every `WORKBENCH_POLL_MS`. Live watching already has current projector data for frames, stats and trainer cards. Workbench enrichment should wait until Comparisons / splits / incomplete-card recovery need it.

## Skills Loaded

- close-the-loop, viewer-e2e (browser focus boundary), feature-worklog (bounded)

## Architecture

- `snapshotFirst` / current path paints frames/stats/plates from `/api/current-runs` + `/current` at boot.
- Current projector ships `splits:[]`. The always-visible watch-side strip, SPLIT TIMES VS FRONTIER, and trainer-card STORY progress need `/api/cards?run=` for the selected run, plus `/frontier` on select (not only PokéNav SPLITS).
- Full `/api/workbench` stays the comparisons / workbench.html path; the live index never fetches it.
- Until the generation-matched cards projection arrives, do not paint the projector's empty splits as "nothing reached" (hold loading / fall back to the live event stream).

## Invariants

- INV-1: The live index must not request full `/api/workbench`.
- INV-2: A selected current run loads `/api/cards?run=` and `/frontier` so watch-side splits and VS FRONTIER paint without opening PokéNav SPLITS.
- INV-3: Incomplete current reconstruction still loads cards for the guarded last-known trainer card.
- INV-4: Trainer-card GPU allocation among live/paused peers still works from the current-synthesized workbench without the historical stub catalog.
- INV-5: Story splits merge from the generation-matched cards projection even when that row has no trainer `card` yet.

## Security Review

No new network surface; only delays an existing read-only loopback fetch. No ROM or credential paths involved.

## Milestones

**M1 — Source: defer cards on current boot**
- [x] RED: complete live mount does not hit `/api/cards`; splits open or incomplete does
- [x] GREEN: gate `loadWorkbench` / `pollCards` for the current path
- [x] Focused viewer tests (`app-current` 24 passed)
- [x] Land + `just viewer-main` proof that live watching paints without cold workbench churn

**M2 — Fix: watch-side splits + frontier after M1 over-deferred**
- [x] RED/GREEN: selected current run races `/frontier` and `/api/cards?run=`; never paints empty projector splits; still skips `/api/workbench`
- [x] Focused `app-current` + `app` tests (143 passed)
- [x] Candidate proof on `:8847` (background browser): cold `#run=…hyperqwen…`, PokéNav SPLITS still false → fetched cards+frontier (no workbench), strip 55 ✔, VS FRONTIER deltas present

## Closing the Loop

- Focused vitest for the deferral + watch-side split/frontier contract.
- After land: `just viewer-main`, confirm cold selected run fetches cards+frontier (not full workbench) and paints split times vs frontier without PokéNav SPLITS.

## Session Log

- 2026-10-31: operator flagged sus startup work; measured current ~0.4 MB vs workbench ~26 MB; authorized deferral.
- 2026-10-31: source on `5ff236595`; focused suites 144 passed; eslint void-expression fix pending commit.
- 2026-10-31: operator "go for it" → land + `just viewer-main` authorized (operator-directed land; board slot held).
- Landed FF `e29d32706` on main. Post-merge `just test` passed (viewer stamp e29d327). `just viewer-main` at 2026-10-31 23:28 EDT; served tree stamp `e29d32706…`, one 8790 listener, gameplay kept running.
- Live proof (background browser, focus preserved): cold `#run=…deepseek…` → mode RUNNING, resource spy `cards=[]` `workbench=[]`; opening SPLITS then fetched `/api/cards?run=…` and `/frontier` only. Trainer cards painted from current without boot workbench.
- 2026-11-01: operator: watch-side SPLIT TIMES VS FRONTIER not loading; milestones/splits feel broken. Root cause: M1 gated cards+frontier on PokéNav SPLITS, but the watch strip is always visible and current ships `splits:[]`, so the UI painted empty progress + forever "loading the frontier run…". Oct 28 (`979ef9074`) had already deferred frontier to that PokéNav page. M2 restores select-time cards+frontier for the watch card; keeps full workbench off the live index.
- 2026-11-01: M2 source on `cursor/fix-splits-frontier-watch`; focused 143 passed; candidate viewer `http://127.0.0.1:8847/` proved cold select paints frontier deltas without PokéNav SPLITS. Live `:8790` left on `e29d327` until land + `viewer-main`.

## Surprises

- `/api/cards?run=` still returns ~550 experiment stubs (~196 KB). Cheaper than full workbench, but `loader.current` still starts background log reduction on cache miss, so eager cards at boot are still real work.
- Live GPU trainer allocation only peers with other live/paused cards, which current already supplies.
- Current projector `splits:[]` is intentional (`current-projection.ts`); recorded splits were never on the current path without cards. Deferring cards without another split source breaks the strip.

## Multi-Model Review Log

(none yet)

## Boy Scout Log

(none yet)

## Archive Milestone

(operator-gated)
