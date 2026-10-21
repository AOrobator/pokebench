# Navigation refusal v3: exploratory waypoints without immediate reversal

## Authorized outcome
The operator: "Okay, let's update and fix this switch and include the changes in the bundle." One milestone: version the shared local-window waypoint advice, enable only in future bundle treatments, retain exact OFF behavior and control configuration. No measured gameplay, experiment approval, game restarts, hidden whole-map routing, or objective selection.

## Frozen scope and production owners
Existing navigation.ts owns the local edge candidates, both ordinary-tile and person refusal wording, and a navigationTool-instance bounded record of recent refusal origins by map and coordinate goal. Track origins only when a local refusal is computed from the state read for that call; interleaved waypoint calls must not clear the original goal. Clear on map change; bound retained goals and origins. While another candidate exists, withhold previously visited refusal origins; if all are revisits, report that fact without claiming a verified route. Person and tile paths share the policy. Explain choices as exploratory, not a guaranteed route. No permanent obstacle claims based on a moving NPC. No new tool, route execution or full-map planning.

Registration owners: features.ts, play-preset.ts, next-run.ts; explainer via panels.ts; pending experiment/readiness; future bundle-v-control, bundle-cook-1h, whole-map-cook-1h definitions. New switch navigation-refusal-reasons-v3 depends on bounded-navigation-v1; it changes advice only where existing v2 or exit-reachability emits it. Existing v2 and reachability remain independently configured. Whole/visited-map paths are unchanged. No server feature/state schema change.

## Evidence
Immutable control7945 run pin ee11d5b8. State22583 / result22584 / turn764: origin15,23, occupied target15,18, recommends west8,24. State22641 / result22642 / turn766: origin8,24, same coordinate target, recommends east15,23. Eight commands each; no net progress. Original boy moves, but fixed-NPC offline reconstruction reproduces cycle. Both edge candidates8,24 and22,24 cost8 commands and Manhattan13; coordinate tie favors west. Full archived terrain shows east detour, but this patch must not give the control a global solver. Receipts in canonical runs/reports/waypoint-advice-7945/.

## Milestone
- [x] RED recorded fixture + production factory exact OFF and both ON paths, bounded/reset/independent-tool behavior, interleaved waypoint calls; commit.
- [x] GREEN minimal shared policy, default OFF registry, future bundle ON/control OFF, pending entry/explainer.
- [ ] Gates: tests, coverage >=90 each metric, lint, build, vendor, experiments/pages.
- [x] Production wiring deletion/restoration and native archive replay; existing event/model-result propagation retained.
- [ ] Frozen principles/boundary and independent cloud review (two-round cap).
- [ ] Local fast-forward landing if required lanes approve, main checks, coordinated viewer refresh and real card/explainer proof.

## Readiness and claims
Activation: PLAYER_NAME_CONFIRMED (first navigable truck field; advice can act on any local map). Readiness unproven for the new frozen configuration: pending, unqueued. Historical Woods is the regression receipt, not a claim of reliable boot reach or an experiment launch. Correctness/delivery can be proved offline; gameplay benefit remains unmeasured.

## Session
Started from main d004be2dd in isolated managed worktree. User authorizes implementation and bundle inclusion; normal landing gates apply.
- RED: five recorded-state factory checks run; legacy OFF passes, four ON checks fail because v3 is not wired. No inputs submitted. Fixture contains decoded state only, no ROM/save. Commit: test navigation refusal v3 recorded cycle (RED).
- GREEN: versioned shared policy implemented; 16 targeted tests pass, including exact legacy strings, both factory paths and recorder delivery. Native fixture independently matched archived maps/positions/objects/grids in investigation. Factory/person/tile/filter/map-reset/completion/goal-bound/origin-bound deletions each fail; restoration passes16. Receipts runs/waypoint-v3/mutations.json.
- Whole-tree coverage before final test addition: agent3104, viewer1521, Python3494 pass; agent statement/branch/function97.20/92.99/97.57; viewer95.26/91.06/94.24; Python97.21/92.85/100. Lint/build/vendor/pages pass. Source unchanged by final recorder test; full final-tip gates follow synchronization.
- Standard experiments-check reads canonical live ledgers and failed on existing malformed starter-decision-salience ledger rows. No historical record edited. Candidate definitions will be parsed independently with the production parser and schema tests; retain global failure receipt.
- Main independently landed exit-labels-v3 and pending dialogue work during implementation. Will preserve both and rerun integration checks before sealing. No game source/runtime restarted, no new measured run.
- COMMIT: feat navigation refusal v3 exploratory anti-cycle guidance (GREEN candidate).

- Main sync3b9a36b48 adds only upstream exit-label worklog evidence. Pending entry now pins complete implementation12f101515. No source change after restored mutation checks. COMMIT: pin waypoint implementation for final gates/review.

Integrated main bf0c3d48c in 574d0635a, preserving both new navigation switches and append-only registry order. Agent integration: 206 files / 3139 tests pass. Viewer stale-build failures resolved by rebuilding; historic open-goal roster excludes new switch. Pending incumbent includes the current two navigation switches. Full integrated gates and frozen cloud review remain pending.

Integrated implementation 01bd2c64 is the pending experiment source pin. This follow-up changes only its source metadata; review packet includes both commits.

Round1 Sol/Astra independently reproduced frozen88e8d831/diff2481a513 and blocked inaccurate straight-line wording (existing sort is Manhattan). Astra also found readiness paragraph lost during append conflict resolution. Corrected both, preserving selection and runtime policy. Added production-factory counterexample11,16 asserting true grid-distance qualification and unchanged west/south/east order. Round2 exact-tip review required; all prior review identities superseded.

Corrected implementation ba3db441: focused17 tests pass. Pin metadata updated; round2 covers final corrected identity. Grok round1 was interrupted as obsolete after confirmed blockers (no verdict, no approval claimed).
