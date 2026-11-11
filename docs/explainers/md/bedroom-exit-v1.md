# Leave bedroom after the clock

> Markdown twin of [bedroom-exit-v1.html](../bedroom-exit-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Feature `bedroom-exit-v1` records a new split, **Leave bedroom** (`PLAYER_BEDROOM_EXITED_AFTER_CLOCK`). It fires the first time the player walks down from their bedroom after setting the clock. It sits on the frontier between **Clock set** and **Rival instruction**. It is measurement only: the model is never told about it.

## What the game records

![pret/pokeemerald 731ad5bf. PlayersHouse_2F_EventScript_WallClock sets VAR_LITTLEROOT_INTRO_STATE to 6 and FLAG_SET_WALL_CLOCK. The 1F map_script_2 VAR_LITTLEROOT_INTRO_STATE, 6 runs PetalburgGymReport, which sets 7. So state 6 on the 2F means the player has not left the room since the clock. The stairs are the only way off the 2F.](bedroom-exit-v1/fig-1.svg)

*pret/pokeemerald 731ad5bf. `PlayersHouse_2F_EventScript_WallClock` sets `VAR_LITTLEROOT_INTRO_STATE` to 6 and `FLAG_SET_WALL_CLOCK`. The 1F `map_script_2 VAR_LITTLEROOT_INTRO_STATE, 6` runs `PetalburgGymReport`, which sets 7. So state 6 on the 2F means the player has not left the room since the clock. The stairs are the only way off the 2F.*

## Why repeat trips do not count

![Recorded run 2026-10-16T00-15-59_qwen36-gpu0_6972, which loaded the Clock set save. The split fires at seq 116. Later trips up and down at 477–560 happen at intro state 7, so they never qualify. A run records each split at most once anyway.](bedroom-exit-v1/fig-2.svg)

*Recorded run 2026-10-16T00-15-59_qwen36-gpu0_6972, which loaded the Clock set save. The split fires at seq 116. Later trips up and down at 477–560 happen at intro state 7, so they never qualify. A run records each split at most once anyway.*

## The rules

| Situation | Leave bedroom |
|---|---|
| Fresh boot: set the clock, take the stairs | Recorded at the first settled 1F state |
| Clock set save that starts on the 2F at state 6 | Recorded when the player goes down |
| Save at intro state 7 (room already left) | Never |
| Stairs before the clock is set | Never |
| Rival's 2F to the player's 1F, or 2F straight to town | Never (same family's 1F only) |
| Loading or unknown screens | Skipped; they never count as the 2F or 1F state |

## Leave home, tightened

**Leave home** (`PLAYER_HOUSE_EXITED_AFTER_CLOCK`) already fired once per run. It now also refuses a save that starts inside home when the 1F state shows `VAR_LITTLEROOT_RIVAL_STATE` 2, 3 or 4. State 2 is set on entering the rival's bedroom, which needs leaving home first, so that save has already left once. A save that left and came back without reaching the rival's bedroom is still credited, because no game state records that trip.

## Never shown to the model

| Path | Leave bedroom |
|---|---|
| Prompts, next-milestone hint | Not listed |
| Stall stop, stall briefing, loop supervisor progress | Ignored (measurement-only set) |
| Objective record `recorded_native_milestones` | Filtered out (this also removes Back on Route 101) |
| STOP AT target, finals target | Refused, because the target is written into the model's goal |

## Older runs

The viewer derives Leave bedroom from recorded states for runs that predate `bedroom-exit-v1`, using the same rule. A run whose recorder declares the feature is never derived: a missing native event stays missing. A replay of 52 recorded runs from 2026-10-15/16 found the split in every run that left home, always before Leave home.

## Status

Tests, coverage and lint are green. Reviews: GPT (Codex) found the STOP AT target leak, which is fixed; grok LGTM. It is not merged and no measured runs have used it yet.
