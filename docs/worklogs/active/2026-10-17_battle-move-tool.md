# Battle move tool (battle-move-tool-v1)

## Problem Statement

The operator (2026-10-17): "instead of showing the button path for each battle move … have tool calls for the battle. Like, just like battle select move … pass in the appropriate arguments … Maybe that'll be more reliable."

Evidence:
- Run `2026-10-17T13-15-36_qwen36-gpu1_e046`, seq 16607-16772 (turns 593-597): five turns in a row the model thought "I will use Ember" and pressed A, RIGHT, A, A. The move cursor sat on SCRATCH (0 PP), so RIGHT highlighted GROWL; the battle journal recorded GROWL five times while TORCHIC fell from 8 to 2 HP. EMBER is the bottom-right slot.
- Run `2026-10-17T11-15-07_qwen36-gpu0_0e05`, turns 770-861: in a trainer battle the model pressed LEFT, LEFT, DOWN, DOWN, A from RUN (LEFT reaches POKéMON; the rest do nothing), opened the party screen, backed out with B, and repeated for 92 turns.

## Measurements (all 288 recorded runs, read-only; scratch script, numbers below)

- 1227 moves the player selected (battle_choice, origin selected). 797 follow model text naming one of the active Pokémon's moves ("use EMBER"). 34 of those 797 (4.3%) committed a different move: 0e05 8, e046 7, f551 4, 4495 4, eae2 4, 230d 3, 7a95 2, c497 1, 93eb 1.
- 8 stretches of 5+ press/navigate_to calls while the action or move menu waited, with no choice committed: 108 calls; the longest is 0e05 T768-863 (64 calls in the menus, 92 turns counting the party screen).
- Selected actions by kind: move 1227, run 93, item 0, switch 0. No model has ever chosen an item or a party Pokémon in battle, so v1 opens the BAG or the POKéMON screen and stops there; choosing an item or a party slot is out of scope (the bag and party screens have their own cursors and lists).
- "There's no PP left for this move!" was shown 5 times, all in 0e05.

## Design

- Switch `battle-move-tool-v1`, guidance group, default off, `needs: null`, bundle-only (the operator). OFF: no tool, prompt and tool list byte-identical.
- Tool `battle_action(action: "fight"|"bag"|"pokemon"|"run", move?: string)`, added after navigate_to and built from the ordinary press/observe tools like navigate_to (`withBattleAction`, `packages/agent/src/battle-action.ts`).
- Every press is one ordinary button sent through `executeChecked`: the precondition re-reads the game state right before the press and refuses if the battle input, phase or cursor is not the one the step was planned from. After each press the RAM cursor must be where the game's input handler puts it (pret `HandleInputChooseAction`, `HandleInputChooseMove`), or the call stops and says so.
- Cursor rules (pokeemerald 731ad5bf, `src/battle_controller_player.c`): action menu 0 FIGHT, 1 BAG, 2 POKéMON, 3 RUN; LEFT if cursor&1, RIGHT if !(cursor&1), UP if cursor&2, DOWN if !(cursor&2). Move menu slots 0-3 in the same 2x2; RIGHT also needs (cursor^1) < number of moves, DOWN (cursor^2) < number of moves.
- Waits between menus (A on FIGHT, B out of the move menu) use the game server's battle wait (`/pokebench/battle/wait`), held until the first emulated frame the battle needs input. No sleeps or polling in the tool.
- Refusals press nothing and use the game's words where the game has them: "There's no PP left for this move!" (`sText_NoPPLeft`, `src/battle_message.c`). Otherwise the plain fact: no battle in progress; the battle is not waiting for a choice (with what it is doing); the active Pokémon does not know the move (its moves listed with PP); a Safari, target, reorder or YES/NO choice is open.
- With every move at 0 PP, FIGHT is pressed and the game decides (it uses STRUGGLE on its own).
- Dialogue/battle text auto-advance treats a battle_action result like navigate_to's: when the battle runs its own text afterwards, it advances it and lists the pages (event `dialogue_auto_advance`, tool `battle_action`).
- Recorder pairs the battle_action result with its state (`state_seq`); battle-loss recap and blocked-exit facts see it as a game tool.

## Milestones

**M1: RED**
- [x] Fixture from e046 seq 16609/16616/16622/16634 and 0e05 seq 18877/18934/18947; a simulated battle input that follows the pret cursor rules
- [x] RED tests (battle-action.test.ts fails to import; the battle_action hand-off test in battle-text-auto-advance.test.ts fails): EMBER from e046's action menu ends on slot 3; 0e05's POKéMON/RUN cursor reaches FIGHT; no-PP refusal; unknown move; input not ready; outside battle; bag/pokemon open and stop; registry/OFF byte-identity
- COMMIT: `test(red): battle-move-tool-v1 battle_action from the e046 EMBER/GROWL and 0e05 menu-loop states` (5940d584)

**M2: GREEN**
- [x] battle-action.ts (withBattleAction beside withNavigation), registry/presets/next-run default (off), playTools, dialogue auto-advance hand-off (event tool `battle_action`, schema regenerated), recorder state pairing, result-facts GAME set; mechanical registry-position test updates (.at(-N) +1, counts, off lists)
- [x] Wiring deletion receipt: removing withBattleAction from playGameTools turns "OFF: tools and prompt are byte-identical; ON adds battle_action" red (1 failed / 30); restored, 31 pass
- [x] Gates: just test (agent 2139, viewer 1103, Python 2530), just coverage (agent 98.02/94.27/98.3/99.25 stmts/branches/funcs/lines; viewer 95.35/91.39/93.78/97.62; Python lines 97.60 branches 93.71 functions 100), just lint clean. battle-action.ts 96.1/87.6/100/100. Worktree setup: vendor submodule initialized from the local clone (--reference); mgba binding copied into the worktree venv (Python unchanged by this branch)

**M3: explainer, experiment, review**
- [x] Explainer docs/explainers/battle-move-tool-v1.html, FEATURE_EXPLAINERS link, panels/server tests, pages-check prints nothing
- [x] Pending experiment experiments/battle-move-tool.json (no queuePosition; provisional source.commit = RED commit) + readiness row; parse/arms test in battle-action.test.ts
- [x] Real-ROM probe: NOT RUN. Both a scratch-port game server (8977, scratch run dir in the session scratchpad, state copied from runs/battle-text-qualify/states/first-battle-action.state) and an offline probe (the tool's dist driving mGBA in-process through a stdin/stdout bridge, no port) were refused by the session's permission system. Recorded as a gap in the explainer; the cursor rules rest on pret source and the recorded states (the simulator reproduces e046 seq 16616 and 16622 field for field).
- [x] Principles self-review (PB1-PB13), zero FAIL:

| ID | Score | Evidence |
|---|---|---|
| PB1 | PASS | The tool reports only what RAM shows; what was committed is the game's battle_choice journal, not the tool's text. No grading change. |
| PB2 | N/A | No measured runs. The measurement counts every run (288), including failed and aborted ones. |
| PB3 | PASS | No improvement claimed; the pending experiment (8 per arm) is the test. |
| PB4 | PASS | Declared harness capability: a registered switch recorded in harness_features, default off, OFF byte-identical; button presses carry the tool call id. No RAM writes, no save reloads. |
| PB5 | PASS | One switch; the experiment flips only battle-move-tool-v1 (tested). |
| PB6 | PASS | Adds one status line per call; no model-facing text is clipped. |
| PB7 | PASS | tool_call/tool_result (with state_seq), button_press per press, battle_choice, dialogue_auto_advance (tool battle_action) are recorded (tested through RunRecorder). |
| PB8 | PASS | Arguments are schema-checked (enum action, optional string move, no extra keys); invalid moves are refused with the list of valid ones, never guessed. |
| PB9 | PASS | Scope questions answered from evidence (bag/party never chosen in 288 runs), stated in the explainer; nothing defaulted silently (no default target in doubles). |
| PB10 | PASS | No skipped tests; floor 90 untouched; no --no-verify. Count updates in other tests are registry positions only. |
| PB11 | PASS | Cursor rules checked against pret 731ad5bf battle_controller_player.c; reader fields against battle_state.py; BattleWaitSchema reused. |
| PB12 | PASS | No ROM copy. The refused probes would have opened $POKEBENCH_ROM's file in place (mGBA load_path) and a copied save state; nothing ran. |
| PB13 | PASS | RED 5940d584, GREEN 06d3055b, gates, worklog; review below. |
- [x] Review round 1 on packet a7f90d8a (diff sha256 eb93a758…): Claude sub-agent LGTM (notes: refused call then auto-advance B presses; RED pin wording; Disable/Taunt not read), Grok cursor-grok-4.5-high LGTM (notes only), Codex gpt-5.6-sol BLOCKING: two ready player inputs in a double battle, where one button reaches both handlers. Fixed: readyInput is defined only with exactly one ready input; validate refuses "more than one battle input is waiting at once"; the precondition and the mid-call loop stop on it; no wait with any input ready. Also: a refused battle_action is not auto-advanced; experiment note says RED pin. Tests: agent 2141, viewer 1103, Python 2530; coverage agent 98.01/94.27/98.3/99.25, Python 97.60/93.71/100; lint clean.
- [x] Review round 2 (final) on packet f0779a46 (diff sha256 5d2a7dae…, synced with main f5742c00): Claude LGTM, Grok LGTM (notes), Codex BLOCKING on wording only: the two-input refusal began "the battle is not waiting for a choice", false in that state. Fixed in the next commit: the refusal reads "more than one battle input is waiting at once; battle_action chooses for one at a time, so use press."; refusedAction moved above navigationAfter's comment (Claude note); explainer documents the doubles refusal (Grok note). Gates green (viewer server-stream.test.ts timing flake once under coverage, passed on rerun; file untouched). At the 2-round cap: Codex has no LGTM on the fixed head; operator/caller decides on a confirming pass.
- [ ] Review: Claude, Grok cursor-grok-4.5-high, Codex gpt-5.6-sol (max 2 rounds), sync with main before the final round
- [ ] LANDING HOLD until exit-reachability-v1 lands; final sync on ping

**M4: double-battle targets (the operator, 2026-10-17 4:18 PM EDT: "the battle tool needs to be able to select which pokemon should be attacked for double battles"; one more Codex pass allowed)**
- [x] RED: battle-action-doubles.test.ts (synthetic doubles: no recorded run has a battle_type with the double bit; built from e046 seq 16609 widened to four battlers), singles target-ignored test, Python move target byte test. 8 TS + 1 Python failing.
