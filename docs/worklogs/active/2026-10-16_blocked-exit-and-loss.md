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
- [ ] COMMIT GREEN

**M3 — measurements, explainers, pending experiments**
- [ ] Measurements on 54a7 and sh02 (when, how often, false positives)
- [ ] Explainers + FEATURE_EXPLAINERS + README; pages-check
- [ ] experiments/*.json pending + readiness rows

**M4 — review and hand-off**
- [ ] Principles self-review (PB1–PB13)
- [ ] Merge latest main; gates
- [ ] Claude, Grok, Codex LGTM on one frozen packet; report reviewed head SHA

## Closing the Loop

Report per item: switch id, before/after excerpts, measurements, tests and coverage, verdicts per lane, reviewed head SHA with main as ancestor, explainer paths, pending-experiment ids.

## Session Log

- 2026-10-16 05:54 AM EDT: branch from main 9e84ba4d; `just setup`, `just build`.
- 2026-10-16 06:05 AM EDT: offline reparse of 54a7 raw RAM (842 states): `gTrainerBattleOpponent_A` 535 during the T369–371 battle; ROM `gTrainers[535].trainerName` "MAY", class 50 (TRAINER_CLASS_RIVAL); `gTrainers` at 0x08310030 verified on ids 1 SAWYER, 520 BRENDAN, 529/535 MAY, 265 ROXANNE (opponents.h). sh02 (1434 states): MAY 535 battle T922–954 won, then RIVAL_BATTLE_WON.

## Surprises

- Won wild battles in 54a7 never show a non-ongoing `battle.outcome` in the recorded states; the lost MAY battle does (seq 8967–8980). Outcome stays "not read" when the game's outcome byte was never sampled.

## Multi-Model Review Log

(none yet)

## Boy Scout Log

(none yet)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog
