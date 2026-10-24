# Player elevation readout

## Approved outcome

Human the operator message [private message reference] at 2026-10-24T14:46:42Z says "yes" to adding own-player elevation to the Position line each turn as a new bundle-only switch landing before long runs. Independently verified server-copied quote in Claude history 00000000-0000-4000-8000-1bb4e739f4f4.jsonl:14316/14319. Full brief: runs/briefs/player-elevation-readout-v1.md. No new launch authorization is needed or requested.

## Frozen scope

New `player-elevation-readout-v1`, default OFF, seven current bundle definitions ON and controls unchanged. Append verified `GameState.player_elevation` to the existing Position line, with a factual rule only when the known current tile has elevation15 or0. Exact example: `Position: X=17, Y=69, facing up, elevation 3, on a tile that accepts any elevation (15)`. No bridge/beach/location interpretation, automatic route/action, planner/collision changes, new tool, GPU/inference/probe/live-run/schedule/loop/Mac mutation or desktop focus. Existing live-player-position switch still owns whether the Position line exists. Missing/unready world position cannot acquire invented elevation. Tile fact uses the known tile at the player's coordinates, never an adjacent tile or another object's height.

Production owner path set: existing server readout.py for formatting; existing feature registry, preset schema/defaults and viewer default/card mapping; seven evolving fixed JSON definitions; tests/explainer. No new state field, memory owner, persistence, public API, source pin rewrite or protected trainer-card change. Considered system prompt: no tool changes; the Position suffix states the rule at the observation seam, so no redundant prompt guidance is required.

## Evidence

Native reference `/Users/user/dev/pokeemerald`, clean SHA731ad5bfd6e6f265508d0efcca0ba42f9dcf5881; include/global.fieldmap.h ObjectEvent currentElevation low nibble0x0B; event_object_movement.c IsElevationMismatchAt exempts tile0/15 and player0. Existing reader validates active player identity and save pointers before position/elevation; no decoder change planned. Exact run0d5d state127085/raw21932 SHA2561498a086a25af5a6ade4bf80ee5a65e1767fc414368ecefb822b6b188eadbd86; player17,69 height3, own tile15. Reparse through production reader with external matching ROM; no emulator or live input.

## Invariants and tests

1. OFF exact old readout bytes; no system prompt/tool/plan change.
2. ON adds current player elevation to every existing verified Position line, even without another level on screen.
3. Only known own-tile0/15 appends its numeric accept-any-level rule; ordinary, missing and adjacent tiles do not.
4. Existing Position OFF and unknown/unready position suppress the new suffix; no plausible default treated as native evidence.
5. Registry, server env/defaults, optional historical preset normalization, metadata, seven bundle/control arms and exact explainer link agree.
6. Production reader/render factory on native0d5d reproduces exact expected line; wiring/format/tile operands are deleted one at a time, intended failures observed, restored.

## Milestones

- [x] RED exact readout and production feature-wiring tests, committed failing
- [x] GREEN minimal formatter and registered switch, exact OFF parity
- [ ] Tracked themed explainer, native rerender/delivery/recorded replay proof; absolute headless only
- [ ] Normal build/test/coverage/lint/vendor and protected trainer-card checks; no timeout/worker/retry/skip suppression
- [ ] Full principles self-review and frozen independent cloud review with verified standing Grok outage procedure if needed
- [ ] Board #1 actual thread, FF landing, default main tests, one evidence-only worklog commit, serialized viewer refresh and served/process proof

## Evaluation and coordination

Deterministic factual readout repair; no gameplay benefit claimed or comparison launched. Required native state is already retained; no story milestone prerequisite. Sixth long-run prerequisite, separate from approval to launch runs. Coordinate finite heavy CPU slot only once ready; current Item2 owns broad absolute-prefix test seam, do not duplicate it. Protected trainer cards and baseline assertions remain unchanged. Canonical main/viewer untouched until ready board admission.

## Session log

- Start from clean main b8911c90e26e6acc399827e218c6ac97cc2d4e36. New managed isolated worktree player-elevation-readout-v1; branch codex/player-elevation-readout-v1. Read current repo/global/skill rules, approved brief and actual human provenance. No heavy tests yet.

## Review and principles

Pending implementation qualification. No external review dispatched.

## Archive

- [ ] Human approval required before archive.

- RED: native fixture and focused regression committed before production changes. Python: 11 intended suffix/default failures, 3 passes. Agent: 2 intended registry/environment failures, 1 parity pass. Receipts runs/reviews/player-elevation-readout-v1/red-{python,ts}.log. Fixture is 34 RAM-only windows (56,372 bytes), uses an external identity-checked ROM; no ROM bytes or live execution. COMMIT: `test: freeze player elevation readout regression` (fa89027f3).

- GREEN implementation: existing readout formatter adds own current elevation and only matching known tile0/15. Existing pregame/field-transition/invalid-position early returns already exclude invented height. No reader/state/observation/API/tool/prompt/planner changes. Registered server switch, historical/next-run defaultOFF, metadata, exact card and seven bundle/control definitions wired.
- Focused: 14 new native/readout tests; registry+new observation 30/30; pinned-pi observation→next request→RunRecorder exact-text arms 2/2 (new agent suite total5); normalized bundles/default/card9 selected pass. Focused selection is not a full-suite gate. Old Python assertions now explicitly retain historical switchOFF or assert the new all-on Position; default server count83.
- Seven operand deletions/restorations: suffix, own-tile coordinate comparison, tile0, tile15, current-versus-previous nibble, metadata and server-env. All intended RED then restored GREEN in mutation-v2-*.log and mutation-v2-receipts.json. Earlier own-tile attempt unexpectedly passed because same-length Python source changed/restored within the timestamp-cache interval; retained original passing receipt as unproven, then removed only own targeted private pyc on each mutation before qualification. No test suppression.
- Shared registry seam: reused only exact positive-prefix numeric replacements from Item2 f3cc8b023d201f49657ace0f1ea3ed8bceb50716/a2fc732cd21240a2d1a79d380b4306b884a75991, not owner worklog/production/whiteout flag. 118 numeric lines/81 file-commit entries, receipts prefix-reuse.json. Own new SERVER_FEATURES append also made historical end-relative checks unstable; retained their fixed old prefix positions from length82 as absolute indices, expected IDs/ordered slices unchanged. Legacy helper/new-server-OFF expectations updated explicitly. No broad assertion replacement or protected trainer-card changes. Integration will prefer actual main once Item2 lands.
- Explainer themed/checked; standalone8791 page returns200, all six1280/1440/375 collapsed/expanded screenshots captured and inspected through background image tools. Fixed a real expanded-phone source-SHA overflow, reran all six with no page overflow/errors. Wide diagram scrolls inside its own frame. Proof runs/mockups/player-elevation-readout-v1/shots. No foreground app/tab/desktop input.
- Full build/test/coverage/lint/vendor, protected-card check, native full-archive independent receipt and scratch-viewer click/replay are pending. No full gate/review/landing readiness claimed.

- Scope correction from coordinator: the eighth glm53-flash-4h recipe request was an agent relay with human provenance still pending. Draft commit ddcfbcc27031edbe992b8ac1224db4fae777e7ed has been reverted before any review/landing; retained only as ignored eighth-recipe-draft.patch. Frozen scope remains the explicitly approved seven. No activation or main mutation occurred. COMMIT GREEN 2d5a7bc8aecdbd9ba8a7d4091455e1505e89cb56. Native full-archive proof confirms old OFF bytes and only Position suffix changes; paired native screenshot SHA256 f3c465918d14a84e64e2813e666f851c9297b2fa6d9b0b5fe2309b5f63dcb7a8 matches raw observations index and was visually inspected. Source remains defaultOFF with seven bundle recipesON/controlOFF; full gates, review and landing pending.
