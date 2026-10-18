# Worklog: battle-menu-loop-v1

Branch `claude/battle-menu-loop`, base main 44c42815. Local only: no push, no PR, no remote. The operator asked to improve the loop guard, put the fix on the bundle arm, review it, and land it on main.

## Problem Statement

Control run `2026-10-17T19-38-19_qwen36-gpu1_a1b1` (bundle-v-control-dryrun-cook, trial 1) spent turns 961–1128 (seq 26192–29641, 8.9 minutes) in a wild WINGULL fight. The foe stayed at 17 HP and the battle turn stayed 1. The model pressed DOWN from FIGHT, which opens POKéMON, then LEFT, A, A. LEFT from POKéMON does not move (`HandleInputChooseAction`: DPAD_LEFT moves only when cursor & 1). A on POKéMON opens the party. It did that 51 times (100 party screens) and fled at turn 1129. `battle-observation-loop-v1` does not count it, because the screen changes. Same-plan on the button string misses it, because the batches vary. Across 726 cook battles, 6 matched this shape. This one was the longest.

## Skills Loaded

feature-switch, feature-explainer, feature-worklog, execute-worklog, pokebench-game-state (menu geometry from pokeemerald 731ad5b). The operator approved the implementation in chat. Not queued and not launched.

## Architecture

Switch `battle-menu-loop-v1`, group guard, needs null, default off. `LoopDetector` takes it as the last constructor argument. `attachLoopGuard` passes it last. `live.ts` and `decision-probe.ts` pass `features["battle-menu-loop-v1"]`.

A return is a press, navigate_to or observe that ends on the battle action menu with the same cursor, the same battler HP and species, and the same battle turn, after the POKéMON or BAG screen was open since (party menu, party action menu, POKéMON summary, or BAG). A state during the call can open that screen and the call can still end on the menu. The fourth return raises a cycle warning whose text is `BATTLE_MENU_LOOP_MESSAGE`, then the supervisor briefing, which keeps that sentence. A different cursor, a change in battler HP or species, a new battle turn, or leaving the battle clears the count and ends that episode. One visit does not warn. Off: the new code does not run.

The bundle arm of `experiments/fixed/bundle-v-control.json` lists the switch. The base sets it false, so the control arm stays off. Pending `experiments/battle-menu-loop.json` is not queued. Activation `STARTER_CHOSEN`, primary `PETALBURG_WOODS`, think-fast, 8 per arm.

## Invariants

- INV-1 OFF is today's guard. The new counter is not consulted.
- INV-2 The fourth return warns. The first three do not. HP, the battle turn, a cursor change, or leaving the battle clears the count.
- INV-3 The warning uses the game's menu words and does not tell the model to RUN.
- INV-4 No standing prompt line. No timeline mark.

## Security Review

No new trust boundary. The switch reads the decoded battle already in the tool result and writes the existing loop-guard notice. No credentials, no ROM, no network.

## Milestones

**M1 — the guard**
- [x] Tests in `packages/agent/src/battle-menu-loop.test.ts`.
- [x] Wiring deletion: removing `features["battle-menu-loop-v1"]` from `live.ts` turned the wiring test red (live.ts expected false). Restored. The decision probe is checked by the same test.
- [x] Registry appended last. Presets and `DEFAULT_NEXT_RUN` default it off. Positional `.at` / `.slice` indexes moved by one. Guard count 23. Switchboard rows 113.
- [x] Explainer `docs/explainers/battle-menu-loop-v1.html`. `just pages-check` prints nothing.
- [x] Pending experiment, not queued. Readiness row. Bundle switches list and base false. `open-goal-prompt.json`'s incumbent, which tracks the bundle arm, sets this switch true.
- [x] Gates: `just lint` clean (worktree venv linked to the main checkout's mgba binding; vendor submodule initialized). `just coverage`: agent 2366 tests, 97.98 / 94.07 / 98.28 / 99.24; viewer 1136 tests, 95.36 / 91.38 / 93.79 / 97.62; pytest 2707; Python lines 97.66, branches 93.82, functions 100. `just experiments-check`: ok 105. `loop-detection.ts` 97.20 / 95.36 / 100 / 99.
- [ ] Review, then fast-forward onto main.

## Closing the Loop

Tests cover the OFF silence, the fourth return, one look, BAG, HP, battle turn, cursor change, a party screen opened mid-press, the supervisor sentence, leaving the battle, and the live/probe wiring. The explainer is served from the viewer allowlist (server test). Harness Config card link is asserted. No run was launched.

## Session Log

- 2026-10-17: operator asked for the loop guard, the bundle arm, review, and a landing on main. Implemented on this branch from main 44c42815. The dirty `stale-story-goal-v1` checkout was not touched.

## Surprises

The party-screen state used as a detour must carry the same battler HP and battle turn as the menu it returns to. A helper that rebuilt the party screen at the default HP cleared the count on every trip.

## Multi-Model Review Log

Pending.

## Boy Scout Log

None.

## Archive Milestone

User-gated. Do not archive until the operator says so.
