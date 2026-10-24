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
- [ ] GREEN minimal formatter and registered switch, exact OFF parity
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

- RED: native fixture and focused regression committed before production changes. Python: 11 intended suffix/default failures, 3 passes. Agent: 2 intended registry/environment failures, 1 parity pass. Receipts runs/reviews/player-elevation-readout-v1/red-{python,ts}.log. Fixture is 34 RAM-only windows (56,372 bytes), uses an external identity-checked ROM; no ROM bytes or live execution. COMMIT: `test: freeze player elevation readout regression` (SHA in next log update).
