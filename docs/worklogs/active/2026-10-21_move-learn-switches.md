# Move-learn switches (F1, F2, J1, J2, J3)

Approved by the operator 2026-10-21 03:04 UTC (11:04 PM ET Oct 20): "Let's build F1, F2, J1, J2, and J3 as individual switches and they all need to be on inside of the bundle and off in the control arm." Branch `claude/move-learn-switches`, worktree `.claude/worktrees/move-learn-switches`, based on local main d004be2d. Landing: coordinator merge slot, fast-forward only, Claude + Grok cloud LGTM (coordinator relay: Codex waived). No runs, GPU, viewer restart, push or PR.

## Problem Statement

Run `2026-10-20T20-26-22_qwen36-gpu1_97a0` (v6 bundle, read-only) evolved TORCHIC with evolution-decision-v1 at turn 777, then from turn 779 pressed B in a strict 4-turn cycle on COMBUSKEN's "learn DOUBLE KICK" flow for 100+ turns (analysis: `runs/reports/double-kick-loop/index.html`).

- Every press result was captured at MVSTATE 3 (PRINT_YES_NO, question still printing), so the model never saw the YES/NO box and the readout said "input not ready; no menu choice is open" (seq 32308, 32326 frames).
- B = NO at "Delete a move to make room for DOUBLE KICK?" asks "Stop learning DOUBLE KICK?"; B = NO there restarts the flow. The model said "answer NO to keep my current moveset" at both, also at turn 782/783 when the box was shown, and in battle with PECK (turns 755-769) where the battle readout showed the box correctly.
- The model never weighed DOUBLE KICK: nothing described it beyond its name. At ROXANNE (turns 715-716) it used EMBER "super effective against ROCK" although the game printed "It's not very effective…".

## Skills Loaded

feature-switch, pokebench-game-state, feature-explainer, experiment-queue, feature-worklog, close-the-loop, multi-model-review (cloud lanes only).

## Game grounding (pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881)

Evolution scene (src/evolution_scene.c, Task_EvolutionScene, tState 22 = EVOSTATE_REPLACE_MOVE; trade scene tState 20):

| MVSTATE | What it does | Next |
|---|---|---|
| 0/1/2 | print TRYTOLEARNMOVE1/2/3 (battle_message.c:61-63); 2 sets yes=5 no=10 (trade yes=5 no=9) | +1 |
| 3 | waits for printer 0 idle, draws YES/NO in window 12 | 4 |
| 4 | YES/NO input; A YES → yes state, A NO or B → no state | |
| 5/6 | summary-screen move select; cancel → 10 | |
| 10 (trade 9) | prints STOPLEARNINGMOVE "Stop learning\n{B_BUFF2}?"; yes=11 (trade 10) no=0 | 3 |
| 11 (trade 10) | prints DIDNOTLEARNMOVE | tState 15 |

In battle (data/battle_scripts_1.s:3155-3190): `yesnoboxlearnmove` (0x5A) asks "Delete a move to make room for X?" — YES opens the summary move select, NO/B falls through to "Stop learning X?"; `yesnoboxstoplearningmove` (0x5B) — YES prints "did not learn", NO/B jumps back to BattleScript_AskToLearnMove.

ROM (US f3ae0881, static reads): gMoveDescriptionPointers 0x0861C524, index move_id-1, 354 entries, one 0xFE break each. gBattleMoves 0x0831C898 (12 B), gMoveNames 0x0831977C, gSpeciesInfo 0x083203CC (types +6/+7). gMoveToLearn 0x020244E2. gBattleStruct->expGetterMonId +0x10 (battle_text.py:97).

## Architecture

| Switch | Side | Behavior ON | OFF |
|---|---|---|---|
| move-learn-settle-v1 (F1) | server, screen_settle | Observations wait, per emulated frame, while the evolution scene is in move learning and its input is not ready (not at the YES/NO box, not at a waiting text page), bounded in frames | capture at once, as now |
| move-learn-question-v1 (F2) | server readout | At a ready "Delete a move…?" / "Stop learning…?" box (evolution or battle): the question in the game's words and what YES and NO/B do | no line |
| move-learn-comparison-v1 (J1) | server readout | At those boxes and the summary forget-move screen: the four known moves and the new move with type, kind, power, accuracy, PP and the game's move description | no block |
| effectiveness-heard-v1 (J2) | agent wrapper | A record of what the game printed after the player's moves ("It's super effective!", "It's not very effective…", "It doesn't affect…"), by move and foe species, with turns; shown at battle decisions and learn prompts | no block |
| game-said-goals-v1 (J3) | agent wrapper | At learn prompts and the evolution decision: the trainer battles the game left open (latest lost or drawn, not won since), with the leader's POKéMON seen and the type lines said on that gym map (the story line is already in the harness-trust header) | no block |

All default off, on in the bundle arm of bundle-v-control, bundle-cook-1h and whole-map-cook-1h, off in control.

## Invariants

- INV-1: Each switch OFF is byte-for-byte today's readout/tool result. Test: OFF goldens.
- INV-2: F1 waits only on emulated frames, only while the evolution move-learning phase is not ready, bounded; never sleeps. Test: FrameSettle unit tests with a scripted reader.
- INV-3: F2 wording comes from the game's strings and yes/no states; no line unless the box is ready and the states are a known pair. Test: per-pair readout tests.
- INV-4: J1/J2/J3 state only game data or game text; nothing advises a choice. Test: fixtures assert exact text.
- INV-5: Production path honours each switch. Test: factory/route tests plus delete-the-guard receipts.

## Security Review

No new inputs, subprocesses, network or file access. Reads only ROM tables and writable RAM through the existing reader; text from enumerated constants and decoded game strings.

## Milestones

**M1–M3 — server switches: move-learn-settle-v1 (F1), move-learn-question-v1 (F2), move-learn-comparison-v1 (J1)** (one shared reader, `env/pokebench_env/move_learn.py`, so one RED/GREEN pair)
- [x] Fixtures: 9 raw-RAM archives copied from run 97a0 (`env/tests/env/fixtures/move-learn-*.json.gz`, provenance with sha256): evolution MVSTATE 2 printing/waiting, 3 printing (delete/stop), 4 box (delete/stop); battle learn_move/stop_learning_move boxes; summary_move_forget.
- [x] Tests: `env/tests/env/test_move_learn.py` (58: busy per recorded state, FrameSettle hold/bound/off/fade, production hook on/off, F2 exact lines ×4 and absences, trade/unknown pairs, J1 exact blocks for evolution/battle/summary, OFF byte parity per archive, state JSON unchanged, visible harness-bug line, registry); `packages/agent/src/move-learn-switches.test.ts` (registry, presets, server transport, dependency for all five); registry collateral in 60+ test files.
- [x] COMMIT: `test: move-learn settle, question and comparison readouts on the recorded DOUBLE KICK/PECK states; registry for five move-learn switches (RED)` (ed026660). RED: base has no `pokebench_env.move_learn` (ModuleNotFoundError at collection, checked against main bf0c3d48), and the registry tests name five switches the base lacks.
- [x] Implement: `move_learn.py` (busy predicate, question kind/line, comparison block, typed `MoveLearning`, text-only in GameState with a visible `HARNESS BUG (move learning)` line on any failed read); FrameSettle `move_learning` hook with its own bound and settle reasons (TS schema enum + regenerated schemas/events.v1.json); serve wiring; observation records the settle when the switch is on; registry for all five (J2/J3 registered default off, behavior in M4/M5).
- [x] Gates: `just lint` ok (tsc, eslint, ruff, format, mypy 104 files); `just build` ok; `just coverage` agent 3086 tests 97.18/93.01/97.6/99.17, viewer 1515 tests 95.26/91.06/94.24/97.83, pytest 3538 then 3546 with the failure-path tests, Python lines 97.17 branches 92.74 functions 100; move_learn.py 100% lines and branches.
- [x] COMMIT: `feat: move-learn-settle-v1, move-learn-question-v1 and move-learn-comparison-v1 wait for the YES/NO box, name the move-learning question and list the moves with the game's descriptions (default off)` (9c706e87)

**M4–M5 — agent switches: effectiveness-heard-v1 (J2), game-said-goals-v1 (J3)** (one RED/GREEN pair; both share the decision-screen helpers and the appended-part wrapper)
- [x] Fixtures from run 97a0 events: `packages/agent/src/fixtures/move-learn-97a0.json` (turn 153 WINGULL page, turns 715-716 EMBER pages, their states, the turn-716 battle decision and the turn-781 evolution move box) and `game-said-goals-97a0.json` (turn 714-717 states slimmed to the fields the folds read, gym guide page seq 28035).
- [x] Tests: `effectiveness-heard.test.ts` (player-only attribution, foe move ignored, other battle turn ignored, doubles skipped, no-effect wording, decision screens, wrapper on/off), `game-said-goals.test.ts` (ROXANNE block exact, evolution decision yes / battle decision and field no, a later win closes it, non-leader "sent out", empty, and a playGameTools factory test: ON appends both parts to observe and choose_evolution, OFF adds nothing).
- [x] COMMIT: `test: effectiveness-heard-v1 and game-said-goals-v1 on the recorded ROXANNE battle and DOUBLE KICK prompt (RED)` (de1b4c1c). RED: the modules do not exist (import failure at collection).
- [x] Implement: `effectiveness-heard.ts` (EffectivenessHeard fold, decision-screen helpers, shared appended-part wrapper over observe/press/navigate_to/battle_action/choose_evolution and semantic walks), `game-said-goals.ts` (BattleOutcomes + GymReadiness folds, open = latest trainer battle lost or drawn), GymReadiness exposes seenLine/saidOn/isLeaderMap (its own block byte-identical, gym-readiness tests unchanged and green), play-wiring wraps both around navigate-first so choose_evolution is covered.
- [x] Gates: `just lint` ok; `just coverage` agent 3099 tests 97.15/92.9/97.56/99.18 (both new modules 100%), viewer 1515, pytest 3546, Python lines 97.25 branches 92.96 functions 100.
- [x] COMMIT: `feat: effectiveness-heard-v1 records what the game said after the player's moves and game-said-goals-v1 lists the battles the game left open, at move choices (default off)` (79414255)

**M6 — bundle arms, pending experiments, explainers, review, land**
- [x] Bundle arms (3 definitions): each id in `switches` and `base.features: false`; control comes from the frozen controlBase (frontier-incumbent-4caa), which lacks them, so OFF. experiments/<id>.json ×5 (incumbent = bundle-v-control bundle arm with only that switch off; activation PETALBURG_WOODS for F1/F2/J1, STARTER_CHOSEN for J2, RUSTBORO_CITY_GYM for J3), readiness rows. open-goal-prompt.json and story-battle-heal-gate-v1.json incumbents follow the bundle arm (five ids true). Viewer test: bundle-only in all three, OFF in the next-run default.
- [x] Explainers ×5 (`docs/explainers/<id>.html`, README lines) + FEATURE_EXPLAINERS; panels/server tests per id; `just pages-check` clean; copied to main runs/mockups/<id>/, each 200 on 127.0.0.1:8791; question and goals pages opened in the browser. Registry copy for J2/J3 corrected to match the code (explainer agent caught the mismatch).
- [x] Delete-the-guard receipts: 16 guards deleted one at a time, each red, each restored (serve hook 1 fail; INPUT_STATES 2; waiting-text 1; readout wiring 11; comparison gate 9; question gate 4; rerender read gate 5; settle motion 4; J2 player-only 5; J2 single-foe 1; J2 same-battle-turn 1; J2 switch 1; J3 switch 1; J3 open filter 1; J3 decision-screen gate 1; play-wiring 1). Receipt: runs/move-learn-switches/mutations.txt (ignored).
- [x] Second sync: merged local main ec8f514b (navigation-refusal-reasons-v3, story-battle-heal-first-v1, pending-field-dialogue-v1); registry and fixed definitions re-applied on main's versions; story-battle-heal-first-v1 and pending-field-dialogue-v1 experiment incumbents declare the five ids (false). Gates: lint ok, build ok, agent 3246 (97.26/93.08/97.7/99.2), viewer 1532, pytest 3560 (97.25/92.95/100); fixed-cli check exit 0 on all three.
- [ ] Cloud review (Claude, Grok) LGTM on frozen packet
- [ ] Coordinator slot, ff-only merge, `just viewer-main` per coordinator

## Closing the Loop

- Gates after M6: `just lint` ok, `just build` ok, `just coverage` agent 3191 (97.2/92.94/97.62/99.19), viewer 1524 (95.26/91.1/94.24/97.83), pytest 3560 (lines 97.25 branches 92.95 functions 100).
- `fixed-cli check` through `main(["check", id])` with root = this worktree (start saves linked from the main checkout's ignored runs/launch-receipts): bundle-v-control, bundle-cook-1h, whole-map-cook-1h all exit 0; bundle switches list the five ids, control base unchanged.
- Readouts proven on nine raw-RAM archives from the recorded loop (production read_state + render). No live probe: long runs only for fixes (operator 2026-10-17); a decision probe at turn 783 is proposed to the coordinator.

## Session Log

- 2026-10-21: merged local main 951c8efa (70 commits: exit-labels-v3, navigation-tool-use-guard-v1, semantic-current-map-feedback-v1, short-cycle-fixed-point-v1). Registry collateral taken from main and re-applied (five ids after short-cycle-fixed-point-v1; server ids after exit-labels-v3); source conflicts in game_state.py/readout.py were import and list order only. Post-merge: agent 3191, pytest 3560, all green.

## Surprises

- Grounding agent flagged (inferred, untested): EvolutionGate.before_frame drops inputs at tState < 22 after a decision, which may stall on "learned"/"did not learn" text pages that wait for A/B in gDisplayedStringBattle. Out of scope; check during M1 tests.

## Multi-Model Review Log

- Round 1 (packet ec8f514b..e9b124e2, sha256 7c4d403a…): Grok (cursor-grok-4.5-high) BLOCKING on one finding: `archived()` in test_move_learn.py reloaded and re-hashed each raw archive per call; accepted, cached with @cache (fix delta). Hardening notes: unused PARTY constant removed (accepted); a waiter that starts on move_learning keeps its 600-frame bound if a fade follows (deferred: the YES path's fade to the summary screen must not release early, so upgrading to the 146-frame fade bound would be wrong; noted); no trade-scene raw fixture (deferred: no trade evolution in any recorded run; trade pairs covered by question_kind tests). Claude CLI lane: ~/.claude-review and default login both returned "OAuth session expired"; switching to the Cursor Claude harness (standing-authorized).
- Third sync: merged local main a38c8b72 (whole-map pair v8, card art) cleanly; gates: lint ok, build ok, agent 3246, viewer 1535, pytest 3560, coverage unchanged.

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER
