# levelup-box-v1: the level-up stats box is named and pressed through

URGENT live-cohort fix asked by the coordinator (2026-10-16). Branch `claude/levelup-box` in `/private/tmp/pokebench-levelup-box`, cut from main `3307db77`. One new default-OFF server switch `levelup-box-v1` (group observation, `needs` null). The readiness thread puts it in `onInBoth` of `experiments/fixed/bundle-v-control.json`; this branch does not edit that file. Lane freeze until 10 AM EDT: offline raw-RAM re-render and tests only.

## Evidence (bundle run `runs/2026-10-16T04-51-03_qwen36-gpu0_54a7`, read-only)

- `run_start.evaluation.features` (seq 0): `battle-text-auto-advance-v1`, `dialogue-auto-advance-v1`, `battle-details-v2`, `expanded-menu-battle-information-v1` ON; `battle-message-waiting-v1` is not in the run's registry (older build), so it was OFF.
- T357 press A×4 (tool_call seq 8567): auto-advance pressed B 3 times through "Wild WINGULL fainted!", "TORCHIC gained 27 EXP. Points!", "TORCHIC grew to LV. 6!" (dialogue_auto_advance seq 8617), then stopped `battle_busy` after 3 waits of 600 frames. Tool result seq 8619 (state 8618, raw-ram 5093): `Dialog: none`, `Interface: battle_resolving; input not ready`, `Battle details: WILD single · turn 6 · resolving (no input until the game asks)`. Frame `frames/008619_0.png` shows the level-up stats box: MAX. HP +2, ATTACK +2, DEFENSE +1, SP. ATK +1, SP. DEF +1, SPEED +1.
- Raw RAM (pokeemerald 731ad5bf, ROM f3ae0881): from raw 5088 (state 8616, frame 97326) to 5124 (state 8663, T362) `gBattleMainFunc` 0x0803E019 (RunBattleScriptCommands), `gBattlescriptCurrInstr` 0x082DABC9 = opcode 0x6C `drawlvlupbox` (BattleScript_LevelUp), printer 0 inactive. `gBattleScripting.drawlvlupboxState` (0x02024474+0x1E): 6 from raw 5088 to 5102 (page 1, `gMain.newKeys != 0` wait), 8 from raw 5103 (state 8638, after T359's B) to 5124 (page 2 wait), 10 at raw 5125 (T362's A closed it; field at state 8669).
- T358 navigate_to (seq 8625) refused (field not free), T359 B (seq 8633) turned page 1 to page 2 but the readout was the same ("interface unchanged"), T360/T361 navigate_to refused, T362 A (seq 8662) closed the box and the battle ended. Five turns lost (T357–T361).
- Other button waits in the battle script engine (`src/battle_script_commands.c` JOY_NEW/newKeys): Cmd_yesnoboxlearnmove, Cmd_yesnoboxstoplearningmove, Cmd_yesnobox, Cmd_trygivecaughtmonnick (all already detected as battle YES/NO prompts) and Cmd_drawlvlupbox's two pages (states 6 and 8, missed). Both pages are covered here. battle_controller_player.c waits are the input menus (already input owners).

## Grounding (pokeemerald 731ad5bf, US ROM f3ae0881)

- `Cmd_drawlvlupbox` (battle_script_commands.c:5924): states 1–2 banner (only when the exp getter is not sent out), 3 init, 4 draw page 1, 5 DMA wait, **6 waits for any new key** → draw page 2, 7 DMA wait, **8 waits for any new key** → close, 9 slide out, 10 continue the script. Window B_WIN_LEVEL_UP_BOX, not the battle message printer.
- Page 1 = `DrawLevelUpWindowPg1(beforeLvlUp->stats, current)`: per stat `+`/`-` and |after−before|; page 2 = `DrawLevelUpWindowPg2(current)`. Row order MAX. HP, ATTACK, DEFENSE, SP. ATK, SP. DEF, SPEED (menu_specialized.c:1503, labels from ROM table `sLvlUpStatStrings` 0x08625B54, literals at 0x081D3778/0x081D3888).
- `gBattleResources` 0x020244A8 → +0x10 `beforeLvlUp` (u16 stats[STAT_HP, ATK, DEF, SPEED, SPATK, SPDEF]); `gBattleStruct` 0x0202449C → +0x10 `expGetterMonId`; party mon stats at `gPlayerParty` 0x020244EC + 100·slot + 0x58 (max HP), 0x5A ATK, 0x5C DEF, 0x5E SPEED, 0x60 SPATK, 0x62 SPDEF. ROM literal pools with 0x020244A8/0x0202449C/0x020244EC together: 0x0804A93C (Cmd_getexp) and 0x0804F138 (DrawLevelUpWindow1/2). Raw 5093: beforeLvlUp = [19, 9, 9, 9, 14, 10] (Lv5), party slot 0 = 21/11/10/10/15/11 (Lv6): page 1 matches the frame.

## Design

- Detector `battle_text.read_levelup_box(read)`: only while RunBattleScriptCommands owns the battle and the script PC is on opcode 0x6C; reports state, page (1/2), whether it waits for a button (6/8), the exp getter's party slot, before/after stats and the current page text (whole). Always recorded as `battle.levelup_box` (measurement, like `battle.message`); the model sees it only through the switch.
- ON readout: battle-details-v2's input clause (and the control arm's `Battle input:` line) says `level-up stats box open, page 1 of 2 (stat increases): MAX. HP +2, ATTACK +2, DEFENSE +1, SP. ATK +1, SP. DEF +1, SPEED +1 — waiting for a button: press A or B to continue (the game takes any new button press)`; page 2 lists the new totals.
- ON with battle-text-auto-advance-v1: the server's battle wait returns `levelup_box` on the first frame the box waits; the agent lists the box page and presses B, for both pages, then continues to the next decision point.
- OFF: readouts, wait reasons and auto-advance unchanged.

## Milestones

**M1 — RED, GREEN, gates**
- [ ] RED: Python detector/readout/wait tests incl. real-ROM re-render of raw 5093/5108; TS registry/schema/auto-advance tests
- [ ] GREEN + gates

**M2 — proof, explainer, pending entry, review**
- [ ] Real-ROM re-render and auto-advance replay through the box
- [ ] Explainer, FEATURE_EXPLAINERS, `experiments/levelup-box.json`, readiness row
- [ ] Principles self-review, Claude, Codex, Grok

## Session Log

- 2026-10-16 05:35 AM EDT: worklog created; evidence above from events, frames and raw RAM. Baseline on unmodified main 3307db77 with the ROM: Python 34 failed / 2236 passed (test_battle_message_waiting ×10, test_connection_edges ×2, test_in_game_naming ×13, test_offscreen_objects ×7, test_rerender ×2) — pre-existing, owned by the rival-splits thread, not this change.
- 2026-10-16 05:50 AM EDT: Python RED. `env/tests/env/test_levelup_box.py` + fixture `levelup-box-54a7.json` (RAM windows only, generated by a scratch script over `load_raw_ram` for states 8609/8618/8640 across the arms and the observation route; each recorded readout asserted equal to the tool result's tail): OFF byte-identical at T357/T359, ON page 1/page 2 clauses, control arm `Battle input:` line, expanded-only line, message before the box unchanged, ROM-labelled rows, wait phase only with the switch, state JSON same ON/OFF, observation route, production battle-wait route, synthetic states/pages/signs/diagnostics. Without the implementation: 24 failed, 2 passed (the two OFF tests).
  COMMIT: `test(RED): levelup-box-v1 names the level-up stats box and ends the battle wait on it`
