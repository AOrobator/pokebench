# same-target-no-progress-v1: repeated navigate_to to one target that keeps ending near where it began

## Problem Statement

Control run `runs/2026-10-20T16-14-34_qwen36-gpu0_a8f9` (read-only, still being written). From turn 1282 (tool_call seq 41089, 6:42 PM New York) the model called navigate_to {x:29,y:16,map_id:[24,4]} 39 times in RUSTURF TUNNEL, then {x:18,y:20} 12+ times from turn 1341. Every call ended on one of (4,7) (4,8) (4,9) (5,7) (5,8) (5,9). 18 of about 51 walks were interrupted by a wild battle (then battle_action, then navigate_to again). No loop guard fired:

- ineffective-loops-v1 needs alternating targets ending on at most 2 tiles and resets on battles;
- the deterministic loop guard's same-target check needs no movement;
- ineffective-navigation-v2 (`navigation-failure.ts`) counts only walks ending on the start tile and resets on any battle;
- duplicate-turn-collapse-v1 needs identical turns.

Only the 5-minute milestone-drought stall briefing fired (turns 1309 and 1340).

Operator approval: the coordinator relayed that the operator approved this guard on 2026-10-20 (switch `same-target-no-progress-v1`, guard, bundle arm only, default off).

## Skills Loaded

- feature-switch, agent-observability, feature-explainer, feature-worklog, experiment-queue (pending entry), close-the-loop (gates), multi-model-review (cloud lanes only).

## Architecture

- New counter `packages/agent/src/loop/same-target.ts` (`SameTargetNoProgress`), owned by `LoopCoordinator` like `NavigationFailure` is. It reads only completed calls and recorded state events.
- Target key = (map_id, x, y): navigate_to args; navigate_to_target warp/interaction tile, or an object's tile from the start state's `world_context.objects`. Connections have no tile and are not tracked.
- Episode per target, on the current map. Anchor = the player's tile when the first call began (`startState`).
- A call counts when it is not an error and ends on that map with field controls free, in a battle, or with field controls locked, at most 3 tiles (Manhattan) from the anchor. A battle state's position is the tile the battle started on.
- Kept across: battles, battle_action, presses, evolution/level-up screens, observes, calls to other targets.
- Reset all: map change (state map_id), a counted story milestone event, a story-state change (known `story` values), the target reached (navigate_to: on the tile; navigate_to_target: within 1 tile). Reset that target: a counted-shaped call ending 4 or more tiles from its anchor.
- On the 4th counted call for a target (then the 8th, 12th, ...) the coordinator opens (or rebriefs) a loop episode of kind `same_target_no_progress`. With loop-guard-supervisor-v1 the briefing is the factual note itself (it replaces the generic supervisor text); without it the generic `LOOP GUARD (...)` wrapper carries it. The episode is shielded from the generic novel-state recovery and from the 6-call window stop; it closes only on the resets above, or when a completed call leaves the player in a free field 4 or more tiles from the warned target's anchor (so an open note cannot go stale after the model walks away by presses).
- Events: `loop_guard` with kind `same_target_no_progress` (schema enum extended), evidence = first counted result seq and the current result seq. Viewer: Activity History and the raw inspector show it; `RunView` does not push it to `errors`, so the closed TIMELINE draws nothing new.

## Invariants

- INV-1 OFF is byte-identical: no counter is constructed, no new notice, the same context text. Test: a8f9 replay OFF produces no notices; existing loop tests unchanged.
- INV-2 Deterministic from recorded state only; never model text. Test: unit cases built from CompletedCall/state shapes only.
- INV-3 Every clause of the note is checked against the state. Test: evidence test asserts the a8f9 note text exactly.
- INV-4 Timeline closed: no new mark, lane, label or color. Test: viewer lanes SVG for a run with this kind has no mark for it; Activity History row present.

## Security Review

No new inputs, subprocesses, network or file access. Model-facing text quotes harness-authored result lines and recorded state only.

## Milestones

**M1 — same-target-no-progress-v1**
- [x] Write tests (unit counter cases; a8f9 evidence replay; registry; production wiring; viewer timeline/Activity History). Agent: `src/same-target-no-progress.test.ts` (18 tests; red: `./loop/same-target.js` and `playLoopGuard` do not exist). Viewer: `src/same-target-no-progress.test.ts` (1 test; red: the schema has no `same_target_no_progress` kind and the viewer has no label).
- [x] COMMIT: `test: same-target-no-progress-v1 counter, coordinator episode and a8f9 replay (RED)` (sha in next entry)
- [ ] Implement
- [ ] Gates: `just test`, `just lint`, `just build`, `just coverage` (90 floor both stacks)
- [ ] COMMIT: `feat: ... (GREEN)`
- [ ] Explainer, FEATURE_EXPLAINERS, pending experiment entry, readiness row, bundle arm
- [ ] Multi-model review loop (principles, claude -p, Grok, GPT/Codex)

## Closing the Loop

Tests for code; the explainer checked with `just pages-check`; viewer behavior by mounted tests. No runs launched (operator rule: long runs only, operator launches).

## Session Log

- 2026-10-20 ~7:05 PM ET: discovery; fixture `packages/agent/src/fixtures/same-target-a8f9.jsonl.gz` made from a8f9 seq 41060–43000 plus run_start.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog.
