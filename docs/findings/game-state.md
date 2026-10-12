# Game-state accuracy findings (M5.7)

The model's readout is its source of truth, so every field must match the game.

## Vendor readout errors (continual-harness @ pinned SHA)

The emulator's RAM is correct; the vendor's interpretation is not.

| Symptom | Cause | Seen |
|---|---|---|
| `Current Location: PETALBURG CITY` during Birch's speech and the naming screen | `is_in_title_sequence()` decides "in game" from a non-blank player name; the map ID is still (0, 0) before the overworld loads, and map (0, 0) is Petalburg City | think-swarm runs 2026-10-11, probe 2026-10-12 |
| `Player Name: STANLEY` / `MILTON` before the player names anyone | choosing a gender writes a random default name into SaveBlock2; `read_player_name()` returns any non-blank bytes | Qwen3.8 run `…23-54-54…_4e49`, probe |
| `PLAYER_NAME_SET` milestone fires at the naming screen | the vendor tracker (and our M4 guard) accept that default name | both models |
| `game_state` is `overworld` whenever no dialog is detected | `server/app.py:1393` forces it | code read |
| NPCs at static spots | the map's NPC source is porymap reference data, not live object events | M5 probe |
| player position from fixed addresses (`PLAYER_X = 0x02025734`) | Emerald moves its save blocks in RAM; only the `gSaveBlock1Ptr` pointer is stable | code read |

## Screens from `gMain.callback2` (US Emerald, gMain at 0x030022C0)

Labelled 2026-10-12 by pressing A from boot on an isolated server and saving a screenshot at every change.

| callback2 | Screen |
|---|---|
| 0x0816CEAD | copyright / intro movie |
| 0x0816CC01 | title screen |
| 0x080AA7A5, 0x080AAB2D | main menu |
| 0x0802F6B1 | Birch's speech (before and after naming) |
| 0x080E2E05, 0x080E4F59 | naming keyboard |
| 0x08085E5D (callback1 0x08085E05) | overworld |

Values not in this table are reported as `unknown (callback2 0x…)` and added once labelled.
