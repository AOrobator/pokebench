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

## M5.7 continuation: controls and live map (2026-10-12)

The labelled Claude snapshots were recovered from `scratchpad/snap` in the prior session. The byte at `0x03000F2C` is 0 in all five `free` snapshots and 1 in all four `dlg` snapshots plus `menu1`. `pret/pokeemerald/src/script.c` defines `sLockFieldControls` and its lock/unlock/query functions. A read-only ROM inspection through the server found the matching Thumb operations at `0x08098E54` (store 1), `0x08098E60` (store 0), and `0x08098E6C` (load byte), each referencing `0x03000F2C`. This ties the observed byte to the source control lock; no memory was modified. It is reported only in overworld, outside battle, and is not a claim that a particular direction is unobstructed.

Live map structures: `gMapHeader` at `0x02037318`; `gBackupMapLayout` at `0x03005DC0` contained width 26, height 23 and live buffer `0x02032318` in Brendan's 11×9 house. Source layouts in `include/global.fieldmap.h`, constants in `include/fieldmap.h`, and `src/fieldmap.c` confirm 7-cell padding, backup dimensions +15/+14, 10-bit metatile IDs, 2-bit collision, primary/secondary attribute tables split at 512, and object current coordinates +7. Active objects from `0x02037350` matched the screen: player (9,7), Mom (9,8), moving objects (3,3) and (4,5). Live warp records gave exit (8,8)/(9,8) to map 0/9 and stairs (8,2) to map 1/1. Out-of-map cells are unknown, not invented floor; NPC positions are live, not template positions.

Primary sources: https://github.com/pret/pokeemerald/blob/master/src/script.c ; https://github.com/pret/pokeemerald/blob/master/include/global.fieldmap.h ; https://github.com/pret/pokeemerald/blob/master/include/fieldmap.h ; https://github.com/pret/pokeemerald/blob/master/src/fieldmap.c . These are layout references; exact US addresses were checked live against the pinned ROM.

Fresh-boot gate `2026-10-12T00-59-33_probe_130f` completed all required intro checkpoints and first overworld truck: confirmed name AAAAAAA, map (25,40), position (2,2), ₽3000, empty party/badges, controls locked. Frame-by-frame evidence lives in that run's events/frames, outside git. This verifies the scripted intro and empty-party state; live nonempty party verification is still required before a full party-accuracy claim.

The continuation snapshot probe accepted and recorded presses but did not dismiss Mom's dialog. This remains a snapshot-resume observation, not proof of fresh-boot failure; the fresh-boot gate progressed normally. Probe-tagged logs are excluded from benchmark aggregates and rejected as baseline comparisons. Historical vendor state logs remain readable but are labelled unverified and withheld from the accurate trainer card.

### Naming keyboard (2026-10-12 operator follow-up)

The previous readout only named the screen. The editing buffer and cursor are now read from RAM, separately from the confirmed trainer name. `sNamingScreen` is at 0x02039F94; its text is at +0x1800, state at +0x1E10, page at +0x1E22, cursor sprite id at +0x1E23. Cursor coordinates are gSprites (0x02020630) + sprite id × 0x44 + 0x2E (signed data[0], data[1]). These offsets were matched to ROM instructions in NamingScreen_Init and the source layout. Unallocated pointers, inactive sprites or invalid page/coordinates return unavailable; phase 2 means input ready. Side buttons occupy the page's column count (8 letters / 6 symbols), rows 0 PAGE, 1 BACK, 2 OK. Text, page and selected key were checked in recorded probe `2026-10-12T01-36-53_probe_8884`: entered B and cursor (1,0), lower b after SELECT, symbol 1 after SELECT, and OK (6,2) after START.

Primary layout/behavior sources: [naming_screen.c](https://github.com/pret/pokeemerald/blob/master/src/naming_screen.c), [sprite.h](https://github.com/pret/pokeemerald/blob/master/include/sprite.h). The symbol/letter arrays describe the keyboard, not a scripted naming policy. No save data is synthesized.
