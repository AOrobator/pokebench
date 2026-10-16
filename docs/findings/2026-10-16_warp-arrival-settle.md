# Warp arrival settle: task receipts and measured exit lengths (2026-10-16)

Reference: pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` (clean checkout at `/Users/user/dev/pokeemerald`). ROM: US SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7` (`$POKEBENCH_ROM`, read-only). No `.map`/`.sym` for code is checked in, so every address below comes from ROM bytes and a live probe, not from a guess.

## Game source

`src/field_screen_effect.c`:

- `DoDoorWarp` (515) locks field controls and creates `Task_DoDoorWarp` (677): door open, walk up, door close, then `task->func = Task_WarpAndLoadMap` (725).
- `DoWarp`, `DoDiveWarp`, `DoWhiteFadeWarp`, `DoTeleportTileWarp`, `DoMossdeepGymWarp`, `DoPortholeWarp`, `DoSpinEnterWarp` lock and create `Task_WarpAndLoadMap` (646): wait for the fade and the music, then `WarpIntoMap` + `CB2_LoadMap`.
- `FieldCB_DefaultWarpExit` → `SetUpWarpExitTask` (256–270) creates `Task_ExitDoor` (door metatile), `Task_ExitNonAnimDoor` (stairs/non-animated door) or `Task_ExitNonDoor`, then `LockPlayerFieldControls`. `Task_ExitDoor` (317) unlocks only after the weather fade-in, the walk down and the door-close animation task (`FieldAnimateDoorClose`) end; `Task_ExitNonAnimDoor` (366) after the fade-in and one walk step; `Task_ExitNonDoor` (404) after the fade-in.
- `sLockFieldControls` (`script.c:28`) = `0x03000F2C`, already read as `field_controls_locked`. gTasks = `0x03005E00` (`game_screen.TASKS`, 16 × 0x28, `func` at +0, `isActive` at +4).

## Address receipt (ROM literal pools, read-only)

| Function | Address (Thumb) | ROM evidence |
|---|---|---|
| `Task_ExitDoor` | `0x080AF439` | Only literal-pool word in the ROM: `0x080AF368`, inside `SetUpWarpExitTask` (the `IsDoor` branch). Function start `push {r4-r7,lr}` (`0xB5F0`). Directly follows `FieldCB_MossdeepGymWarpExit`, whose pool word `0x080AF434` is `Task_ExitNonDoor` (source order 310 → 317). |
| `Task_ExitNonAnimDoor` | `0x080AF551` | Only pool word `0x080AF394` (`SetUpWarpExitTask`). `push` `0xB5F0`. |
| `Task_ExitNonDoor` | `0x080AF611` | Pool words `0x080AF390` (`SetUpWarpExitTask`) and `0x080AF434` (`FieldCB_MossdeepGymWarpExit`): exactly the two `CreateTask(Task_ExitNonDoor, 10)` sites in the source. `push` `0xB530`. |
| `Task_WarpAndLoadMap` | `0x080AFA0D` | Exactly 8 pool words (`0x080AF768`, `…798`, `…7CC`, `…870`, `…8AC`, `…8D4`, `0x080AFBF0`, `0x080B025C`): the 7 `CreateTask(Task_WarpAndLoadMap, 10)` sites plus the `task->func = Task_WarpAndLoadMap` in `Task_DoDoorWarp` (its pool at `0x080AFBF0`). `push` `0xB570`. |
| `Task_DoDoorWarp` | `0x080AFA89` | Only pool word `0x080AF7F0`, inside `DoDoorWarp` (between the `DoWhiteFadeWarp` and `DoTeleportTileWarp` pools, matching source order 505 → 515 → 549). `push` `0xB570`. |

The five addresses are in the source's order (317 < 366 < 404 < 646 < 677). The door animation task (`0x080D487D`, priority 90, `field_door.c`) is not needed: both `Task_ExitDoor` and `Task_DoDoorWarp` stay live until it ends.

## Archived RAM (control-2919, real ROM)

Decoded from `runs/2026-10-15T23-47-41_qwen36-gpu0_2919/raw-ram/` (lock byte, live tasks, fade, black palette):

| State seq (archive) | Frame | Lock | Fade | Warp task (data[0] = state) | Next settled archive |
|---|---|---|---|---|---|
| 1383 (298) | 18729 | 1 | no | `Task_ExitNonAnimDoor` (state 1, dest 7,1) | 1392 (299): 2F (7,2), unlocked, no warp task |
| 2010 (427) | 24027 | 1 | no | `Task_ExitDoor` (state 1, dest 5,8) + door anim | 2020 (428): (5,9), unlocked |
| 2884 (553) | 32398 | 1 | no | `Task_DoDoorWarp` (state 2, walking up) | 2894 (554): LAB (6,12), locked, fade, `Task_ExitNonDoor`; 2900 (555): LAB (6,12), unlocked |
| 3165 (603) / 3166 (604) | 34993 / 34994 | 1 | no | `Task_ExitDoor` (state 2, dest 7,16) + door anim | 3174 (605): (7,17), unlocked |

Each held capture is one today's settle (`transitioning()`) passes at once: no fade, palette lit.

## Measured exit lengths (live, read-only per-frame probe)

Scratch tracer (vendor `EmeraldEmulator`, real ROM, `runs/launch-receipts/rival-push-checkpoint/CLOCK_SET.state` sha1 `51007c05…`), logging lock, live warp tasks, fade and black palette after every emulated frame. Frames are counted from the first locked frame to the first unlocked frame with no warp task:

| Warp | Chain | Frames | Of which lock + warp task with no fade/black |
|---|---|---|---|
| 2F → 1F stairs | `Task_WarpAndLoadMap` → black → `Task_ExitNonAnimDoor` | 75 (1083 → 1158) | 19 |
| 1F → 2F stairs | same | 74 (135 → 209) | 19 |
| House 1F → Littleroot door | `Task_WarpAndLoadMap` → black → `Task_ExitDoor` | 95 (136 → 231) | 40 |
| Littleroot → Birch's lab door | `Task_DoDoorWarp` (57 frames, no fade) → `Task_WarpAndLoadMap` → black → `Task_ExitNonDoor` | 124 (18 → 142) | 59 |
| Birch's lab → Littleroot | `Task_WarpAndLoadMap` (music stop) → black → `Task_ExitDoor` | 137 (12 → 149) | 40 |

Between the load task's end and the exit task's creation the palette is all black (the existing rule holds the waiter), so a single waiter is held through the whole chain.

Bound: `WARP_SETTLE_BOUND_FRAMES = 300`, about 2.2 × the longest measured chain (137), leaving room for longer music fades and weather fade-ins that were not measured. Lane speed in control-2919 / bundle-3f21 (raw-RAM frame and time stamps, gaps over 2 s): minimum 42.8 frames/s, median 47.6, so 300 frames is at most about 7 s, under the agent's 15 s observation fetch timeout (`game-tools.ts` `getJson(…, 15_000)`). The 20 s queue timeout only covers the queue drain before the observation and is unaffected.

The probe also showed a real script lock with no warp task: after the 2F → 1F stairs at this save, MOM's TV scene locks the player for several hundred frames with no warp task live; the settle captures that at once and keeps today's label.

## Remaining uncertainty

- Other warp kinds (escalator, spin, fall, Lavaridge gym, cable club, contest hall) use other tasks; they are not held by this switch beyond the existing fade/black rule.
- An arrival that starts a cutscene is held only until the exit task ends; the script lock then reads as today.
