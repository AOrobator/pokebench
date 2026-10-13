# Transition state qualification and uncapped Think Fast gameplay

## Problem Statement
The operator explicitly corrected the experiment: no milestone cap. Only30minute/1500turn ceilings, objectivesOFF. Fix false native progress caused by transitional save data before restarting. Named interaction test remains fourOFF/fourON, normal full-progress prompt and no target stop, preserving all previous aborted/invalid cohorts.

## Skills Loaded
Game-state reference, story-milestones, agent-observability, patch-evaluation and feature-worklog. The explicit operator request authorizes repair; no extra approval inferred.

## Architecture
Production Python reader masks save-owned world state during field_transition and validates save pointers before dereferencing. Story reader independently refuses transitional flags. Shared native predicates reject field_transition, protecting target/objective/replay grading even with older raw contradictory logs. Stable states resume normal readout. No game writes, navigation injection or new per-turn refresh.

## Invariants
- INV-T1 Transition never establishes saved map/story completion. Production RAM fixture and actual bad event3165 replay fail before implementation.
- INV-T2 Unavailable is not zero/false/newgame. Model readout says loading/unavailable, fields nullable; stable genuine clock completion remains accepted. Test pointer bounds/read refusal and stable positive.
- INV-T3 Native observed evidence shared across scorer/target/objective/replay. Test false CLOCK_SET/rival/Petalburg, true clock, continued gameplay with no target.
- INV-T4 Correct user limits: new immutable presets targetnull,30m1500turn,objOFF, named interaction OFF/ON only difference. No automaticpromotion or secret replacements; previous cohort retained invalid/censored.

## Security Review
ROM outsidegit, vendor/reference pristine, isolated source. No local inference reviews. Shared main human-playthrough UI edits and previous frozen worktrees untouched.

## Milestones
- [ ] RED reader/predicate regression, source grounding.
- [ ] Repair, gates, deletion/restoration and native/replay proof.
- [ ] Independent review, landing, fresh no-target comparison visible8793.

## Closing the Loop
Exclude false archived split in qualified comparisons without rewriting logs. Record actual serving/build/config proof. Native milestones remain passive progress; none terminate new runs.

## Session Log
Prior cohort halted after three launches; first false native target, second true clock4:36.6, third censoredoperatorabort. New user explicitly removes milestone stop and authorizes bug fix. Repair checkout starts main d2d4122, unrelated UI WIP absent.

## Surprises
Initialized player object is not proof save-owned data is stable during field map loading. Actual flags flip false->true->false across seq3163/3165/3171; map switches temporarilyto0/0 and rival wins simultaneously.

## Multi-Model Review Log
Pending frozen repair. Claude usage limits/CLI timeout from prior round retained; use permitted external reviews/independent fallback, never local models.

## Boy Scout Log
No unrelated UI changes.

## Archive Milestone
- [ ] ASK USER: archive after completion.

RED: transitional RAM fixture forbids dereferencing save blocks; direct story reader and invalid pointer tests; native predicate tests coverclock/rival/town/starter/badge/name, stable completionpositive. Source731ad5b overworld.c CB2_LoadMap2 runs DoMapLoadLoop before CB2_Overworld; ResetMirageTowerAndSaveBlockPtrs invokes MoveSaveBlocks_ResetHeap. Native qualification must wait for stable field owner, not initialized player flag alone.

GREEN qualification:660 agent/235 viewer/510 Python tests; lint/build and90%per-metric coverage pass. Unknown-UI native recovery initially failed when gating on location; removed that extra restriction, preserving verified stable flags. Pointer-invalid/noninitialized states produce unknown StoryState. Nine effective guard deletion attempts red/restored green; redundant clock check deletion passed unexpectedly and was removed (receipt retained). Actual archived replay rejects CLOCK_SET3166,RIVAL_BATTLE_WON3167,PETALBURG_CITY3168 and accepts true CLOCK_SET1709; NativeTargetStop remains null on entire invalid old run. Fresh excluded native probe in progress. Future run config explicitly target:null,30m1500turns,objOFF.
