# Nickname prompt stuck after a catch, fail-open input, and signal stops labeled crash

## Operator asks

- 2026-10-20 5:38 PM ET (coordinator relay of the GPU queue thread's finding): run `2026-10-20T16-14-34_qwen36-gpu1_c6c2` sat from 4:58 PM on the post-catch "Give a nickname to the captured ZIGZAGOON?" YES/NO box (cursor NO). The readout said `battle_resolving; input not ready; controller_busy`; battle text auto-advance waited 3×600 frames and dropped the model's A. Fix behind a bundle-only switch.
- 5:42 PM ET, the operator: "we should have a fail open design for boxes or ui we dont recognize and let the model make choices based on whats on screen. pressing b should also be able to dismiss that".
- 5:43 PM ET (coordinator): SIGTERM to c6c2's live.js recorded `run_end` reason "crash" instead of "operator_abort".

## Causes

- Nickname box: `Cmd_trygivecaughtmonnick` (opcode 0xF3, `BattleScript_SuccessBallThrow`) is part of the thrown ball's turn-action script, which `HandleAction_RunBattleScript` (`sTurnActionsFuncsTable[B_ACTION_EXEC_SCRIPT]`) runs under `RunTurnActionsFunctions` (0x0803D819; gCurrentActionFuncId 0x02024083 == 10; gBattleOutcome still 0). `read_battle_prompt` only accepted the two script runners (0x0803E019, 0x0803E08D), so the open box (gBattleCommunication[0] == 1, cursor byte 1 = NO, raw-ram 5834) read as busy. The model's `[DOWN, A]` sent DOWN, then the A was dropped after the battle_busy stop, 19 times. (Review round 1, Claude lane: the first draft misnamed 0x0803D819 as HandleEndTurn_FinishBattle; the ROM's sEndTurnFuncsTable at 0x0831BC44 has that at 0x0803DCD9.)
- Crash label: the abort came during the pre-model battle-readiness observe (pi's `transformContext`, which the pinned loop does not catch), so `loop.start/resume` rejected with AbortError and `withRun` kept its default "crash" (`run.ts:92`, `harness.ts` `play`).

## Design

- `caught-nickname-prompt-v1` (server, bundle-only, default off): the battle prompt reader also accepts RunTurnActionsFunctions while it runs a script action, so the box reads as `prompt` in the state, the battle wait and the readout. Off: byte-identical.
- `fail-open-input-v1` (agent, bundle-only, default off): when the press tool's automatic advance stops on a hold the harness does not recognize (battle_busy, battle_unreadable, interface_not_ready, message_not_ready, locked_no_message), the inputs left in the model's batch are sent as asked, B included, and the result says the harness did not recognize the hold. Off: they are dropped as before.
- Signal stop label: a recording fix the model never sees, so no switch (feature-switch skill): `play` returns the governor's stop reason when the loop rejects after a stop was set; a rejection with no stop still throws (a real crash).

## M1

- [x] RED: c6c2 raw-ram 5834 fixture (OFF busy, ON prompt with cursor NO, non-script finish ignored, production state read and battle wait honour the switch); fail-open on the 54a7 level-up box with levelup-box-v1 OFF (A and B sent after battle_busy, OFF drops, recognized stop still drops, registry); play returns operator_abort on an aborted rejection, still throws with no stop
- [x] GREEN: `caught_nickname.py` + `read_battle_prompt/battle_text_phase/wait_phase/BattleWait(turn_action_script)`, `read_battle_state(turn_action_prompt)`, `read_game_state(caught_nickname_enabled)`, rerender and serve wiring; `fail-open-input-v1` in `withDialogueAutoAdvance` (UNRECOGNIZED stops send the rest of the batch one press at a time, note in the result, event lists them as sent); `play` returns the governor's stop when the loop rejects after a stop. Both switches bundle-only in bundle-v-control and bundle-cook-1h. Registry churn across 52 agent tests, 8 Python tests, legacy-features and open-goal-prompt. Wiring deletions: fail-open `failOpen=false` turns 2 levelup-box tests red; rerender `caught_nickname_enabled=False` turns the production state-read test red; both restored.
- [x] Explainers `docs/explainers/caught-nickname-prompt-v1.html`, `fail-open-input-v1.html` (pages-check clean), FEATURE_EXPLAINERS + server test; pending `experiments/caught-nickname-prompt-v1.json`, `fail-open-input-v1.json`; readiness rows
- [x] Gates: lint clean; agent 2963, viewer 1435, pytest 2998; coverage above 90 (agent 97/93/98/99, viewer 95/91/94/98, Python 97/93/100)
- [ ] Review: Claude and Grok LGTM (max 2 rounds). Round 1 (packet ad2fd385…): Grok LGTM; Claude BLOCKING on grounding (0x0803D819 is RunTurnActionsFunctions; HandleEndTurn_FinishBattle is 0x0803DCD9; outcome is 0 at the box). Fixed: constant, kwargs (`turn_action_script`, `turn_action_prompt`), docs, explainer, experiment, fixture test pins outcome 0. Also fixed the round-1 note that fail-open with safe batches also printed "Interface safety ... not sent" (new test); merged the stacked docstring. Deferred: recording a fail-open marker in the event; logging an error swallowed after a stop; re-classifying between fail-open presses (beyond the operator's ask).
- [ ] features.ts slot, rebase, land ff-only
