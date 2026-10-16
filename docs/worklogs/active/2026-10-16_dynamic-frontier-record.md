# Story frontier: the agent frontier follows the data

## Problem

Operator the operator (2026-10-16 6:15 AM EDT): on the stats page story frontier, the gold "Agent frontier" line is stuck on `2026-10-15T11-08-31_think-fast_504f` although newer runs went further (overnight bundle-v-control cook runs reached Route 103 / the rival battle). The frontier should be computed from the data: furthest milestone first, then the fastest time to it, and it should move as runs progress.

Root cause: `frontierReferences` (packages/viewer/src/frontier.ts) only accepts runs with `status === "ended"` and `config.start === "boot"`. Every recent run starts from the FAST-text main-menu save (`start: "save_state"`, `resume: "MAIN_MENU"`), so none qualifies.

## Decision (default chosen by the coordinator, recorded here)

- The agent frontier is the best eligible agent run. Eligible = controller agent, not excluded, no problem, no probe/synthetic/replay feature, and a New Game start: `config.start === "boot"` OR `config.resume === "MAIN_MENU"` (the chart already plots MAIN_MENU starts as tagged New Game runs).
- Live and paused runs are eligible, ranked by their splits so far, so the gold line moves while they run.
- CLOCK_SET resumes stay ineligible: their clock starts mid-game, so times are not comparable. A test keeps a CLOCK_SET run from ever becoming the frontier.
- Rank: furthest RECORD_ORDER milestone (screenshot-evidence splits still excluded), then the smallest elapsed time to it, then id.
- The legend names the run (model and id suffix), says LIVE/PAUSED when it is still running, and keeps the main-menu-save tag. Wording no longer claims "fresh boot": the gold line is the "Agent frontier", the best New Game-start run.
- The human reference is unchanged (ended, boot start, `HUMAN_REFERENCE`).

## Milestones

- [x] RED: tests for MAIN_MENU and live eligibility, ranking, CLOCK_SET never frontier, legend label, no double-drawn live frontier, wording. 4 new tests fail as expected (21 pass). Two older assertions that encoded the old rule were relaxed: the `running` live run is no longer in the exclusion list, and the MAIN_MENU/Clock set test titles no longer say "fresh-boot record".
- [x] GREEN: frontier.ts eligibility (`frontierCandidate`: agent, recorded, boot or MAIN_MENU, ended/live/paused), screenshot-evidence splits ignored for both rank and time, human reference unchanged; a live/paused frontier run is drawn once as the gold line inside the live/paused group (glow + live head) and left out of the model-colored current set and plates; legend `Agent frontier[ · LIVE|PAUSED] · <model> · <run id>[ · from main-menu save]` with the id as title; unavailable notice and workbench.html copy say New Game start, not fresh boot. One RED assertion was corrected in GREEN: the live frontier can be several gold polyline segments (gaps at supported-but-missed checkpoints are existing behavior), so the test checks every segment is gold and each point is drawn once. Viewer 910 tests; coverage 95.33 / 91.12 / 93.64 / 97.62 (frontier.ts 99.53 / 95.15 / 100 / 100); tsc + eslint clean.
- [x] Verify read-only against ~/dev/pokebench/runs (before/after), viewer tests, coverage ≥90, tsc + eslint. Scratch script imports the built dist and calls `workbenchSnapshot` with a liveness stub that only reads `lsof` LISTEN sockets (no requests sent; viewer not started). 242 runs, 2 live (`2026-10-16T05-51-58_qwen36-gpu0_7a95`, `..._gpu1_7f38`).
  - Before (154d905e): `2026-10-15T11-08-31_think-fast_504f` (boot, ended), furthest RIVAL_HOUSE_EXITED at 23:24.372.
  - After (5e01bacf): `2026-10-16T02-23-17_qwen36-gpu1_sh02` (MAIN_MENU save, ended, Qwen3.6-35B-A3B), furthest RIVAL_BATTLE_WON at 50:46.749. Runners-up: `03-50-01_qwen36-gpu0_e588` ROUTE_103 24:58, `04-51-03_qwen36-gpu0_54a7` ROUTE_103 30:47; live `gpu0_7a95` at OLDALE_TOWN 22:20.
- [ ] Multi-model review, then operator approval to merge.

## Review fix: one source for the frontier's live state (Codex P1)

Codex (BLOCKING, log `runs/reviews/dynamic-frontier-record/codex.log`): `refs.best` comes from every stored run while its glow depended on the filtered, verified `currentRuns`. After a failed poll the glow went away but the legend still read the stale stored status and said LIVE; under a filter that excluded the frontier run it lost its glow while still saying LIVE.

Fix: `frontierPlot` takes the frontier's verified status (`"live" | "paused" | null`) as one explicit argument; the workbench passes the frontier run's status only while polling is verified, regardless of EXPERIMENT/MODEL/CONFIG filters (the gold line is a reference shown under every filter). Label and glow both read only that argument. Unverified → neither LIVE/PAUSED nor glow.

- [x] RED: frontier.test passes the status explicitly and asserts a live stored status with `null` shows no LIVE, glow, current group or plate; new workbench test: the frontier keeps LIVE + glow under a model filter that excludes it, shows PAUSED from a paused poll, and drops both after a failed poll. The existing "highlights the healthy current run inside the filter" test gains a further finished `leader` run so its live `current` run is an ordinary filtered run, not the frontier (under the new rule it would otherwise be the frontier and glow under every filter). 3 fail as expected (the zoom test fails only because the failing new test never reaches `wb.destroy()`).
- [x] GREEN: `FrontierStatus` type; `frontierPlot(..., zoom, frontierStatus = null)` drives both the legend's LIVE/PAUSED and the gold line's live/paused group and live head; the run's stored status is no longer read for either. `Workbench.renderCharts` passes `refs.best.status` only when `this.verified` and it is live/paused, independent of filters. Viewer 911 tests; coverage 95.32 / 91.12 / 93.63 / 97.62 (frontier.ts 99.52 / 95.08 / 100 / 100); tsc + eslint clean.
- [ ] Re-review (Codex, grok, Claude), then operator approval to merge.
- [x] Reviews: full branch Codex BLOCKING (stale LIVE) then fixed; grok and Claude LGTM; delta 23e32094..49a95064 Codex, grok and Claude `VERDICT: LGTM`. Merging to main 2026-10-16 6:42 AM EDT.
