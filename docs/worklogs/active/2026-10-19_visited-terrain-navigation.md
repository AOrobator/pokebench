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

- [ ] Add a self-contained tracked explainer, index entry, Harness Config mapping, serving/card tests, and `pages-check` receipt.
- [ ] Add a pending experiment with no queue position or approval, plus a readiness entry. Its provisional source commit must be repinned to the eventual merge SHA by the landing owner.
- [ ] Run focused tests, full test, coverage (90% line/branch/function floors), lint, build, vendor verification, and `git diff --check`.
- [ ] Commit the isolated branch and report review/landing/live proof as explicitly not done.

## Evidence

- Source checkout: `/Users/user/dev/pokeemerald`, clean at `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` on 2026-10-19.
- Test and deletion receipts will be written under ignored `runs/visited-terrain-navigation/`.
