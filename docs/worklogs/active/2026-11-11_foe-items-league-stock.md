# Foe trainer items and League stock-up (foe-item-recap-v1, foe-trainer-items-v1, league-stock-up-v1)

## Problem Statement

The operator (thread [private message reference], 2026-11-10/11): Opus does not account for enemy trainers using Full Restores or potions, especially against the Elite Four and the Champion, and did not buy nearly enough healing before the Elite Four despite having lots of money.

Evidence (read-only forensics):
- b5a8 T38: Opus used Waterfall on Milotic at 23 HP; Wallace used FULL RESTORE first. Wallace used 3 in that fight.
- 67d7 T3933: Opus used Quick Attack on Glalie at 2 HP; Glacia used FULL RESTORE (Glalie to 146), Electrike fainted next, and the run lost to Glacia.
- The harness shows "<TRAINER> used FULL RESTORE!" only in the dialogue of the call it happened in. Nothing says what the trainer still carries or when its AI uses items.
- 67d7 shopped twice all game (Slateport T357, Fortree T1706), used its last healing item on Juan (T3276), and entered the League at T3880 with ₽130,696 and none. supplies-v1 and rq-milestone-guide-v1 were off in its preset. After the loss the whiteout halved its money; it then bought 12 FULL RESTOREs, 10 REVIVEs and 10 HYPER POTIONs.

The operator's decision (2026-11-11 8:24 AM): supplies-v1 ON in both arms; foe-item-recap-v1 ON in both arms; foe-trainer-items-v1 and league-stock-up-v1 in the Rayquaza lane and the Opus Rayquaza lane only. The League paragraph leaves the amount to Opus, but states its money and that saving money makes no sense because becoming Champion is its ultimate goal.

## Skills Loaded

feature-switch, feature-worklog, execute-worklog, pokebench-game-state, feature-explainer, close-the-loop, agent-observability (no new events; the state key is recorded with every state event).

## Architecture

- Game grounding (pret pokeemerald 731ad5bf): BattleAI_HandleItemUseBeforeAISetup copies the non-empty gTrainers[opponent].items into battleHistory->trainerItems[itemsNo++] in item-using trainer battles; ShouldUseItem zeroes slot i when used and skips slot i > 0 while more than itemsNo - i + 1 POKéMON can fight; FULL RESTORE below maxHP/4. Each Elite Four member carries 2 FULL RESTOREs, Wallace 4. struct BattleHistory: usedMoves[4] of 16 bytes, abilities[4], itemEffects[4], trainerItems at +0x48, itemsNo at +0x50 (verified on 67d7 raw RAM, see Session Log).
- Server (`env/pokebench_env/foe_trainer_items.py`): reads the history behind gBattleResources (+0x18), validates it against the trainer's ROM items (else None), names items from the ROM item table. `rerender.read_state` reads it only in battle with a switch on; `readout.py` adds the recap and/or items-left line after the battle details; `state_json` adds `foe_trainer_items` only when read.
- Agent: `league-stock-up.ts` appends one paragraph on the first field result after each arrival in EVER GRANDE CITY POKEMON LEAGUE 1F. Wired in `playGameTools` beside supplies-v1. `events.ts` StateBodySchema accepts the new optional state key.
- Viewer: `KNOWLEDGE_SWITCHES` gains foe-trainer-items-v1 and league-stock-up-v1, so any run with either ON is a heavily assisted custom lane.
- Configs: current.json moves supplies-v1 from `switches` to onInBoth and adds foe-item-recap-v1 onInBoth; the two knowledge switches are offInBoth there and `on` in rayquaza-lane.json; current-control-24h-8k.json mirrors supplies and recap; opus-rayquaza-lane.json turns all four on.

## Invariants

- INV-1: Each switch OFF reproduces today's readout bytes, state JSON and tool results. Tests: env OFF bytes, TS wrapper identity.
- INV-2: foe-item-recap-v1 names only items the game has already shown being used; it never reveals what is left.
- INV-3: Only custom lanes get foe-trainer-items-v1 and league-stock-up-v1 (offInBoth in current; KNOWLEDGE_SWITCHES flags any run with them).
- INV-4: No new stop condition, no model-facing truncation, no tool change (tool-prompt-sync not needed).

## Security Review

No new network surface. Reads emulator memory the server already reads. No new files.

## Milestones

**M1: Readouts, lobby paragraph and lane wiring**
- [x] Write tests: env/tests/env/test_foe_trainer_items.py (23), packages/agent/src/league-stock-up.test.ts (7, also covers supplies-v1, which had no tests), custom-lane, recipe-overlay and launched-recipe test updates
- [x] COMMIT RED: `test(foe-items): pin foe trainer item readouts and the League stock-up paragraph` (4e459d707)
- [x] Implement
- [x] Cheap checks: ruff, ruff format, mypy on changed Python; tsc and eslint on changed TS; focused pytest 23/23; agent vitest league-stock-up, features, play-preset, opus-rayquaza 71/71; viewer panels, next-run, custom-lane and the fixed/recipe suites 369/369 + 4/4. Wiring deleted once (withLeagueStockUp in play-wiring) and the factory test went red, then restored.
- [x] COMMIT GREEN: `feat(foe-items): foe trainer items in battle and a League stock-up paragraph` (see next entry)
- [x] Explainer: docs/explainers/foe-items-league-stock.html, mapped for the three switches; pages-check clean; headless desktop and phone screenshots checked, no page-level horizontal scroll
- [x] Review round 1 on base 6d5a67339 head a6a3a5e19 (diff sha256 031a55fc…7bc6): Claude subagent BLOCKING, Codex gpt-5.6-sol BLOCKING. Both: the AI zeroes the slot when it chooses the item, during selection, so the recap leaked a heal not yet shown (67d7 raw RAM 105176, turn 3933). Codex also: the League lobby OnTransition sets the respawn, so a loss returns there; GUARD SPEC. also needs no MIST; tests should pin absolute switch positions and serverOffWith. Claude also: MAX POTION 255 is the full-heal value.
- [x] Fix: `_chosen_not_shown` reads gChosenActionByBattler (0x0202421C), gBattlerByTurnOrder, gCurrentTurnActionNumber and gBattleMainFunc; a chosen foe item still counts as left during selection and until its turn-order action runs. Checked frame by frame on 67d7 raw RAM 105168-105259: hidden 105175-105186, used from 105187 when the action ran. Tests 28/28 env, 7/7 league; lobby text says the loss returns to this lobby; GUARD SPEC. rule split; MAX POTION wording.
- [x] Review round 2 (head aa194ebdc, diff sha256 57d8f59c…a724): Claude LGTM; Codex BLOCKING: the current action's script prints the message over later frames and gCurrentTurnActionNumber advances only after it finishes, so `>` still showed the item early. Fix: pending while the foe's turn-order index is >= the current action number (any main function after selection). 67d7 raw RAM: hidden 105175-105187, used from 105190 after the action finished. Tests 28/28.
- [x] Review round 3 (head 402cf79e0, diff sha256 7c778fec…e5ea): Claude LGTM; Codex BLOCKING: 0x0803D2E9 is SetActionsAndBattlersTurnOrder, not CheckFocusPunch, and CheckFocusPunch's FOCUS PUNCH setup script (BattleScriptExecute) runs before the action number is reset. Fix: pre-turn = selection, SetActionsAndBattlersTurnOrder, CheckFocusPunch (0x0803D6F1, confirmed by its literal pool) or a script runner with CheckFocusPunch on top of the battle callback stack. 67d7 still hidden through 105189, used from 105190. Tests 29/29.
- [ ] Gates in a CPU window: just test, just lint, pnpm -r build, just verify-vendor
- [ ] Review: Codex/GPT lane LGTM (Grok out until 11/17), Claude lane
- [ ] Show the operator; land fast-forward; just viewer-main

## Closing the Loop

Rehearsal: rerender of 67d7's recorded raw RAM in Sidney's and Glacia's rooms with both server switches on.

## Session Log

- 2026-11-11: First offsets (+0x28/+0x30, from a misread 8-byte UsedMoves) read zeros on 67d7's raw RAM; pret's UsedMoves is 16 bytes, so trainerItems is at +0x48. Corrected; the unit test now pins the arithmetic.
- 2026-11-11 rehearsal (67d7 raw RAM, rerender with both switches on): T3894 SIDNEY and T3929/T3931 GLACIA read "used: none" and "left: FULL RESTORE (any turn); FULL RESTORE (only once 2 or fewer of its POKéMON can fight)"; T3934 and T3938, after GLACIA's FULL RESTORE, read "used: FULL RESTORE ×1" and only the second one left.

## Surprises

- supplies-v1 had no tests on main; this change adds them.

## Multi-Model Review Log

(pending)

## Boy Scout Log

## Archive Milestone (user-gated)
- ASK USER: archive
