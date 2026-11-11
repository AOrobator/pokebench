# Caught nickname question

> Markdown twin of [caught-nickname-prompt-v1.html](../caught-nickname-prompt-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`caught-nickname-prompt-v1` · server readout switch · bundle-only, default off

After a catch the game asks *Give a nickname to the captured ZIGZAGOON?* with a YES/NO box. The readout did not see the box: it said the battle was busy, so the battle text advance waited and dropped the model's A. Run `2026-10-20T16-14-34_qwen36-gpu1_c6c2` sat on this box from 4:58 PM for about 40 minutes.

## Why the readout missed it

![The box is drawn by battle script opcode 0xF3 (Cmd_trygivecaughtmonnick, in BattleScript_SuccessBallThrow). A thrown ball is a turn action: HandleAction_UseItem hands its script to sTurnActionsFuncsTable(B_ACTION_EXEC_SCRIPT) (HandleAction_RunBattleScript), which RunTurnActionsFunctions calls every frame. The reader only accepted the two battle script runners. gBattleOutcome is still 0 while the box is open; CAUGHT is set after it.](caught-nickname-prompt-v1/fig-1.svg)

*The box is drawn by battle script opcode 0xF3 (`Cmd_trygivecaughtmonnick`, in `BattleScript_SuccessBallThrow`). A thrown ball is a turn action: `HandleAction_UseItem` hands its script to `sTurnActionsFuncsTable[B_ACTION_EXEC_SCRIPT]` (`HandleAction_RunBattleScript`), which `RunTurnActionsFunctions` calls every frame. The reader only accepted the two battle script runners. `gBattleOutcome` is still 0 while the box is open; CAUGHT is set after it.*

## The recorded frame

| Read | Address | c6c2 raw-ram 5834 (turn 406) |
|---|---|---|
| gBattleMainFunc | `0x03005D04` | `0x0803D819` RunTurnActionsFunctions |
| gCurrentActionFuncId | `0x02024083` | 10 (B_ACTION_EXEC_SCRIPT) |
| script op at gBattlescriptCurrInstr | `0x02024214` → `0x082DBDAF` | `0xF3` trygivecaughtmonnick |
| gBattleOutcome | `0x0202433A` | 0 (CAUGHT comes after the box) |
| gBattleCommunication\[0..1\] | `0x02024332` | 1 (input state), 1 (cursor on NO) |

## What the model reads

OFF Battle details: WILD single · turn 3 · resolving (the game is playing animations or a message that closes on its own; no input until the game asks)

ON Battle details: … battle YES/NO box open (nickname the caught Pokémon), cursor on NO — UP or DOWN moves the cursor, A answers the highlighted choice, B answers NO

With the switch on, the battle wait ends on the box (`reason: prompt`) and battle text auto-advance stops with `battle_prompt`, so the model's next press reaches the box. RunTurnActionsFunctions running any other action is still read as before.

## Wiring

`POKEBENCH_FEATURES_OFF` → `rerender.read_state(caught_nickname_enabled)` → `read_game_state` → `read_battle_state(turn_action_prompt)` → `read_battle_prompt(turn_action_script)`; and `serve.py` → `BattleWait(turn_action_script)` → `wait_phase`. Off is byte-identical.

## Status

Tests: `env/tests/env/test_caught_nickname.py` on the c6c2 fixture (OFF busy, ON prompt with cursor NO, non-script finish ignored, production state read and battle wait honour the switch). Pending experiment `experiments/caught-nickname-prompt-v1.json`; no measured runs yet.
