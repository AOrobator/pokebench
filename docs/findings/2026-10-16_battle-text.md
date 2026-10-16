# Battle message window, page journal and battle wait

Owner: `env/pokebench_env/battle_text.py`. Source: pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` (clean). ROM: US Emerald SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`.

## What the game does

- `battle_controller_player.c` `PlayerHandlePrintString`: `BufferStringBattle(id)` expands the string into `gDisplayedStringBattle`, then `BattlePutTextOnWindow(gDisplayedStringBattle, B_WIN_MSG)`, then the controller waits in `CompleteOnInactiveTextPrinter2` until the printer is idle.
- `battle_message.c` `BattlePutTextOnWindow`: for `B_WIN_MSG` it uses the player's text speed, sets `gTextFlags.canABSpeedUpPrint`, and sets `gTextFlags.autoScroll` only in link or recorded battles. `AddTextPrinter` (`text.c`) copies the printer into `sTextPrinters[windowId]` only when the speed is not 0 / `TEXT_SKIP_DRAW`; at speed 0 it renders at once and leaves `sTextPrinters[windowId].active = FALSE`.
- `text.c` `RenderText`: `RENDER_STATE_WAIT` (`TextPrinterWait`), `RENDER_STATE_CLEAR` (`\p`) and `RENDER_STATE_SCROLL_START` (`\l`) wait for `JOY_NEW(A_BUTTON | B_BUTTON)`; A and B both advance. With `autoScroll` they wait on a timer instead.
- A message without a page wait finishes printing; `battle_script_commands.c` `Cmd_waitmessage` then advances after its frame count. Those pages need no input.
- Healthbox names (`battle_interface.c` `UpdateNickInHealthbox` via `AddTextPrinterAndCreateWindowOnHealthbox`), move names, PP and type text are written into the same `gDisplayedStringBattle`, but printed at speed 0 into other windows. They never leave printer 0 active.
- Battle-script YES/NO boxes: `Cmd_yesnoboxlearnmove` (0x5A), `Cmd_yesnoboxstoplearningmove` (0x5B), `Cmd_yesnobox` (0x67, "Use next POKéMON?" and the trainer switch offer), `Cmd_trygivecaughtmonnick` (0xF3). Each waits for input in its state 1 (`gBattleScripting.learnMoveState` for the first two, `gBattleCommunication[MULTIUSE_STATE]` for the others); the cursor is `gBattleCommunication[CURSOR_POSITION]` (0 YES, 1 NO); B answers NO. Commands run only while `gBattleControllerExecFlags == 0`, so the question's message has finished printing first.
- `battle_main.c` `ReturnFromBattleToOverworld` clears `gMain.inBattle` and hands control back through the field-return callbacks; an evolution runs before that, with `inBattle` still set and its own callback.

## Addresses (US ROM)

| Symbol | Address | Receipt |
|---|---|---|
| `sTextPrinters` (stride 0x24; currentChar +0, windowId +4, active +0x1B, state +0x1C) | 0x020201B0 | existing field-message owner (`world_context.py`), `include/text.h` layout |
| `gDisplayedStringBattle[300]` | 0x02022E2C | ROM literal (symbol map `/private/tmp/pokebench-all-symbol-map.json`) |
| `gTextFlags` (autoScroll bit 2) | 0x03003014 | ROM literal |
| `gBattleScripting` (learnMoveState +0x1F) | 0x02024474 | ROM literal (133 uses); offset from `include/battle.h` |
| `gBattleScriptingCommandsTable` | 0x0831BD10 | ROM literal; entries 0x10, 0x12, 0x5A, 0x5B, 0x67, 0xF3 point at the matching handlers (old names atk10_printstring, atk12_waitmessage, sub_804E038, atk5B, atk67, atkF3) |
| `gBattleCommunication` | 0x02024332 | ROM literal; already used by `battle_choices.py` |
| `CB2_HandleStartBattle` | 0x08036FAD | the only literal is in `CB2_InitBattleInternal`'s pool (0x08036A2C), which calls `SetMainCallback2(CB2_HandleStartBattle)` |
| `CB2_ReshowBattleScreenAfterMenu` | 0x080A933D | the only literal (0x080A9338) closes `ReshowBattleScreenAfterMenu`, which sets it; seen in the showcase run right after the bag closes |
| `BattleMainCB2`, `CB2_Overworld` | 0x08038421, 0x08085E5D | existing `game_screen.py` labels |

## Rules the reader applies

- A battle message is shown only while printer 0 is active (`active == 1`, `windowId == 0`) with `currentChar` inside `gDisplayedStringBattle`, in `BattleMainCB2`. Otherwise the window is `idle` and no text is reported, whatever the buffer holds.
- `waiting_for_input` = render state 1, 2 or 3 and no `autoScroll`. Other states are `printing`.
- A cursor past the decoded message's end means the buffer was replaced under the printer: a diagnostic, never text.
- The journal cuts a page at each wait (the text up to the printer's cursor) and at the end of a message that finishes on its own. A new message starts when the printer restarts (cursor goes back) or the buffer no longer holds the open message.

## Evidence

Showcase run `2026-10-16T00-34-26_qwen36-gpu1_show`, raw RAM (fixture `env/tests/env/fixtures/battle-text-show-7765.json`):

- 7765: buffer `WURMPLE♀` (healthbox), printer 0 inactive: `idle`, no page.
- 7772: printer 0 active, state 2, cursor 23: `Wild WURMPLE appeared!` waiting for input.
- 7782: printer 0 inactive, action menu owner busy: phase `input`.
- 7790: printing `,VQ  SOC  used SCRATCH!` (the run's nickname); 7792 idle: recorded as an auto page.
- 7822, 7828: `Wild WURMPLE fainted!` and `gained 15 EXP. Points!` wait for input.
- 7834: `inBattle` clear, field-return callback: `busy`. 7835: `CB2_Overworld`: `field`.

Real ROM, isolated server from `runs/battle-text-qualify/states/first-battle-appeared.state` (Birch rescue battle, Torchic vs Zigzagoon; ordinary presses only):

- `/pokebench/battle/wait` returned `message_waiting` (0 frames), then after one B `input` (188 frames); a whole turn ran on its own and hit the 600-frame bound once (619 frames), then `input`; after FIGHT/SCRATCH, `message_waiting` (357) for "fainted", `message_waiting` (116) for EXP, then `field` (124 frames) on `CB2_Overworld` with Birch's field message waiting.
- Journal pages, in order: `Wild ZIGZAGOON appeared!` (waited), `Go! TORCHIC!`, `TORCHIC used SCRATCH!`, `Wild ZIGZAGOON used GROWL!`, `TORCHIC's ATTACK fell!`, `TORCHIC used SCRATCH!`, `Wild ZIGZAGOON fainted!` (waited), `TORCHIC gained 17 EXP. Points!` (waited). No journal errors.
- B at the action menu leaves the menu at FIGHT; A on FIGHT reads `move` ready on the next observation.

Not visited natively: learn-move and nickname YES/NO boxes, the switch offer, a double battle and a link or recorded battle. Their readouts are covered by source and synthetic tests only.
