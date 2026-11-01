# Remove Story Frontier time-outlier filter

**Started:** 2026-11-01
**Status:** Landed on main · awaiting authorized viewer-main + browser proof
**Branch:** `cursor/remove-frontier-time-outliers` (merged `c2a1a286d`)

## Problem Statement

HIDE TIME OUTLIERS on the Story Frontier is confusing: it sits beside FRONTIER / FULL BASELINE (range zoom) but filters runs; default-ON means “ALL SELECTED RUNS” silently drops points; the global 3×P90 rule is opaque. Operator decision: strip it completely; always plot every eligible selected run.

## Skills Loaded

- `.claude/skills/feature-worklog/SKILL.md`
- `.claude/skills/execute-worklog/SKILL.md`
- `.claude/skills/close-the-loop/SKILL.md`
- `.claude/skills/viewer-e2e/SKILL.md` (activation proof)

## Architecture

Viewer-only delete. `frontierPlot` always keeps every series it already admits; workbench drops toggle state, click handler, plot-key population input, and button sync. Segmented control returns to FRONTIER / FULL BASELINE only. Legend loses the Time outliers how-to. Outlier-specific tests rewritten to assert extremes stay plotted. Historical Oct 20 worklogs stay as records.

## Invariants

- **INV-1:** Every selected eligible overlay that would plot with the old toggle OFF still plots; no hidden-by-time-outlier path remains.
- **INV-2:** FRONTIER / FULL BASELINE range behavior, references, live/paused protection, and recording coverage accounting (selected / plotted / loading / unavailable) stay unchanged except for removal of the “time outliers hidden” clause.
- **INV-3:** No harness, measurement, or feature-switch registry change.

## Security Review

Viewer UI only. No ROM, network bind, auth, or subprocess changes.

## Milestones

**M1 — Strip time-outlier filter (viewer)**
- Outcome: Story Frontier always shows every eligible selected run; no HIDE TIME OUTLIERS control.
- Paths: `packages/viewer/static/workbench.html`, `packages/viewer/src/{frontier.ts,workbench.ts,frontier-legend.ts}`, tests in `frontier.test.ts` / `frontier-workbench.test.ts`.
- Consumers: comparisons workbench Story Frontier panel.
- Non-goals: Y-axis alternatives; harness switches; rewriting archived Oct 20 worklogs; viewer-main until activation.
- Terminator: focused + applicable gates ≥90, self-review (cloud reviews waived by operator 2026-11-01), FF land, authorized `just viewer-main` + browser proof.
- [x] ASK USER: approve this worklog and start M1 — approved 2026-11-01; reviews waived; self-review required before land
- [x] Tests rewritten to assert no `[data-frontier-outliers]` / no hide path; extreme overlays always plot (combined with implementation; formal separate RED skipped under operator land-now + waived-review instruction)
- [x] Implement strip
- [x] Cheap checks: focused `frontier.test.ts` + `frontier-workbench.test.ts` + `frontier-legend.test.ts` → 65/65
- [x] Applicable gates: `just verify-vendor` OK; `just lint` pass; `just build` pass; `just test` agent 5261 + viewer 2390 + Python floors ≥90 (viewer 94.63/90.86/94.93 stmts/branches/funcs table; Python lines 97.50 / branches 93.60 / functions 99.90)
- [x] COMMIT GREEN: `feat(viewer): remove Story Frontier time-outlier filter` (`c2a1a286d`)
- [x] Independent review waived by operator 2026-11-01; self-reviewed diff before land
- [x] Landing: FF `main` at `c2a1a286d`; post-merge `just test` pass (agent 5261 / viewer 2390 / Python floors ≥90); `just land-done`
- [ ] Activation: `just viewer-main` when authorized + close-the-loop browser proof

## Closing the Loop

- Tests: focused frontier/workbench; viewer coverage floor.
- Browser: comparisons Story Frontier — button absent; extreme ended overlay plots; FRONTIER/FULL BASELINE still work. Focus-preserving per viewer-e2e.
- Post-merge: `just viewer-main` only with operator auth for served-viewer refresh.

## Session Log

- 2026-11-01: Operator confirmed always-show-everything and complete strip. Worklog drafted.
- 2026-11-01: Approved; reviews waived; self-review before land required. Branch `cursor/remove-frontier-time-outliers`; land-join #1. Stripped button, plot filter, legend, workbench state/handlers; rewritten tests. Focused 65/65. Self-review: net −46 lines; no production outlier references remain; plotKey no longer carries global population; coverage string no longer mentions outliers.
- 2026-11-01: Gates green; GREEN commit `c2a1a286d`; FF land; post-merge `just test` green; land-done. Served viewer still on prior stamp until authorized `just viewer-main`.

## Surprises

(none)

## Multi-Model Review Log

Operator waived cloud reviews 2026-11-01. Self-review of `git diff` against main: complete strip, no leftover hide path, tests assert always-plot + absent control.

## Boy Scout Log

(none)

## Archive Milestone

- [ ] ASK USER: archive when landed and live-proven
