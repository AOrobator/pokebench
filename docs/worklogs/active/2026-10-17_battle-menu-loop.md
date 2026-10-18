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
- INV-2 The fourth return warns. The first three do not. HP, species, the battle turn, a cursor change, or leaving the battle clears the count. A missing battle turn or battler list does not count. A state event that has left the battle clears the count.
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
- [x] Review, then fast-forward onto main. Landed as `10f62d9f2323229ee6c8bcc3ed29e9fe098c9950`.

## Closing the Loop

Tests cover the OFF silence, the fourth return, one look, BAG, HP, battle turn, cursor change, a party screen opened mid-press, the supervisor sentence, leaving the battle, and the live/probe wiring. The explainer is served from the viewer allowlist (server test). Harness Config card link is asserted. No run was launched.

## Session Log

- 2026-10-17: operator asked for the loop guard, the bundle arm, review, and a landing on main. Implemented on this branch from main 44c42815. The dirty `stale-story-goal-v1` checkout was not touched.

## Surprises

The party-screen state used as a detour must carry the same battler HP and battle turn as the menu it returns to. A helper that rebuilt the party screen at the default HP cleared the count on every trip.

## Multi-Model Review Log

Round 1, frozen head `4d9a3cb936ed3b4b7864536b75c45bcf6be3b04f`, diff SHA-256 `4e070e090ac405037a4dd35415e45b2e7a63cbf9c7040bdc3b5948e81ff6a051`. Claude CLI was logged out (`~/.claude-review` and the default profile both `loggedIn: false`), so the Claude lane ran as Cursor `claude-opus-5-thinking-high` in ask mode. Grok was Cursor `cursor-grok-4.5-high`. GPT was Cursor `gpt-5.6-sol-xhigh`. No local inference lane.

- Grok: `VERDICT: LGTM`. Empty stderr.
- GPT: `VERDICT: BLOCKING`. Five findings, triaged below.
- Claude (`claude-opus-5-thinking-high`): `VERDICT: LGTM`. Empty stderr. It reproduced the pre-fix coverage numbers, so this verdict is on `4d9a3cb9`. Its non-blocking notes 4 and 5 are the same two holes GPT blocked on (an empty stamp still counted; a non-battle state event did not clear). Those are the fixes in the next commit. The other notes (positional-boolean coverage, a missing end state resetting, the count not cleared after the warning, the undesigned pending experiment) stay non-blocking.

Triage of the GPT findings:

1. Fix. `actionMenuKey` used an empty string when `battleStamp` was null, so a missing battler list or a null battle turn could count as the same menu. `battleStamp` now returns null when the turn is null, and the menu key returns null when the stamp is null.
2. Fix. `noteMenuScreen` ignored a state event with `in_battle: false`, so the count survived a battle exit that was not the completing press. That event now clears the count and ends a menu episode.
3. Rebut. The notice is the existing `loop_guard` event. Activity History already renders that kind, and no new consumer was added. The fourth-return test now parses the warning with `checkEvent`. `context()` is the model-facing sentence and is already asserted. A mounted-viewer replay of an unchanged event kind is outside this delta.
4. Rebut. `experiments/battle-menu-loop.json` has no `queuePosition`, and its notes say it is not designed and not queued. That is the same shape as the pending entries already on main (`bag-healing-items`, `no-exit-here`, `instruction-ledger-v2`). The design skill applies before a cohort is queued or driven. This landing does not queue it. The operator did not set a GPU-hour budget.
5. Rebut. The explainer skill requires `just pages-check` (clean) and a local link. It does not require screenshots at three widths. The viewer server test already serves the page.

Grok's non-blocking note on a missing species-change test is covered by the fix commit.

Round 2, frozen head `7e2848d593a83cbf93ba14cf37acf3c17fe2abb4`, diff SHA-256 `f06d78d08cb95bf38d1ea600be312c788b0f3df9c3f44d04b8d76aca9089b312`. Same three Cursor lanes. The packet was unchanged before and after.

- Grok: `VERDICT: LGTM`. Empty stderr.
- Claude: `VERDICT: BLOCKING`. `just lint` fails: the new state-event literal is not a `RunEvent` (`TS2345` at `battle-menu-loop.test.ts`). Vitest does not type-check, so the suite stayed green. Fix: spread a `GameStateSnapshot` cast, the same form as the other observe in this file. The worklog's round-1 gate numbers were not re-run for `7e2848d5`; this commit re-runs `tsc --noEmit` on the agent package.
- GPT: `VERDICT: BLOCKING`. Three findings.
  1. Rebut. A return is the call's end state. An intermediate cursor inside a call that ends back on the same choice is still that return. Clearing on a mid-call cursor would drop the LEFT, A, A loop this guard exists for, whenever one frame of the batch touched FIGHT.
  2. Fix. An empty battler list took the same null-stamp path as a missing list and had no test. The missing-list test now also drives `battlers: []`, including the case that keeps a count already underway.
  3. Fix. The state-event leave test ran before any warning, so it did not show `recover`. The supervisor test now observes an overworld state after the warning and expects `recovered` and a null context.

Round 3, frozen head `10f62d9f2323229ee6c8bcc3ed29e9fe098c9950`, diff SHA-256 `da140b7042a20ca3c6a0c6130768ae73746c95511c277ef84d5a74e87ef079c5`. Same three Cursor lanes, ask mode, empty stderr. The packet was unchanged before and after. Claude CLI stayed logged out, so Claude remained Cursor `claude-opus-5-thinking-high`.

- Claude: `VERDICT: LGTM`. Re-ran `tsc --noEmit` and eslint. Reproduced agent coverage 98.02 / 94.14 / 98.28 / 99.24 and `loop-detection.ts` 97.88 / 96.24 / 100 / 99.01. `just experiments-check` ok 106.
- Grok: `VERDICT: LGTM`.
- GPT: `VERDICT: LGTM`.

Fast-forward of local main: `44c42815` to `10f62d9f`. The dirty `stale-story-goal-v1` checkout was not switched. `experiments/battle-menu-loop.json` `source.commit` is still `44c42815`; the notes say to repin with `just experiment-pin` after landing. That edit is not in this evidence commit.

## Boy Scout Log

None.

## Archive Milestone

User-gated. Do not archive until the operator says so.
