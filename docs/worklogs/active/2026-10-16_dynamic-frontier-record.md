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
- [ ] Verify read-only against ~/dev/pokebench/runs (before/after), viewer tests, coverage ≥90, tsc + eslint.
