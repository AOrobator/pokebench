# Blocked exit fact, battle-loss recap, and battle outcomes in the briefing (three switches)

Dispatched 2026-10-16 05:54 AM EDT by the orchestrating thread for the operator. Branch `claude/blocked-exit-and-loss`, worktree `.claude/worktrees/agent-a585f1822472b6fc7`, cut from main 9e84ba4d. Local only: never push, no PR, no remote; the coordinator fast-forwards main to the reviewed head. Standing merge approval from the operator once Claude, Grok and Codex all LGTM and the gates pass. Review lanes are cloud only (Claude CLI or a read-only Claude sub-agent, cursor-grok-4.5-high, Codex gpt-5.6-sol). `experiments/fixed/bundle-v-control.json` belongs to another thread: not edited here. No runs or viewer started, restarted or stopped. Lane freeze until 10 AM: nothing sent to loopback inference endpoint/:[local inference port], no gameplay on 8075/8076; real-ROM checks are offline (raw RAM archives plus the ROM file).

The brief is the operator's approval of this worklog (delegated through the coordinator with the three items, their switches and their acceptance evidence spelled out).

## Problem Statement

Evidence (read-only): `runs/2026-10-16T04-51-03_qwen36-gpu0_54a7` (bundle arm, harness 6d2be8af).

- At OLDALE TOWN (map 0/10) the model walked to the west exit (1,10)->(0,10). `OldaleTown_EventScript_BlockedPath` (the footprint MANIAC) pushed it back about 96 times (T247–343) and 88 times (T396–484). The coordinate trigger at (0,10) runs while `VAR_OLDALE_TOWN_STATE` (0x4051) is 0; `OldaleTown_OnTransition` sets it to 1 only when `FLAG_ADVENTURE_STARTED` is set, which Birch sets when he gives the Pokédex. The readout already said `(0,10), elevation 3: variable 0x4051=0, needs 0; condition matches` (tool_result seq 6071, T248).
- Between the stretches the model fought MAY on ROUTE103 (T369–371) with TORCHIC at 3/21 HP, lost (state seq 8967 `battle.outcome` "lost", code 2), whited out and woke at LITTLEROOT TOWN BRENDANS HOUSE 2F (map 1/1, seq 8982), then went back to the west exit.
- The stall briefings at T418 (seq 10226) and T484 (seq 11729) say "Last story progress: route 103 at turn 347" and never mention the lost battle or the whiteout.

Three items, each its own switch, OFF byte-identical to today:

1. `briefing-battle-outcomes-v1` (bug fix; meant ON in both arms, like transition-loop-detection-v1): every supervisor briefing that shows "Last story progress" also states the latest battle against a story character (won or lost, who, where, turn) and the latest whiteout, from recorded game state.
2. `blocked-exit-fact-v1` (bundle arm, default off): a factual line when the player is on or next to a coordinate trigger the run has seen refuse an exit and its condition still matches in RAM, plus the map's other exits by the readout's own names.
3. `battle-loss-recap-v1` (bundle arm, default off): after a whiteout, or a lost battle against a trainer, a factual recap on every game result until the next story milestone.

Milestone check: `RIVAL_BATTLE_STARTED` / `RIVAL_BATTLE_DEFEATED` (route103-rival-splits-v1, the cook harness audit's proposal) landed on main at bf86cd9b as measurement-only milestones, read from `route103_rival` (opponent id in `RIVAL_TRAINERS` and their trainer flags). They are reused, not duplicated: no new milestone is added. They name no trainer and cover only the Route 103 rival, and 54a7/sh02 predate them, so the briefing and recap read a general trainer-opponent reading (below) that reuses route103_rival.py's verified addresses.

## Skills Loaded

feature-worklog, execute-worklog, feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state, pokebench-story-milestones; multi-model-review (local-inference-stack) for the review loop.

## Architecture

- **Measurement `trainer-opponent-v1` (no model-visible change):** `env/pokebench_env/trainer_opponent.py` reads `gTrainerBattleOpponent_A` (0x02038BCA, as route103_rival.py), the opponent's `gTrainers` entry in ROM (0x08310030, 0x28 bytes: class at +1, `trainerName[11]` at +4), its trainer flag (`TRAINER_FLAGS_START + id` in SaveBlock1 flags) and whether a trainer battle is active (`gBattleTypeFlags & BATTLE_TYPE_TRAINER`). Recorded on every state as `trainer_opponent` (null when the id is 0 or ≥ TRAINERS_COUNT 855). The readout text is unchanged. TS schema and `schemas/events.v1.json` gain the optional field.
- **`battle-outcomes.ts` (shared by items 1 and 3):** `BattleOutcomes` folds recorded state events into finished battles: map, turn, outcome (`battle.outcome` when the game wrote one; a trainer whose flag turns set after the battle is a win), the trainer when `trainer_opponent.battle_active`, and a whiteout (lost or drew, then the next overworld state on another map). Story character = trainer name in the character-presence list (`STORY_CHARACTERS`).
- **Item 1:** `SupervisorBriefing` (loop-supervisor.ts) gets one optional `BattleOutcomes` and one line insertion after "Last story progress" in each briefing. Kept to a few lines because `claude/briefing-and-rooms` edits the same file.
- **Items 2 and 3:** `withBattleFacts(tools, features, recorder)` (own module) wraps the game tools in `playGameTools` and appends a text part to observe/press/navigate_to results, like navigate-first's reminder. Item 2's `BlockedExits` and item 3's recap are event-driven classes so recorded runs replay through the same code.
- Blocked exit rule (ON): a call refuses an exit at trigger T when T is a coordinate trigger with a readable condition (variable ≠ 0, value read) that matches; T is an exit tile or next to one (a map-connection edge tile from `topology`, or a warp tile); the call started and ended on T's map in the overworld; it aimed at T (its first pressed direction faces T from the start tile, or navigate_to targets T or that exit tile); a script ran during the call (locked field controls, a dialogue or message, or auto-advanced pages); and it ended off T. Afterwards, any game result on that map with the player on or next to T (Manhattan ≤ 1) and T's condition still matching in that result's RAM gets the line. Exit names: connections as the readout prints them (`NORTH -> ROUTE103 (map 0/18)`), warps from the readout's own `Warp destination at (x,y): NAME` lines, else the bare map id.

## Invariants

- INV-1 OFF identity: with each switch off, prompt, tools, tool-result text and every briefing are byte-identical to today (recorded 54a7 briefings at seq 10226/11729 reproduce exactly). Test: OFF replays compare to the recorded bytes.
- INV-2 Facts only: no flag name, story step, destination advice or route. Test: the line texts are pinned exactly.
- INV-3 Grounded in RAM: the blocked-exit line needs the trigger's condition matching in the same result's state; the recap's "has not been defeated" needs the same trainer id's flag read in the same state. Test: condition false or another trainer id drops the claim.
- INV-4 No truncation: lists are complete.
- INV-5 Measurement field does not change the readout or loop fingerprints. Test: readout text equal with and without an opponent; loop-detection semantic state ignores the field.
- INV-6 Timing from game state only: no sleeps or polling added.

## Security Review

No new network surface, subprocess or file access in the harness. The new reader reads emulator memory and ROM through the existing reader. Offline analysis scripts read run artifacts read-only from the scratchpad.

## Milestones

The three switches share the trainer reading, the fixtures and the registry files, so they go RED together and GREEN together (one registry edit instead of three).

**M1 — RED (reader + three switches)**
- [x] Python `test_trainer_opponent.py` (ids, ROM name, class, own flag, trainer bit, null and out-of-range ids, missing terminator, short reads, state JSON field, readout unchanged); `test_readout.py` full-dict cases gain `trainer_opponent: None`
- [x] `briefing-battle-outcomes.test.ts`: 54a7 OFF reproduces seq 10226/11729 byte for byte; ON inserts exactly the loss and whiteout lines after "Last story progress"; seq 6785 says none; sh02 win; BattleOutcomes unit rules; loop-guard and text-only factories; registry
- [x] `blocked-exit-fact.test.ts`: 54a7 T246 none, T247/T248/T249 exact line, condition false, two tiles away, unnamed warp, feature-dependent exit lists, whole-fixture placement check, synthetic rules (navigate_to, constant variable, no script, map change, on the trigger, away, warp exit, inner trigger, battle), playGameTools factory ON/OFF, registry
- [x] `battle-loss-recap.test.ts`: 54a7 pinned from T371 until FIRST_POKECENTER_HEAL, defeat claim from the result's own RAM, sh02 never, rules (wild whiteout, milestones, same-map trainer loss, wins/runs, later loss, peek before the state is recorded), factory ON/OFF, registry
- [x] Fixtures `packages/agent/src/fixtures/battle-facts-{54a7,sh02}.jsonl.gz` (trimmed, trainer_opponent reparsed from raw RAM; see `test-support/battle-facts.ts`)
- [x] COMMIT: `test(RED): blocked-exit-fact-v1, battle-loss-recap-v1, briefing-battle-outcomes-v1 and the trainer-opponent reading` (73b8de4e). Fails at import (3 vitest files, 1 pytest collection error).

**M2 — GREEN**
- [x] `env/pokebench_env/trainer_opponent.py` (reuses route103_rival.py's verified addresses), `trainer_opponent` on GameState and in state JSON; events.ts schema field + `just schema`; `trainer-opponent-v1` measured (after route103-rival-splits-v1 in MEASUREMENT_FEATURES, FEATURES and playHarnessFeatures, as that one was added)
- [x] `battle-outcomes.ts` (BattleOutcomes: briefingLines, recap with a non-committing peek at the result's own state); SupervisorBriefing: one field, one observe line, `lastProgress()` appends the two lines (5 changed lines in loop-supervisor.ts); `blocked-exit-fact.ts` (BlockedExits); `result-facts.ts` (`withResultFacts`, outermost in `playGameTools`, one line in play-wiring.ts)
- [x] Registry: three switches appended (SWITCHABLE_FEATURES, FEATURES, playHarnessFeatures); presets Optional + normalize false + flagFeatures false; DEFAULT_NEXT_RUN false; positional registry asserts +3 (shift script), observation 26→28, guard 12→13, switchboard rows 70→73, legacy list gains trainer-opponent-v1 (native-target-stop slice 32→33); test_displayed_place_names pops the new null key like route103_rival
- [x] Design change from the 54a7 measurement (before this commit): a tile can hold two coordinate events (Littleroot (11,1): town state 0 NeedPokemon and state 1 GoSaveBirch), so refusals are keyed by the trigger's own identity (tile, variable, value, script), not the tile; and a try that spans two calls (navigate_to ends standing on the trigger inside its script, the next press finishes the push-back) is credited to the trigger the player stood on, never a neighbour.
- [x] Wiring-deletion checks (scratchpad receipts): `wiring-del-1-briefing-observe.log` (SupervisorBriefing stops feeding BattleOutcomes: 2 of 13 red), `wiring-del-2-playGameTools.log` (playGameTools without withResultFacts: 2 of 25 red, both factory tests). Restored; 45/45 green.
- [x] Gates: `just test` agent 1613, viewer 901 passed; pytest 2250 passed, 34 failed. The 34 are main's own (route103_rival.py:41 KeyError 0x02038BCA in recorded RAM windows of test_battle_message_waiting, test_in_game_naming, test_offscreen_objects, test_connection_edges, test_rerender), as the briefing-and-rooms thread logged for main 1f4ac74e; none touch this change. `just coverage`: agent 97.90 st / 94.63 br / 98.22 fn / 99.16 ln; viewer 95.32 / 91.11 / 93.62 / 97.62; Python (gate run by hand on the same .coverage.json because pytest exits 1 on the 34) lines 97.32 / branches 93.12 / functions 100; trainer_opponent.py 100%, result-facts.ts 100/96.66/100/100. `just lint`: tsc + eslint clean, ruff clean, mypy clean with the main checkout's venv (this worktree's venv lacks the mgba binding: the known memory_reader.py import). `just build` ok. Vendor submodule initialized in the worktree at the pin bbab97ad.
- [x] COMMIT: `feat(GREEN): blocked-exit-fact-v1, battle-loss-recap-v1, briefing-battle-outcomes-v1 and trainer-opponent-v1` (dfd4a4a6)

**M3 — measurements, explainers, pending experiments**
- [x] Measurements (replays `packages/agent/test-support/measure-result-facts.ts` and `measure-briefing.ts` over the raw events.jsonl, with trainer_opponent reparsed offline from each state's raw RAM; outputs in the session scratchpad `m54a7.jsonl`, `msh02.jsonl`, `b54a7.jsonl`, `bsh02.jsonl`):
  - briefing-battle-outcomes-v1: every recorded supervisor note rebuilt OFF equals the recorded message (54a7 11/11, sh02 11/11). ON: 54a7 notes at T418 (seq 10226), T484 (11729), T563 (12904), T609 (14273) gain "you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 371" and the whiteout to GREE's HOUSE 2F (map 1/1); the 7 earlier notes say none. sh02 notes at T1061, T1086, T1091 gain "you won against MAY (trainer 535) on ROUTE103 (map 0/18) at turn 954"; whiteout none. No false positives.
  - blocked-exit-fact-v1: 54a7 220 of 655 game results: LITTLEROOT TOWN NORTH -> ROUTE101 33 results T82–T114 (17 refusals, LittlerootTown_EventScript_NeedPokemonTrigger, the TWIN, town state 0, ends at RIVAL_MET T155), OLDALE TOWN WEST -> ROUTE102 187 results T247–T484 (94 refusals; none T344–T394 while on Route 103 / the MAY battle / Littleroot). sh02 1 of 1100: Brendan's house 1F door (8,8) at T59 (GoSeeRoom, intro state 4). All checked against the scripts: no false positives. T248 line as shown in the explainer.
  - battle-loss-recap-v1: 54a7 238 of 655 results, T371 (the whiteout result, seq 8983) to T610, ends at FIRST_POKECENTER_HEAL (T611); sh02 0 of 1100 (won). No false positives.
- [x] Condition proof (offline, 54a7 state seq 6070 raw RAM + ROM): ROM coord-event table via gMapHeader `(0,10) elevation 3 var 0x4051 value 0 script 0x081E903F`; script bytes `69 4f ff 00 … 4f 03 00 … 51 00 00` = lockall, applymovement PLAYER PlayerStepBack (delay_8, walk_right), applymovement 3, waitmovement (data/script_cmd_table.inc) = OldaleTown_EventScript_BlockedPath; saved 0x4051 = 0, FLAG_ADVENTURE_STARTED (0x74) unset.
- [x] Explainers `docs/explainers/{briefing-battle-outcomes-v1,blocked-exit-fact-v1,battle-loss-recap-v1}.html` (trainer-opponent-v1 maps to the briefing one), README, FEATURE_EXPLAINERS, panels test (card links + quoted lines), server route list; `just pages-check` silent; opened in the browser pane.
- [x] Delivery: `result-facts.test.ts` runs the pinned pi `runAgentLoop` against a local fake gateway (ephemeral 127.0.0.1 port): the second chat request's tool message carries the readout and the recap. The recorder joins content parts with "\n", so the recorded tool_result text ends with the line (factory tests assert the same join).
- [x] Pending experiments `experiments/{briefing-battle-outcomes,blocked-exit-fact,battle-loss-recap}.json` (no queuePosition; provisional source.commit dfd4a4a6; blocked-exit-fact's incumbent adds world-destinations-v1 ON); `experiment-cli check`: ok 69; readiness rows PENDING (the worktree's `just experiments` lists the main checkout's entries).
- [x] Gates: agent 1614, viewer 902, pytest 2250 passed / 34 failed (main's route103_rival KeyError, unchanged); lint clean (mypy clean here too); build ok.
- [x] COMMIT: `docs: explainers, pending experiments and readiness rows …` (609772b8)

**M4 — review and hand-off**
- [x] Merged main 5b93cda4 (disproved-beliefs-v1, same-plan-breaker-v1, levelup-box-v1, briefing-exits-v1, untaken-exits-v1, dynamic frontier, worklog archive). Resolution: every conflicted registry/test file taken from main and this branch's insertions re-applied by script (scratchpad `reg2.py`, `preset2.py`, `ls2.py`, `fixtests2.py`, `viewerwire2.py`, `shift.py`): the three switches appended after `untaken-exits-v1` (SWITCHABLE_FEATURES, FEATURES, playHarnessFeatures), trainer-opponent-v1 after route103-rival-splits-v1; presets/flagFeatures/DEFAULT_NEXT_RUN; loop-supervisor.ts gets the same 5-line insertion on top of main's briefing-exits-v1 code (lastProgress() still appends the two lines; briefing-exits only reorders lines ahead of it); playGameTools wraps `withResultFacts` outermost around main's withUntakenExits/withNavigateFirst chain; positional registry asserts +3 (also in main's new disproved-beliefs, same-plan, levelup-box tests); observation 28→30, guard 14→15, switchboard rows 75→78; briefing-exits.test BASE and untaken-exits.test OFF pin this branch's switches off (they assert today's briefing/tool identity); README, FEATURE_EXPLAINERS, server route lists and readiness rows keep both sides; schema regenerated; the three experiment entries regenerated so their incumbents name every registry switch in order (the five new ones false).
- [x] Gates on the merge: agent 1728, viewer 915, pytest 2311 passed (main fixed its route103_rival KeyError tests); coverage agent 97.97 st / 94.52 br / 98.46 fn / 99.11 ln, viewer 95.32 / 91.12 / 93.63 / 97.62, Python lines 97.37 / branches 93.23 / functions 100 (gate passes through `just coverage`); lint clean; build ok; verify-vendor OK; pages-check silent; experiment-cli check ok 70. Measurement replays unchanged (54a7: 11/11 notes OFF-identical, 220 blocked-exit lines).
- [x] COMMIT: `Merge main into claude/blocked-exit-and-loss` (62d029c6)
- [x] Merged main be428cdb (people-ledger-v1 and its bundle membership). Same procedure: conflicted files from main, insertions re-applied after `people-ledger-v1` (scratchpad `reg2.py`, `preset2.py`, `viewerwire3.py`, `fixtests3.py`, `shift.py`; play-wiring wraps withResultFacts outside main's withUntakenExits(withPeopleLedger(...)) chain); observation 29→31, guard 14→15, switchboard rows 76→79; people-ledger.test positional assert +3; experiments regenerated (people-ledger-v1 false in the incumbents). Gates: agent 1746, viewer 915, pytest 2313 passed; coverage agent 98.00 / 94.54 / 98.49 / 99.12, viewer 95.32 / 91.12 / 93.63 / 97.62, Python 97.37 / 93.23 / 100; lint clean; verify-vendor OK; experiment-cli check ok 70.
- [x] Principles self-review (PB1–PB13): 13 rows, 0 FAIL (table below)
- [ ] Merge latest main; gates
- [ ] Claude, Grok, Codex LGTM on one frozen packet; report reviewed head SHA

## Closing the Loop

Report per item: switch id, before/after excerpts, measurements, tests and coverage, verdicts per lane, reviewed head SHA with main as ancestor, explainer paths, pending-experiment ids.

## Session Log

- 2026-10-16 05:54 AM EDT: branch from main 9e84ba4d; `just setup`, `just build`.
- 2026-10-16 06:05 AM EDT: offline reparse of 54a7 raw RAM (842 states): `gTrainerBattleOpponent_A` 535 during the T369–371 battle; ROM `gTrainers[535].trainerName` "MAY", class 50 (TRAINER_CLASS_RIVAL); `gTrainers` at 0x08310030 verified on ids 1 SAWYER, 520 BRENDAN, 529/535 MAY, 265 ROXANNE (opponents.h). sh02 (1434 states): MAY 535 battle T922–954 won, then RIVAL_BATTLE_WON.

## Principles self-review (PB1–PB13), head before sealing

| ID | Score | Evidence |
|---|---|---|
| PB1 | PASS | No milestone or grading code changed. The briefing and recap read game-owned state (battle.outcome, gTrainerBattleOpponent_A, the trainer flag, map ids); RIVAL_BATTLE_STARTED stays measurement-only and is reused, not duplicated. The recap ends on a counted story milestone (kind story, not measurement-only), from recorded milestone events. |
| PB2 | N/A | No run accounting or stop reasons touched. Measurements report every result of both runs, including the ones without a line. |
| PB3 | PASS | No improvement is claimed. Measurements are replays of two recorded runs; the pending experiments carry the hypotheses; only the operator approves runs. |
| PB4 | PASS | Every model-visible change is behind its own registered switch, recorded in harness_features when on. The new RAM reading is declared as measurement `trainer-opponent-v1` (recorded on every new run). Vendor untouched (`just verify-vendor` OK). No game memory writes. |
| PB5 | PASS | One switch per item, each with its own pending experiment whose candidate flips only that switch; blocked-exit-fact's incumbent adds world-destinations-v1 with the reason in notes. |
| PB6 | PASS | Each line is one bounded sentence set per result; the exits list is bounded by the map's exits; nothing is truncated (operator rule). The recap repeats on every result of its span (238 in 54a7, about 250 chars each): stated in the explainer. |
| PB7 | PASS | The lines are part of the tool_result text the recorder writes (content parts joined); briefing lines are inside the recorded loop_guard message. Measurements read only events.jsonl and raw-ram archives. |
| PB8 | N/A | No tool schema, retry or model-output handling changed. |
| PB9 | PASS | Design calls made from evidence and recorded in Architecture: refusal learnt by trying (not a static script table); story character by ROM trainer name in the character-presence list; recap ends at the next counted story milestone. Open questions are listed for the operator in the hand-off, not silently defaulted. |
| PB10 | PASS | No test skipped or weakened; floor 90 unchanged; no exclude widened; pre-commit hook on every commit. Positional registry asserts were moved by exactly the three appended ids; two tests that assert today's identity (briefing-exits BASE, untaken-exits OFF) pin the new default-off switches off, as earlier switches did. |
| PB11 | PASS | Delivery proven through the pinned pi `runAgentLoop` against a local fake gateway; gTrainers/opponent/flag addresses checked on the real ROM via raw RAM archives (SAWYER, ROXANNE, BRENDAN, MAY); the (0,10) script bytes decoded with pokeemerald's script_cmd_table opcodes. |
| PB12 | PASS | The ROM was read only from `~/.roms/pokemon-emerald.gba` (the POKEBENCH_ROM path, outside TCC folders) by offline scratchpad scripts; never copied or staged. |
| PB13 | PASS | RED and GREEN commits with worklog updates, gates recorded, explainers and pending experiments in the change, review loop below. |

## Surprises

- Won wild battles in 54a7 never show a non-ongoing `battle.outcome` in the recorded states; the lost MAY battle does (seq 8967–8980). Outcome stays "not read" when the game's outcome byte was never sampled.

## Multi-Model Review Log

- Round 1 (frozen be428cdb..3282f175, packet sha256 68b0d83a…b8c4; readable copy without fixtures ea4b4008…5ef65a6; boundary and principles in `runs/review-blocked-exit/`). Lanes in parallel, Grok and Codex bounded at 2700 s by a Python subprocess, stdout/stderr separate; packet digest and clean status verified after.
  - Claude (read-only Claude sub-agent, opus; the operator-approved Claude lane): **VERDICT: LGTM**. Non-blocking: (1) a press with A after the direction could blame a conversation on the trigger; (2) a two-tile connection edge with one trigger is called blocked; (3) no recorder guard for the new field; (4) an already-set flag could read as a win; (5) "a value the game saves" also covers VAR_TEMP; (6) overworld-poison whiteouts are not detected.
  - Grok (cursor-grok-4.5-high, `cursor-agent --mode ask`): **VERDICT: BLOCKING**: the replay tests re-read and re-parse the fixture per call and look states up with `events.find` inside the replay loop (superlinear setup). Hardening: semanticState assert; the 16-call eviction test was not observable; the recap factory test stripped map ids.
  - Codex (gpt-5.6-sol, `codex exec --ephemeral --sandbox read-only`): **VERDICT: BLOCKING**: (1) a win inferred from a flag that was already set before the battle, before the blackout check; (2) the same fixture runtime shape as Grok; (3) no schema-path proof for `trainer_opponent` and no loop-fingerprint test for INV-5; (4) the wiring-deletion receipts were in the session scratchpad, not readable.
  - Taken (all blockers, plus Claude 1 and 4 and the hardening notes): fixtures cached per worker and states indexed by seq once (`test-support/battle-facts.ts`), the factory replay indexes calls/results/positions once; a win needs the trainer's flag unset during the battle and set after, and a blackout is checked first (tests for a pre-set flag with and without a blackout); `parseGameState`/`checkEvent` path and out-of-range/extra-key rejection tests, and `semanticState` equal with and without the field; press tries must be directions only (A/B batches are conversations); a pressless call (observe) no longer drops a two-call try (found by self-review; test fails without it); eviction test made observable; factory tests keep bounded navigation on (observe + checked press base) and pin the full recap. Seven uniquely named break/restore receipts with source hashes: `docs/findings/2026-10-16_blocked-exit-and-loss-wiring/` (del1–del7, each red, restored hash equal, green). Feature copy and explainers updated for the two rule changes. Measurements unchanged (54a7 220 / 238, sh02 1 / 0).
  - Not taken (recorded as follow-ups for the operator): Claude 2 (wide edge coverage; the measured case is true), 3 (recorder guard), 5, 6. These add behaviour beyond the frozen boundary.
  - Gates after the fixes: agent 1752, viewer 915, pytest 2313 passed; coverage agent 98.00 / 94.57 / 98.49 / 99.12, viewer 95.32 / 91.12 / 93.63 / 97.62, Python 97.37 / 93.23 / 100; lint clean; pages-check silent.
  - COMMIT: `fix: review round 1 …` (8c6ad305). Merged main 9e27986a (viewer workbench store only, no conflicts) as 4816d24e. Gates on the merge: agent 1752, viewer 925, pytest 2313 passed; coverage agent 98.00 / 94.57 / 98.49 / 99.12, viewer 95.32 / 91.09 / 93.68 / 97.63, Python 97.37 / 93.23 / 100; lint clean.
- Round 2: the full packet main 9e27986a..head and the round-1 fix delta 3282f175..head, to all three lanes.
  - Round 2 (frozen 9e27986a..742a1fc8, packet sha256 a4fc0539…3247, readable decca81a…ff88, fix delta a8d6b473…78bd): Grok **VERDICT: LGTM**; Codex **VERDICT: LGTM**; Claude sub-agent **VERDICT: BLOCKING** (required-evidence gap): the INV-5 fingerprint test compared null with null, because `IN_GAME` has no `field_controls_locked` and semanticState returns null for it. Taken: the test now uses free field controls, asserts a non-null fingerprint, runs with interactions off and on, and checks a money change does change it; receipt `del8-fingerprint-ignores-field.log` (adding the field to semanticState turns it red; restored hash equal; green). Not taken (non-blocking notes): a stale pending after an evicted before state; a press batch starting on a trigger tile with A then a step.
  - Gates: agent 1752, viewer 925, pytest 2313 passed; lint clean.
- Round 3: full packet main 9e27986a..head and the round-2 fix delta, to all three lanes.
  - COMMIT: `test: review round 2, the trainer_opponent fingerprint test …` (153a879f).
  - Round 3 (frozen 9e27986a..153a879f, packet sha256 0d1253ce…4a36, readable ec334b3f…3308, delta 0ba051e0…73d9): Grok **VERDICT: LGTM**; Claude sub-agent **VERDICT: LGTM** (INV-5 gap closed); Codex **VERDICT: BLOCKING**: (1) `aimed()` still counted any press that began on the trigger (the frozen Architecture names only a facing direction-only press or navigate_to), and the test asserted that A from the trigger was a refusal; (2) the new panels test read explainer files inside its row loop (four reads, three files). Taken: the standing-on rule is gone (a try that began by stepping onto the trigger is the existing two-call pending path); the test now asserts A or B from the trigger with a script moving the player is no refusal; receipt `del9-no-standing-rule.log` (restoring the rule turns it red; hash equal; green); the panels test reads each unique explainer once before the rows. Feature copy and explainer flow updated. Measurements unchanged (54a7 220, sh02 1).
  - Gates: agent 1752, viewer 925, pytest 2313 passed; coverage agent 98.00 / 94.57 / 98.49 / 99.12, viewer 95.32 / 91.09 / 93.68 / 97.63, Python 97.37 / 93.23 / 100; lint clean; pages-check silent.
- Round 4: full packet and the round-3 fix delta, to all three lanes.
  - COMMIT: `fix: review round 3 …` (b014b118).
  - Round 4 (frozen 9e27986a..b014b118, packet sha256 0b0ad5a5…5d99, readable 44628050…8f00, delta 3d1f13e0…ee2b): Grok **VERDICT: LGTM**; Claude sub-agent **VERDICT: LGTM** (both round-3 items fixed; the removed branch never fires on either fixture); Codex **VERDICT: BLOCKING**: BattleOutcomes fixed `trainerBattle` from the first in-battle state, so a trainer battle first seen initializing (battle_type null) lost its trainer classification and a same-map trainer loss pinned no recap. Taken: any in-battle state with the trainer bit or an active trainer opponent marks the battle a trainer battle; test with an initializing first state (with and without the opponent reading); receipt `del10-trainer-battle-promotion.log` (removing the promotion turns 2 tests red; hash equal; green). Measurements unchanged (54a7 recap 238; sh02 0; sh02 briefings 11/11 OFF-identical).
  - Gates: agent 1753, viewer 925, pytest 2313 passed; coverage agent 98.00 / 94.58 / 98.49 / 99.12, viewer 95.32 / 91.09 / 93.68 / 97.63, Python 97.37 / 93.23 / 100; lint clean.
- Round 5: full packet and the round-4 fix delta, to all three lanes.

## Boy Scout Log

(none yet)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog
