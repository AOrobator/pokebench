Feature switch · observation · `readout-truth-v1` · default OFF · meant to be ON in both arms

# Readout truth

> Markdown twin of [readout-truth-v1.html](../readout-truth-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Correctness fixes to readout lines that hedged or were wrong. When the game state proves that no message box or menu is open, the readout says so. When something holds the field controls, it says what. These are fixes, not a treatment: the switch is meant to be ON in both arms of a comparison. OFF keeps today's bytes so recorded runs and older presets re-render the same.

## Why

The cook harness audit of 2026-10-16 (`runs/reports/2026-10-16-cook-harness-audit/`) found these lines on almost every field readout of every run:

- `Field-message text: unavailable; do not infer that the dialogue box is closed.` and `Field-message phase: unavailable; do not infer a cutscene or an input-ready dialogue.` next to `Dialog: none` and `Field controls: available` (687e: 834 results; e588: 480 of 480). In 2919 the model read this as "a dialogue is active" and pressed A×5 for 11 turns.
- `Menu: unavailable (active owner not verified)` on 1,028 of 1,036 results in 687e, with no menu open.
- `Unverified menu buffer: cursor 1 of 2; active menu owner unavailable` in battle (sh02, 363 readouts) and `cursor 4 of 4` on the free field: the stale `sMenu` struct, quoted as if it were a menu.
- `STATE COVERAGE ERROR: field-message owner unqualified …` while a field YES/NO box was open and read correctly (14 times in 5 runs).
- `Bag: ` with nothing after it on the field when the bag is empty (battle says `Bag: empty`).
- `Mom rival instruction received` at story stage 7, before any rival exists. 687e cited it while hunting "the rival".
- The START menu redrawn after the party or bag (or another screen opened from it) closes read as `Screen: overworld / Dialog: none` (show T526–541).
- The party menu's Cancel button (slot 7) raised a coverage error, and slot 6 was called CANCEL.
- `Not on this map: … MAY` while RIVAL_MAY_NORMAL was live and on screen (54a7 T153–154).

## Before and after, on recorded RAM

```
OFF  sh02 T143 (state 2984): a push-back script walks the player back
Menu: unavailable (active owner not verified)
Bag: (nothing after the colon)
Story: player name confirmed; Mom clock instruction received; clock set; Mom rival instruction received
Field controls: locked (dialog, menu, or script; direction presses cannot move)
Field-message text: unavailable; do not infer that the dialogue box is closed.
Field-message phase: unavailable; do not infer a cutscene or an input-ready dialogue.
```

```
ON   the same RAM, re-rendered on the real ROM
Menu: none open
Bag: empty
Story: player name confirmed; Mom clock instruction received; clock set; Mom told you PROF. BIRCH lives next door (after the Petalburg Gym TV report)
Field controls: locked (a script is running with no message or menu open, for example moving the player or a person; direction presses cannot move)
Field-message text: none (no message box is open).
Field-message phase: no message is open; a script is running (movement_wait).
```

*Only these six lines change; every other line of the readout is the same. The OFF text is contained byte for byte in the tool result the model received.*

```
OFF  2919 T65 (state 941): the moving truck
Field controls: locked (dialog, menu, or script; direction presses cannot move)
```

```
ON
Field controls: locked (no message, menu or script is open; a game animation or sequence holds them; direction presses cannot move; observe again)
Field-message phase: no message is open and no script is running.
```

*The truck holds the controls from a task (`ExecuteTruckSequence` calls `LockPlayerFieldControls`, field_special_scene.c), not from a script, so the line says no script is running.*

```
OFF  sh02 T334 (state 7780): Birch's nickname question, field YES/NO box open
Field-message phase: unavailable; do not infer a cutscene or an input-ready dialogue.
STATE COVERAGE ERROR: field-message owner unqualified; mode 0; printer active 0, state 0, cursor 0x0202200E; script status 1, mode 1, native 0x0809833D; tasks 0x080AB1B1,0x0809D88D,0x0809E639,0x0809D909,0x080E215D
```

```
ON
Field activity: other_interface; not an input-ready field message. Inspect the active interface and control lock before acting.
```

*The YES/NO task `0x080E215D` (Task_HandleYesNoInput, already read by the Interface line) is a valid owner with the message printer idle.*

```
OFF  sh02 T317 (state 7443), battle_resolving
Unverified menu buffer: cursor 1 of 2; active menu owner unavailable
```

```
ON
Menu: no menu choice open (the Interface line says what owns input)
```

```
OFF  54a7 T153 (state 3380): MAY live at (1,3)
Story characters here (from this map's own object list): none. Not on this map: PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN. …
```

```
ON
Story characters here (from this map's own object list): MAY at 1,3. Not on this map: PROF. BIRCH, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN. …
```

*Her template's hide flag was still set while a script had the object live. A live object with that local id wins.*

## When "none open" is said

![Decision for the field-message and menu lines](readout-truth-v1/fig-1.svg)

*Each "none" claim rests on game state. Any read failure (a short read of a buffer, a window header or its pixels included) or unknown owner keeps the old hedged line. The sMenu window is checked directly: a drawn menu window with the controls locked and no recognised owner keeps the old text even when its cursor does not decode, and an interface that reports a coverage error keeps the old Menu line.*

## Game grounding (pret/pokeemerald 731ad5bf, US ROM f3ae0881)

| Fact | Source | Value read |
|---|---|---|
| Field message box hidden | `sFieldMessageBoxMode` (field_message_box.c) | 0x020375BC = 0 |
| Script running or not | `sGlobalScriptContextStatus`, `sGlobalScriptContext.mode` (script.c) | RUNNING 0 / WAITING 1 / SHUTDOWN 2; STOPPED 0 / BYTECODE 1 / NATIVE 2 |
| Push-back wait | native `WaitForMovementFinish` (scrcmd.c:1015), set by `waitmovement` | 0x0809A671 (sh02 states 2984, 18282) |
| Field YES/NO owner | `Task_HandleYesNoInput` (script_menu.c); multichoice 0x080E2059, grid 0x080E2309, callback YES/NO 0x08121FDD | 0x080E215D |
| START menu reopen | `ReturnToFieldOpenStartMenu` → `Task_WaitForFadeShowStartMenu` → `Task_ShowStartMenu` (field_screen_effect.c:424–438) | wait task 0x080AF661; ROM 0x080AF660: bl WaitForWeatherFadeIn, bl DestroyTask, literal 0x0809FA35 (Task_ShowStartMenu), movs r1,#0x50, bl CreateTask |
| Party buttons | `PARTY_SIZE` Confirm, `PARTY_SIZE + 1` Cancel (party_menu.c:1141, 1401, 1525) | slot 6 CONFIRM, 7 CANCEL |
| Story stage 7 | `PlayersHouse_1F_EventScript_SetWatchedBroadcast` after `PlayersHouse_1F_Text_GoIntroduceYourselfNextDoor` (players_house.inc:132–153) | VAR_LITTLEROOT_INTRO_STATE 0x4092 = 7 |

The START menu redrawn when a screen opened from it closes is drawn but its input task is not running yet, so it reads `start_menu`, the highlighted item, input not ready. The next observation (after the fade) reads the ordinary ready START menu. In an arm with expanded menu text off it shows as `Menu: detailed controls unprovided`, like every START menu there.

## Proof on recorded runs

Every tool result with raw RAM in seven cook runs, re-rendered with that run's switches and this switch OFF, is contained byte for byte in what the model received: 5,642 of 5,642 (sh02 1100, show 864, 2919 247, 3f21 198, 54a7 655, 687e 1036, e588 1542). With it ON, for example in 687e: 1011 results gain `Menu: none open`, 830 `Field-message text: none (no message box is open).`, 815 `Field-message phase: no message is open and no script is running.`, 50 the task-lock line and 15 the script-lock line.

## Wiring

![Switch wiring](readout-truth-v1/fig-2.svg)

*The game server reads the switch from its feature-off list; the state JSON is unchanged except where an interface owner is now recognized (the reopened START menu, a field YES/NO box's field_activity).*

## Status

Gates and real-ROM checks are recorded in `docs/worklogs/active/2026-10-16_readout-truth.md`. Not measured: no runs use it yet. The bundle owner puts it ON in both arms of bundle-v-control (`onInBoth`).
