# Nickname prompt stuck after a catch, fail-open input, and signal stops labeled crash

## Operator asks

- 2026-10-20 5:38 PM ET (coordinator relay of the GPU queue thread's finding): run `2026-10-20T16-14-34_qwen36-gpu1_c6c2` sat from 4:58 PM on the post-catch "Give a nickname to the captured ZIGZAGOON?" YES/NO box (cursor NO). The readout said `battle_resolving; input not ready; controller_busy`; battle text auto-advance waited 3×600 frames and dropped the model's A. Fix behind a bundle-only switch.
- 5:42 PM ET, the operator: "we should have a fail open design for boxes or ui we dont recognize and let the model make choices based on whats on screen. pressing b should also be able to dismiss that".
- 5:43 PM ET (coordinator): SIGTERM to c6c2's live.js recorded `run_end` reason "crash" instead of "operator_abort".

## Causes

- Nickname box: `Cmd_trygivecaughtmonnick` (opcode 0xF3, `BattleScript_SuccessBallThrow`) runs under `HandleEndTurn_FinishBattle` (0x0803D819; gBattleOutcome is B_OUTCOME_CAUGHT, so `sEndTurnFuncsTable` sends the turn there), which runs `sTurnActionsFuncsTable[gCurrentActionFuncId]` with gCurrentActionFuncId (0x02024083) == B_ACTION_EXEC_SCRIPT (10). `read_battle_prompt` only accepted the two script runners (0x0803E019, 0x0803E08D), so the open box (gBattleCommunication[0] == 1, cursor byte 1 = NO, raw-ram 5834) read as busy. The model's `[DOWN, A]` sent DOWN, then the A was dropped after the battle_busy stop, 19 times.
- Crash label: the abort came during the pre-model battle-readiness observe (pi's `transformContext`, which the pinned loop does not catch), so `loop.start/resume` rejected with AbortError and `withRun` kept its default "crash" (`run.ts:92`, `harness.ts` `play`).

## Design

- `caught-nickname-prompt-v1` (server, bundle-only, default off): the battle prompt reader also accepts HandleEndTurn_FinishBattle while it runs a script action, so the box reads as `prompt` in the state, the battle wait and the readout. Off: byte-identical.
- `fail-open-input-v1` (agent, bundle-only, default off): when the press tool's automatic advance stops on a hold the harness does not recognize (battle_busy, battle_unreadable, interface_not_ready, message_not_ready, locked_no_message), the inputs left in the model's batch are sent as asked, B included, and the result says the harness did not recognize the hold. Off: they are dropped as before.
- Signal stop label: a recording fix the model never sees, so no switch (feature-switch skill): `play` returns the governor's stop reason when the loop rejects after a stop was set; a rejection with no stop still throws (a real crash).

## M1

- [x] RED: c6c2 raw-ram 5834 fixture (OFF busy, ON prompt with cursor NO, non-script finish ignored, production state read and battle wait honour the switch); fail-open on the 54a7 level-up box with levelup-box-v1 OFF (A and B sent after battle_busy, OFF drops, recognized stop still drops, registry); play returns operator_abort on an aborted rejection, still throws with no stop
- [ ] GREEN
- [ ] Explainer, pending experiments, readiness
- [ ] Gates
- [ ] Review: Claude and Grok LGTM (max 2 rounds)
- [ ] features.ts slot, rebase, land ff-only
