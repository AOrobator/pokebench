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

**M2: GREEN**
- [ ] battle-action.ts, wiring, registry/presets/defaults, auto-advance integration, recorder, schema
- [ ] Gates: just test, just coverage (90), just lint

**M3: explainer, experiment, review**
- [ ] Explainer docs/explainers/battle-move-tool-v1.html, FEATURE_EXPLAINERS link, pages-check
- [ ] Pending experiment experiments/battle-move-tool.json (no queuePosition) + readiness row
- [ ] Principles self-review
- [ ] Review: Claude, Grok cursor-grok-4.5-high, Codex gpt-5.6-sol (max 2 rounds), sync with main before the final round
- [ ] LANDING HOLD until exit-reachability-v1 lands; final sync on ping
