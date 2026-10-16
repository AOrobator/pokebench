# Run splits panel shows every recorded milestone

Status: in progress. Viewer-only measurement display, no harness behavior change, so no feature switch.

## Problem

The live side panel's SPLITS THIS RUN strip and SPLIT TIMES VS BEST rows render the hardcoded 8-entry `BAR_MILESTONES` (`packages/viewer/src/controls.ts`), which ends at STARTER_CHOSEN. Showcase run `2026-10-16T00-34-26_qwen36-gpu1_show` recorded BIRCH_RESCUE_COMPLETE, BIRCH_STARTER_HANDOFF_COMPLETE, ROUTE_101_AFTER_HANDOFF and OLDALE_TOWN, none of which appear.

## Plan

- Splits come from the run's recorded milestones (non `present_at_start`), sorted by viewer `MILESTONE_ORDER` (unknown names after, in record order). Labels from `FRONTIER_MILESTONES`, else the name in words.
- One NEXT chip: the first frontier checkpoint after the deepest recorded milestone (present-at-start included) that the run has not reached.
- Split times use the same list. `BAR_MILESTONES` stays for the switchboard pips.

## M1

- [x] RED: controls.test.ts covers post-starter splits, unknown names, next after the deepest, resumed runs (3 failing, 12 passing)
- [x] GREEN: splitStrip/splitTimes use runSplits (recorded milestones in MILESTONE_ORDER + next frontier checkpoint). Read-only replay of the live showcase log renders 25 done chips through OLDALE, next ROUTE 103.
- [x] Gates: viewer 792 tests pass, coverage 95.10/90.45/93.59 (lines/branches/functions), controls.ts 99.38/97.04/100; viewer lint clean; pnpm -r build ok
- [ ] Review: Claude CLI, Codex, Cursor grok
  - Round 1 (cf97c308): Claude CLI LGTM; cursor-grok-4.5-high LGTM with medium finding (NEXT skipped Route 102 when a later non-checkpoint milestone was deepest); Codex failed (default model gpt-6.1-sol unsupported on ChatGPT account).
  - [x] RED for grok finding: NEXT after deepest checkpoint + name escaping (1 failing, 15 passing)
  - [x] GREEN: NEXT = first frontier checkpoint after the deepest recorded checkpoint. Viewer 793 pass, coverage 95.10/90.45/93.59, lint clean; live log replay still ends OLDALE ✔, next ROUTE 103.
- [ ] Operator approves local merge
