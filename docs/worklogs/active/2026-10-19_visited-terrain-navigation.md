# Visited terrain navigation

Authorized by the operator on 2026-10-19: implement a feature-switched treatment that remembers only terrain delivered to the gameplay model, exposes a stitched known-terrain map, and lets `navigate_to` plan over those known cells. Work stays on `codex/visited-terrain-navigation`; no landing, viewer restart, experiment approval, or gameplay launch is authorized.

## Invariants

- OFF is byte-for-byte the incumbent tool list, descriptions, results, and local planner behavior.
- ON never learns a cell merely because an internal state read or hidden `navigate_to` press returned it. A cell enters memory only when the enclosing tool result is delivered to the model.
- Memory is keyed by map id and begins empty on every process/run. Loading an emulator checkpoint does not synthesize harness history.
- Current delivered terrain replaces stale terrain at the same coordinate. Dynamic people/objects come only from the current snapshot; remembered geometry never preserves stale object positions.
- The game source grounding is pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`: live map collision/elevation is owned by `fieldmap.c` and object collision/elevation by `event_object_movement.c`. The treatment stores PokeBench observations of those facts; it does not read unseen source/map cells.

## M1 — Memory and planner semantics

- [x] RED tests cover map-keyed accumulation, overwrite, unknown cells, no hidden-read ingestion, current dynamic object override, run/checkpoint reset, and navigation across multiple delivered windows. `runs/visited-terrain-navigation/m1-red.log`: expected module-not-found failure before production implementation.
- [x] GREEN production module renders bounded stitched terrain and supplies planner geometry made only from remembered cells. Focused suite: 133 passed; typecheck passed (`runs/visited-terrain-navigation/focused.log`, `types.log`).
- [x] Record a wiring-deletion RED receipt and restore production wiring. Removing `withVisitedTerrain` made the production-factory assertion fail on the absent map; restored test passed (`wiring-deletion-red.log`, `wiring-restored-green.log`).

## M2 — Feature wiring

- [x] Register `visited-terrain-navigation-v1` in append-only feature order, default OFF, needing bounded navigation.
- [x] Wire through the production factory without environment/global reads; whole-map navigation takes precedence if both switches are selected.
- [x] Prove OFF identity and ON tool/result/planner behavior at the factory seam. OFF preserved the exact single text result; ON appended the stitched map and changed the planner description; both-ON kept whole-map behavior.

## M3 — Operator surfaces and pending experiment

- [x] Add a self-contained tracked explainer, index entry, Harness Config mapping, serving/card tests, and `pages-check` receipt. The tracked page passed `just pages-check`; the real Harness Config was not restarted or opened because a live run was in progress.
- [x] Add a pending experiment with no queue position or approval, plus a readiness entry. `just experiments-check` passed all 118 definitions. Its provisional source commit must be repinned to the eventual merge SHA by the landing owner.
- [x] Run focused tests, full test, coverage (90% line/branch/function floors), lint, build, vendor verification, and `git diff --check`.
- [x] Commit the isolated branch for handoff. Review approval, landing, live Harness Config proof, and experiment launch remain explicitly not done.

## Follow-on, outside this switch

The concurrent whole-map probe showed visibly heavy deliberation while a complete map remained in every model turn. That is motivation for a separate design, not evidence about this treatment: keep the normal observation compact, add explicit on-demand `inspect_map` / `plan_route` access to local plus visited terrain, and have the loop supervisor recommend or attach that view once after a threshold instead of persistently emitting a full map. This branch deliberately does not add those tools or change its approved scope.

## Post-review synchronization

- Merged current `main` at `a7be38f6`, preserving its automatic-running bundle worklog, fixed definition, derived pending experiment, and tests. The visited-terrain pending incumbent now follows that bundle promotion with `automatic-running-v1` ON; the treatment still flips only `visited-terrain-navigation-v1`.
- RED: the four ledge behaviors rendered `v^<>` instead of the authoritative `><^v` from `tile-rules.ts` and the live-map reader. GREEN: the stitched renderer now imports the shared `LEDGES` directions and covers east, west, north, and south.
- RED: remembered cells synthesized a non-null grid with elevation 0 when the live grid was unavailable. GREEN: visited navigation preserves `navigation_grid: null` and cannot plan until a current live grid exists.
- RED: the system prompt described visited navigation as the eight-attempt local planner. GREEN: visited-only wording now declares stitched shown terrain, unknown-cell exclusion, result-delivery timing, re-planning, and the 512-command bound; whole-map wording takes precedence when both switches are ON. The navigate-first section has the same three-way precedence.

## Evidence

- Source checkout: `/Users/user/dev/pokeemerald`, clean at `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` on 2026-10-19.
- RED specification commit: `890d7e91675c2c4ee7da5d287614c253d08ece45`; production implementation commit: `f2384d6bb3edde7d8739732ba1852e7f9d0fdf29`.
- Initial feature-complete tests, docs, experiment, and gate-fix commit: `53de6d83a649568e4c847135196f929d20fd9e35`.
- Main-sync and reviewer-fix commit: `edf51e0e9b81f7761a79500d750213c76ef1e238`; the repinned pending experiment names this feature-complete parent so the final pin-only commit does not create a self-reference.
- Post-sync full tests: agent 2,538 passed; viewer 1,197 passed; environment 2,480 passed and 229 ROM-dependent tests skipped because `POKEBENCH_ROM` was unset.
- Post-sync coverage: agent statements 97.88%, branches 94.04%, functions 98.25%, lines 99.25%; viewer statements 95.43%, branches 91.49%, functions 93.88%, lines 97.65%; environment lines 97.47%, branches 93.37%, functions 99.43%. All suites and all 90% floors passed.
- Post-sync `just lint`, `just build`, `just verify-vendor`, `just experiments-check`, explainer `pages-check`, and `git diff --check` passed. The isolated worktree used the canonical checkout's unchanged mGBA Python binding for strict mypy, matching established worktree practice; no gameplay process or canonical file was changed. Vendor was clean at `bbab97ad73e460b7cd7c08527d10ced30cc03fbe`.
- Focused test and deletion receipts are under ignored `runs/visited-terrain-navigation/`.
