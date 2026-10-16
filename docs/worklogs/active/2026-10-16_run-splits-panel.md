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
- [ ] GREEN
- [ ] Gates: viewer coverage ≥90, lint, build
- [ ] Review: Claude CLI, Codex, Cursor grok
- [ ] Operator approves local merge
