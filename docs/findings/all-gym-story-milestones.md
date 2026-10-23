# All-gym native story milestones

Reference: pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, US Emerald SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`. Reference checkout verified clean on 2026-10-23.

## Memory ownership

`gSaveBlock1Ptr` at `0x03005D8C`; flags at save1+`0x1270` (300 bytes), vars at +`0x139C`. These are the already verified production `story.py` / badge reader offsets. The new reader runs under the same frame/snapshot lock as the existing `read_game_state`. No independent live read and no game-memory writes. Invalid save pointer/alignment, transitions and uninitialized state do not establish completion. Flag bytes remain measurement-only; `StoryState.text()` and all model readout bytes are unchanged.

## Completion writers

- `RusturfTunnel_EventScript_Grunt`: trainer 16 is defeated by `trainerbattle_no_intro`. `ITEM_DEVON_GOODS` is returned before the final rescue flag. `FLAG_RECOVERED_DEVON_GOODS` is set only after Briney and Peeko depart; it represents the completed rescue scene, not merely starting the battle.
- `RustboroCity` return-goods employee script sets `FLAG_RETURNED_DEVON_GOODS` while leading the player into Devon; it means reported recovery, not delivery to Stern.
- `RustboroCity_DevonCorp_3F_EventScript_MeetPresident`: `giveitem ITEM_LETTER`, then `FLAG_RECEIVED_POKENAV`; the final `VAR_DEVON_CORP_3F_STATE=1` follows healing and the closing dialogue. Letter presence is a separate inventory observation, not inferred from the PokéNav.
- `RustboroCity` Match Call tutorial: `FLAG_HAS_MATCH_CALL` unlocks the feature; `FLAG_ADDED_MATCH_CALL_TO_POKENAV` starts the menu tutorial and does not prove completion. The exit sets `VAR_RUSTBORO_CITY_STATE=7`; later rival scenes set 8. Every writer uses the progression 0..8, with 7/8 after the tutorial exit.
- `GraniteCave_StevensRoom_EventScript_Steven`: `FLAG_DELIVERED_STEVEN_LETTER` after the native item handover, then `FLAG_REGISTERED_STEVEN_POKENAV` after registration.
- `SlateportCity_OceanicMuseum_2F_EventScript_CaptStern`: museum trainers each have their own victory flags; `FLAG_DELIVERED_DEVON_GOODS` is set after both victories, Archie dialogue, item handover and healing.
- `Route110` rival script: native trainer flag for one of six gender/starter variants (521,524,527,530,533,536). No assumption about the chosen starter or trainer gender.
- `MauvilleCity` Wally script sets `FLAG_DEFEATED_WALLY_MAUVILLE` after the battle dialogue. It is labeled scene completion, not the earlier battle-ending frame.
- Gym scripts `DewfordTown_Gym`, `MauvilleCity_Gym`, `LavaridgeTown_Gym_1F`, `PetalburgCity_Gym`, `FortreeCity_Gym`, `MossdeepCity_Gym`, `SootopolisCity_Gym_1F`: initial leader trainer IDs 266..272 (not rematches); completion flags `0x4F1..0x4F7`; badge flags `0x868..0x86E`; TM-received flags `0xA6..0xAC`. Each leader victory, post-battle gym-clear flag, badge handoff and TM receipt remains distinct. Petalburg Gym return is gated on the Heat Badge to separate it from the opening Wally tutorial visit.

## Catalog

| Milestone | Predicate |
|---|---|
| `ROUTE_116` | map [0, 31] |
| `RUSTURF_TUNNEL` | map [24, 4] |
| `RUSTURF_AQUA_GRUNT_DEFEATED` | flag `0x510` |
| `DEVON_GOODS_RECOVERED` | flag `0x8f` |
| `DEVON_GOODS_RETURN_REPORTED` | flag `0x90` |
| `DEVON_CORPORATION` | map [11, 2] |
| `STEVEN_LETTER_RECEIVED` | letter True |
| `POKENAV_RECEIVED` | flag `0xbc` |
| `DEVON_PRESIDENT_SCENE_COMPLETE` | devon_stage [1] |
| `MATCH_CALL_UNLOCKED` | flag `0x12f` |
| `MATCH_CALL_TUTORIAL_COMPLETE` | rustboro_stage [7, 8] |
| `DEWFORD_TOWN` | map [0, 11] |
| `DEWFORD_GYM_ENTERED` | map [3, 3] |
| `BRAWLY_DEFEATED` | flag `0x60a` |
| `DEWFORD_GYM_COMPLETE` | flag `0x4f1` |
| `KNUCKLE_BADGE` | flag `0x868` |
| `BULK_UP_RECEIVED` | flag `0xa6` |
| `GRANITE_CAVE` | map [24, 7] |
| `STEVEN_REACHED` | map [24, 10] |
| `STEVEN_LETTER_DELIVERED` | flag `0xbd` |
| `STEVEN_REGISTERED` | flag `0x131` |
| `SLATEPORT_CITY` | map [0, 1] |
| `STERN_SHIPYARD_ENTERED` | map [9, 0] |
| `OCEANIC_MUSEUM_ENTERED` | map [9, 7] |
| `STERN_MUSEUM_REACHED` | map [9, 8] |
| `MUSEUM_AQUA_GRUNT_1_DEFEATED` | flag `0x514` |
| `MUSEUM_AQUA_GRUNT_2_DEFEATED` | flag `0x515` |
| `DEVON_GOODS_DELIVERED` | flag `0x95` |
| `ROUTE_110` | map [0, 25] |
| `ROUTE_110_RIVAL_DEFEATED` | any trainer flag ['0x709', '0x70c', '0x70f', '0x712', '0x715', '0x718'] |
| `MAUVILLE_CITY` | map [0, 2] |
| `MAUVILLE_WALLY_DEFEATED` | flag `0xbe` |
| `MAUVILLE_GYM_ENTERED` | map [10, 0] |
| `WATTSON_DEFEATED` | flag `0x60b` |
| `MAUVILLE_GYM_COMPLETE` | flag `0x4f2` |
| `DYNAMO_BADGE` | flag `0x869` |
| `SHOCK_WAVE_RECEIVED` | flag `0xa7` |
| `LAVARIDGE_GYM_ENTERED` | map [4, 1] |
| `FLANNERY_DEFEATED` | flag `0x60c` |
| `LAVARIDGE_GYM_COMPLETE` | flag `0x4f3` |
| `HEAT_BADGE` | flag `0x86a` |
| `OVERHEAT_RECEIVED` | flag `0xa8` |
| `PETALBURG_GYM_ENTERED` | map [8, 1] after Heat Badge |
| `NORMAN_DEFEATED` | flag `0x60d` |
| `PETALBURG_GYM_COMPLETE` | flag `0x4f4` |
| `BALANCE_BADGE` | flag `0x86b` |
| `FACADE_RECEIVED` | flag `0xa9` |
| `FORTREE_GYM_ENTERED` | map [12, 1] |
| `WINONA_DEFEATED` | flag `0x60e` |
| `FORTREE_GYM_COMPLETE` | flag `0x4f5` |
| `FEATHER_BADGE` | flag `0x86c` |
| `AERIAL_ACE_RECEIVED` | flag `0xaa` |
| `MOSSDEEP_GYM_ENTERED` | map [14, 0] |
| `TATE_AND_LIZA_DEFEATED` | flag `0x60f` |
| `MOSSDEEP_GYM_COMPLETE` | flag `0x4f6` |
| `MIND_BADGE` | flag `0x86d` |
| `CALM_MIND_RECEIVED` | flag `0xab` |
| `SOOTOPOLIS_GYM_ENTERED` | map [15, 0] |
| `JUAN_DEFEATED` | flag `0x610` |
| `SOOTOPOLIS_GYM_COMPLETE` | flag `0x4f7` |
| `RAIN_BADGE` | flag `0x86e` |
| `WATER_PULSE_RECEIVED` | flag `0xac` |

## Historical projection and provenance

`backfill_story_progress` streams a bounded complete-line prefix, validates run/order and exact ROM plus raw archive hashes/layout, and writes `derived/story_progress.jsonl` atomically. A footer records prefix bytes/SHA-256, last event seq and row count. Viewer recovery verifies the original prefix, requires a row for each archived started state in that prefix, and independently decodes every attached row from its actual RAM. After the bound, an explicitly backfilled older live run continues recovery from newly recorded, hash-validated raw archives. Original events, frames and run metadata are never edited. Declared modern recordings do not receive missing-event repair.

Recovery uses first confirmed observation times (upper bounds), subtracts recorded pauses in the existing recording reader, and marks splits derived. Resumed true-at-start completions remain present_at_start and do not become earned splits. A prior known false is needed to earn an observed transition on a resumed run. Missing archives/evidence remain unsupported. New measurement events never enter model objectives or reset stall/supervisor clocks, including the historical progress-clock override switches.

## Native recorded proof

GLM 0d5d: Rusturf grunt #50987 T545; completed rescue #51076 T545; recovery reported #53986 T576; Devon arrival #53987 T576; letter #54103 T576; PokéNav #54128 T576; Devon scene #54185 T576; Match Call unlock #54695 T584; tutorial complete #55236 T595; Dewford arrival #93215 T844. Full archive references/hashes remain in the original state events and derived sidecar. Later gyms are source-grounded and synthetic-detector tested; this run has not provided native gameplay completion proof for those gyms.
