# Emerald source reference

- Upstream: https://github.com/pret/pokeemerald.git
- Local checkout: `/Users/user/dev/pokeemerald`
- Retrieved: 2026-10-12
- Reference commit: `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`
- Upstream README identifies the matching US Emerald ROM SHA-1 as `f3ae088181bf583e55daf962a92bb46f4f1d07b7`.

The source checkout is separate from PokeBench and its pinned continual-harness vendor. It contains decompiled source and project data, not a supplied ROM. A build is unnecessary for ordinary source reading. Before using offsets, verify the user's actual ROM identity through PokeBench's resolver; never obtain, copy, or commit a ROM to create this reference. Preserve the reference revision; intentionally changing it should include an updated provenance note and renewed layout checks.

Paths below are relative to the reference checkout. Search with `rg` for the named symbols and follow their callers rather than relying on line numbers.

## Clock setting and confirmation

- `src/wallclock.c`: `CB2_StartWallClock`, `CB2_WallClock`, `Task_SetClock_HandleInput`, `Task_SetClock_AskConfirm`, `Task_SetClock_HandleConfirmInput`, `Task_SetClock_Confirmed`.
- Clock task data: `tHours`, `tMinutes`, `tPeriod`, hand angles and movement direction/speed. The task function distinguishes adjustment, confirmation, and exit phases.
- Adjustment uses LEFT/RIGHT to move time; A opens a separate YES/NO confirmation. There is no separate hour/minute selection cursor in this handler.
- `Task_SetClock_AskConfirm` initializes the YES/NO menu with cursor position **1, NO**. In the confirmation handler, YES proceeds; NO or B returns to adjustment. Repeated A can therefore alternate between opening the question and declining it.
- `src/menu.c`: `struct Menu`, `sMenu`, `Menu_GetCursorPos`, `CreateYesNoMenu`, `Menu_ProcessInputNoWrapClearOnChoose`. Read the current cursor only when this menu belongs to the active clock confirmation phase; `sMenu` is reused across interfaces. Initialization to NO is an explanation, not a substitute for reading the live selection.
- `include/task.h`: active `gTasks` records and task data layout. Map function pointers and task addresses to the matching ROM before reading.

Useful observation fields: phase, current hours/minutes/AM-PM, selected YES/NO when the question is open, and input readiness. Do not report a confirmation selection while the clock is merely being adjusted.

## Naming keyboard

- `src/naming_screen.c`: `NamingScreenData`, `sNamingScreen`, `Task_NamingScreen`, `Task_HandleInput`, `GetCursorPos`, `GetKeyRoleAtCursorPos`, `GetCharAtKeyboardPos`, `GetTextEntryPosition`.
- Follow `currentPage` through `sPageToKeyboardId`; page-cycle order and keyboard-array order differ. Use the current keyboard's column count, including its side-button column.
- The text buffer is the name being edited, not yet the confirmed trainer name. The cursor sprite's `sX`/`sY` map to `data[0]`/`data[1]`; pixel coordinates alone are insufficient, especially on side buttons.
- `include/sprite.h`: sprite record layout, active/invisible flags, and data offsets.
- Input can be disabled during fades, page swaps, and exit. Use input-task/main-task state as appropriate instead of assuming a visible cursor means a press will be accepted.

## Screen programs, transitions, and ordinary menus

- `include/main.h`: `struct Main`, callbacks, state, key fields, and VBlank counters.
- `src/intro.c`: copyright and introductory movie callbacks.
- `src/title_screen.c`: title initialization, its main callback, and transitions into the main menu.
- `src/main_menu.c`: menu setup, input handling, and new-game flow.
- `src/menu.c`, `src/script_menu.c`, `src/start_menu.c`: menu cursors, option lists, confirmation semantics, and script-driven choices.
- `src/task.c`, `include/task.h`: tasks can identify UI phases inside a shared main callback.

Verify callback labels against both the matching function and a recorded frame. Initialization may already name the next program while the prior image or a fade remains visible. Avoid relabeling by a single screenshot or treating every unknown callback as overworld.

## Field movement, dialogue, and scripts

- `src/script.c`: `sLockFieldControls`, `LockPlayerFieldControls`, `UnlockPlayerFieldControls`, `ArePlayerFieldControlsLocked`.
- `src/field_control_avatar.c`, `src/field_player_avatar.c`: field input and player movement.
- `src/text.c`, `include/text.h`: text-printer state where dialogue phase is needed.

Field controls locked means direction presses cannot move the player; it does not uniquely identify dialogue versus a menu or script. Unlocking does not guarantee a tile is traversable. Read specific owners for the richer distinction the current task needs.

## Live map and objects

- `src/fieldmap.c`, `include/fieldmap.h`, `include/global.fieldmap.h`: `gMapHeader`, map layout, backup-map padding, collision/elevation/metatile masks, tilesets and attribute tables.
- `src/event_object_movement.c`: live object events, player-object identity, coordinates and flags.
- `src/field_control_avatar.c`: warps and field interactions.
- `include/constants/metatile_behaviors.h`: behavior enum meanings; follow behavior predicates for actual terrain semantics.
- `data/maps/*/map.json`, `data/maps/map_groups.json`: map identities and static definitions for reference/labels. They do not establish current NPC positions, mutable tiles, or script state.

## Save fields and Pokémon party

- `include/global.h`, `include/pokemon.h`: save-block and party/boxed-Pokémon layouts.
- `src/save.c`, `src/load_save.c`: save-block ownership and loading where applicable.
- `src/pokemon.c`: `GetSubstruct`, encryption/decryption and species/stat accessors. Follow the personality-dependent substructure order and XOR key; verify actual party values as well as synthetic permutations.
- `src/event_data.c`, `include/event_data.h`: game flags, variables and badges.
- `src/string_util.c`, `charmap.txt`: encoded text; unsupported characters must not silently become misleading names.

Save defaults during intro or an unconfirmed editor are not established player state. Use the owning phase to determine when fields become meaningful.
