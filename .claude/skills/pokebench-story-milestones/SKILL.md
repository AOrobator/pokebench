---
name: pokebench-story-milestones
description: Define, implement, or audit PokeBench Pokémon Emerald story milestones using verified game-owned flags, script variables, and confirmed transitions, and trace their evidence through recording, replay, and split comparisons. Use for missing or inaccurate progress events; not for navigation solvers or automated gameplay.
---

# Story milestones from the game

The operator's instruction: Emerald is the source of truth for progress. Prefer the game's story variables and persistent flags for story milestones. Vendor labels, model narration, screenshots alone, and entering a nearby map do not establish that a story event completed.

Use [pokebench-game-state](../pokebench-game-state/SKILL.md) for source checkout, exact-ROM mapping, coherent memory snapshots, and recorded probes. Follow the repository's existing worklog and validation gates for runtime changes. This skill does not authorize new runs, navigation helpers, RAM writes, save manipulation, or vendor modifications.

## Keep the story frontier about progression

Only include events that advance the game or required location splits on that progression path in the story milestone catalog and its frontier graphs. An optional visit or conversation is a diagnostic event, not a story milestone: entering Birch’s lab early or talking to its aide does not unlock the initial story. Do not give optional detours progress credit or insert them into the frontier axis.

When auditing missing graph milestones, compare the human interface's shared split catalog and the qualified recording splits with the plotted axis. Render the full required progression sequence through the report's endpoint, rather than a handpicked summary that silently drops recorded story events. A narrow graph may thin axis labels, but must retain all plotted points and expose every checkpoint with exact times. Preserve missing-event gaps and keep optional activities separate.

For the opening rival sequence, expose the already-recorded `RIVAL_HOUSE_ENTERED`, `RIVAL_BEDROOM_REACHED` and `RIVAL_MET` splits. Keep location arrival distinct from completing the introduction. The upstairs Poké Ball triggers that encounter; touching it or starting dialogue does not establish `RIVAL_MET`. Grade the completed scene using the game-owned rival/town state. Verify the gender-mirrored scripts. Before adding a new milestone, check the native catalog and existing recordings so a missing graph label does not become a duplicate event.

## Choose the game's completion condition

Find the script or input handler that commits the event, then follow the flag or variable it changes. Distinguish starting an interaction from completing it. Prefer a persistent completion flag when available; for a script variable, inspect every relevant writer and establish which values mean completion. Do not assume that a larger value means more progress, or that a reused variable permanently records an event.

Some milestones have no dedicated story flag. Use the owning game transition instead of inventing one:

- **Player name confirmed:** follow the player naming handler and Birch’s subsequent name YES/NO confirmation. The editor copies text before that final question; completion occurs when `Task_NewGameBirchSpeech_ProcessNameYesNoMenu` accepts YES and advances to `Task_NewGameBirchSpeech_SlidePlatformAway2`. An edited buffer, default save name, or eventual start of overworld gameplay is a different event. Distinguish player naming from Pokémon or box naming.
- **First truck exit:** establish that the run was in the opening truck, then observe its confirmed exit transition. Starting a resumed run outside the truck does not prove this event happened during that run.
- **Clock set:** follow `PlayersHouse_2F_EventScript_WallClock` in `data/scripts/players_house.inc`. At the reference revision, it sets `VAR_LITTLEROOT_INTRO_STATE` to 6 and `FLAG_SET_WALL_CLOCK` after the setting interaction returns; state 7 follows the subsequent Mom conversation. Merely entering the bedroom or opening the clock is insufficient.

Other useful candidates include meeting the rival, rescuing Birch, receiving the Pokédex and running shoes, and defeating the Rustboro Gym. Follow their actual scripts and flags before defining predicates. Starter ownership and required location arrivals may remain useful progression splits, but keep them distinct from completed story scenes and earning the badge. Optional map visits belong in diagnostic history instead.

Consult `data/maps/LittlerootTown/scripts.inc`, `include/constants/vars.h`, `include/constants/flags.h`, `src/naming_screen.c`, and each event's calling script as needed. These symbols explain semantics; they are not verified RAM addresses. Record the reference revision and verify the running ROM as required by the game-state skill.

## Record evidence, not a proxy

Read the condition through PokeBench's existing memory owner and snapshot lock. Validate initialization and ownership. Missing, unreadable, or transitioning data is unknown, not false, zero, or complete. Existing observations can be reused when they already provide the verified variable; a nearby-trigger readout may stop exposing that variable after the player moves away.

Emit a milestone once at its first confirmed observation during the run. Keep enough provenance to trace it to the predicate, source revision/ROM, supporting state event or probe, and observed timestamp. Use the existing event contract and findings/worklog rather than silently expanding schemas. A first observed completion time is an upper bound when polling missed the exact transition.

Trace the same condition through the production reader, typed state, recorder, model observation, viewer replay, and split comparisons wherever the feature applies. A renderer-only label does not repair missing recording. Compare the named event's meaning across runs; do not silently equate an older proxy such as “gameplay started” with exact name confirmation.

## Audit vendor behavior and historical runs

Inspect the pinned vendor implementation before trusting a milestone. It may supply useful emulator or transport functionality while its milestone heuristic differs from the required event. Keep the vendor pristine; place verified adapters, readers, and detectors in PokeBench-owned code. Do not replace working vendor components solely because another component was inaccurate.

Historical recovery is permitted only when recorded game state proves the predicate. Keep original logs unchanged, identify recovered events and their supporting sequence IDs, and label first-observation timing. If the required value was never recorded, show unknown/not recorded; never fill it from the model's claim, a checkpoint filename, or proximity to the event.

## Verify completion and non-completion

Exercise the real detector and recording/replay path with paired frame and state evidence. For the targeted event, cover the pre-event state, an opened-but-unconfirmed interaction or canceled path when applicable, actual completion, repeated observations, and unavailable data. A fresh-start test must not pass merely because a resumed save already contains the completion flag.

Demonstrate that changing the relevant variable, flag bit, or confirmation phase makes the intended test fail, then restore the source. Record address/semantic proof and remaining uncertainty separately from synthetic test results. Report missing observability as a harness limitation, not as agent failure or game completion.
