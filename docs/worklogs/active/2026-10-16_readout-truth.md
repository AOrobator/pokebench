# readout-truth: model-visible readout lines that say what the game shows

Branch `claude/readout-truth` in `/private/tmp/pokebench-readout-truth`, cut from local main `1f4ac74e`.

## Problem Statement

The cook harness audit (`runs/reports/2026-10-16-cook-harness-audit/`) found readout lines that are false or hedge about facts the game state settles. Approved by the operator at 5:34 AM New York time ("fix all of these bugs and then put them in the bundle"), with standing approval to merge once review is sufficient; the thread owner lands it (this branch does not merge into main).

1. Every idle overworld readout says `Field-message text: unavailable; do not infer that the dialogue box is closed.` and `Field-message phase: unavailable; …` next to `Dialog: none` (687e F9: 834 results; e588 F7: 480/480; 2919/3f21 qualification N3). A script-held lock with no message (push-backs sh02 T143/T1072) and a task-held lock (truck ride 2919 T65–74, 3f21 T43–52) are both read as "dialog, menu, or script".
2. `Menu: unavailable (active owner not verified)` on 1,028 of 1,036 results with no menu open (687e F8).
3. `Unverified menu buffer: cursor … ; active menu owner unavailable` from the stale sMenu struct in battle_resolving (sh02, 363 readouts) and on the free field (show F12, `cursor 4 of 4`).
4. `STATE COVERAGE ERROR: field-message owner unqualified …` while a known field YES/NO box is open (sh02 T334/T349/T1013, show T252/T407; 14 model-facing in 5 runs).
5. `Bag: ` blank on the field when the bag is empty (battle says `Bag: empty`) (live F6, e588).
6. Story line `Mom rival instruction received` for intro_stage 7, before any rival exists (687e F2).
7. START menu reopened after the party or bag closes reads as plain overworld (show F2, T526–541); party menu B (slot 7 = Cancel) raises "invalid Party item/close transition owner" (show seq 15175).
8. `Not on this map: … MAY` while RIVAL_MAY_NORMAL is live and on screen (live F3, 54a7 T153–154).
9. Birch's intro speech says `input not ready` while each page waits for A (sh02 F10, T34–44), so each page turn reads `interface unchanged`.
10. A whiteout is reported only as "interface changed" (show F7, T768).

## Skills Loaded

feature-worklog, execute-worklog (incl. Landing on main), feature-switch, feature-explainer, pokebench-game-state, agent-observability, multi-model-review (+ reference/reviewer-invocation.md). Brief: scratchpad `common.md`.

## Architecture

Three server switches (env readout; registry + preset plumbing in TS only):

- **`readout-truth-v1`** (observation, items 1–8). Correctness fixes, intended **ON in both arms** of bundle-v-control (`onInBoth`, wired by the bundle owner, not here). Default OFF in presets so recorded presets and the OFF arm reproduce today's bytes exactly.
- **`birch-speech-pages-v1`** (observation, item 9). Behavior change: the Birch page waiting for A reads input-ready with the page text as the interface value, so press results see page turns. Bundle arm only.
- **`blackout-readout-v1`** (observation, item 10). Behavior change: a whiteout is said once in the readout. Bundle arm only.

Flow: `features.ts` SERVER_FEATURES → `POKEBENCH_FEATURES_OFF` → `readout.features_off_from_env` → `rerender.read_state` (reader kwargs) / `rerender.render` (text kwargs). No new state-JSON fields (the TS event schema is closed and is not edited here); the extra facts the text uses stay internal to `GameState`/`WorldContext`, and the raw-RAM archive reproduces them through `rerender`.

Game grounding (pret/pokeemerald 731ad5bf, US ROM f3ae0881):

- Field message closed: `sFieldMessageBoxMode` (0x020375BC) = FIELD_MESSAGE_BOX_HIDDEN (0), window 0 not drawn, no `Task_DrawFieldMessage`, text printer 0 inactive. Script context: `sGlobalScriptContextStatus` (0x03000E38: RUNNING 0, WAITING 1, SHUTDOWN 2) and `sGlobalScriptContext.mode` (STOPPED 0, BYTECODE 1, NATIVE 2). Push-back sh02 seq 2984 / 18282: status 0, mode 2, native 0x0809A671 (movement wait); truck 2919 seq 941/1001, 3f21 seq 668: status 2, mode 0, task 0x080FB36D (`ExecuteTruckSequence` locks controls from a task, field_special_scene.c:260–266).
- Field YES/NO owner: `Task_HandleYesNoInput` 0x080E215D (and multichoice 0x080E2059, grid 0x080E2309, callback YES/NO 0x08121FDD), already verified in `menu_pc.py`.
- START menu reopen: `ReturnToFieldOpenStartMenu` creates `Task_WaitForFadeShowStartMenu` (field_screen_effect.c:424–438), which waits for the weather fade and then creates `Task_ShowStartMenu`. ROM 0x080AF660: `bl 0x080AF71C` (WaitForWeatherFadeIn), `cmp r0,#1`, `bl 0x080A909C` (DestroyTask), literal 0x0809FA35 (Task_ShowStartMenu) with `movs r1,#0x50`, `bl 0x080A8FB0` (CreateTask). So 0x080AF661 is the wait task (menu drawn, input not yet handled) and 0x0809FA35 is Task_ShowStartMenu on both paths (menu_save.py's parent check stays right). show seq 15183/15399: task 0x080AF661 data[0]=0, gMenuCallback stale (0x0809FBF1/0x0809FC25); next turn back to 0x0809FA35.
- Party slots: `PARTY_SIZE` (6) = Confirm, `PARTY_SIZE + 1` (7) = Cancel (party_menu.c:1141, 1401, 1525); B sets slot 7 then `Task_ClosePartyMenu`.
- Birch pages: `Task_NewGameBirchSpeech_WaitForSpriteFadeInAndTextPrinter` 0x0803133D prints `gText_Birch_YourePlayer`, `Task_NewGameBirchSpeech_ShrinkPlayer` 0x080314C5 prints `gText_Birch_AreYouReady` (main_menu.c:1657–1750); each `\p` puts printer 0 in RENDER_STATE_CLEAR waiting for A/B with the arrow. sh02 seq 620/644/682: printer 0 active, state 2.
- intro_stage 7: `PlayersHouse_1F_EventScript_SetWatchedBroadcast` after `PlayersHouse_1F_Text_GoIntroduceYourselfNextDoor` ("PROF. BIRCH is his name. He lives right next door…"), data/scripts/players_house.inc:132–153.
- Whiteout: `CB2_WhiteOut` 0x08085F59 (overworld.c:1550) runs 120 frames, then `DoWhiteOut` halves money, heals the party and warps to the last heal location (overworld.c:358–366).

## Invariants

- INV-1 Each switch OFF reproduces today's readout and state JSON byte for byte. Test: recorded cook readouts re-rendered OFF equal what the model received; JSON equal with and without the switch.
- INV-2 "Closed / none open" is said only when the game state proves it; any read failure or unknown owner keeps "unavailable" or the old unverified text. Test: synthetic window-drawn / owner-unknown cases keep the old lines.
- INV-3 Every new owner address is grounded in source plus ROM bytes and a recorded frame. Test: real-ROM re-render of the recorded states.
- INV-4 No new state-JSON fields; no TS schema edits. Test: JSON equality ON vs OFF except fields that already exist (active_ui ready/value/phase, field_activity).
- INV-5 The whiteout line comes from the game's own callback (CB2_WhiteOut seen on an emulated frame) and appears once on the field; waits stay frame-driven (no sleeps or polling).

## Security Review

Read-only RAM decoding and text. No subprocesses, no network, no new endpoints. The whiteout latch is per server process (INV-7 isolation unchanged). Run dirs are read-only inputs for fixtures (RAM windows only, never ROM bytes).

## Milestones

**M1 — readout-truth-v1 (items 1–8), birch-speech-pages-v1, blackout-readout-v1**
- [x] RED: real-ROM fixture from cook runs (OFF equals received; ON lines), synthetic cases, registry/preset/server-list tests both stacks, factory wiring
- [x] COMMIT RED
- [ ] GREEN implementation
- [ ] Gates: `just test` (ROM set), `just coverage` ≥90, `just lint`, `just build`, `just verify-vendor`
- [ ] COMMIT GREEN
- [ ] Guard deletion receipts

**M2 — proof, explainers, pending experiments**
- [ ] Real-ROM re-render over the cited states of sh02, show, 2919, 3f21, 54a7, 687e
- [ ] Explainers (3), README, FEATURE_EXPLAINERS + panels/server tests, `just pages-check`
- [ ] Pending experiments/<id>.json for the two bundle-only switches; readiness rows
- [ ] COMMIT

**M3 — review**
- [ ] Merge main, gates
- [ ] Principles self-review PB1–PB13, zero FAIL
- [ ] Claude, Grok, GPT lanes `VERDICT: LGTM` on one frozen packet
- [ ] STOP: report to the thread owner (no self-merge)

## Closing the Loop

Report branch, frozen head, packet SHA-256, verdict lines, gate counts and coverage, switch ids and intended arms.

## Session Log

- 2026-10-16 05:48 AM EDT: worklog created after read-only discovery (audit reports, recorded raw RAM probes of the seqs above, pokeemerald 731ad5bf, ROM disassembly at 0x080AF660). Approval: The operator 5:34 AM (relayed by the thread owner).

- 2026-10-16 06:10 AM EDT: Boy scout before RED. Main `1f4ac74e` has 34 Python failures with POKEBENCH_ROM set (they skip without it): `read_route103_rival` (route103-rival-splits, bf86cd9b) reads gTrainerBattleOpponent_A 0x02038BCA, gBattleTypeFlags and the rival trainer flags / VAR_OLDALE_RIVAL_STATE, which the real-ROM fixtures of battle-message-waiting, connection-edges, in-game-naming, offscreen-objects and rerender never recorded (KeyError 0x02038BCA). Added exactly those RAM windows, read from each fixture's own raw-RAM archive (scratch script, RAM only, never ROM bytes; JSON formatting preserved). Main + repaired fixtures: 2270 passed, 0 failed.
  COMMIT: `test(fixtures): add the Route 103 rival RAM windows the real-ROM fixtures were missing` (a2622a53)
- 2026-10-16 06:55 AM EDT: RED. New `env/tests/env/test_readout_truth.py` (real-ROM fixture `readout-truth-cook.json`: 10 recorded states from sh02/2919/54a7/show, RAM windows recorded while re-rendering each with every new switch off and on, never ROM bytes; OFF contained in what the model received for all 9 states with a tool result; ON lines per item; state JSON unchanged where no owner changes; synthetic no-message/script-phase/YES-NO-owner/menu-line/lock-line/bag/story/START-reopen/party-slot/live-object cases), `test_birch_pages.py`, `test_blackout_readout.py` (frame latch, once-only take, production `serve.run` route ON/OFF), `packages/agent/src/readout-truth.test.ts` (registry, server list, presets default OFF). Registry shifts: every end-relative `.at(-N)` +3 in 13 agent test files, observation count 29, legacy off-lists, battle-text slice(-9), switchboard rows 73, next-run literals, play-preset flag literal; Python default-off set and count 36, rerender pass-through kwargs, and the three ids added to the recorded-off sets of tests whose goldens predate them (battle-details-v2, battle-message-waiting, battle-triage, displayed-place-names, named-warps, offscreen-objects, readout-rules, rerender). Without the implementation: Python 4 collection errors (modules missing), agent 33 failed, viewer 2 failed.
  COMMIT: `test(RED): readout-truth-v1, birch-speech-pages-v1, blackout-readout-v1 (cook harness audit)`

## Surprises

- `0x0809FA35` is `Task_ShowStartMenu` on both the open and the reopen path; the audit's "accept 0x080AF661 instead" is the wait-for-fade task before it, so the reopened menu is drawn but not yet accepting input. Read as `start_menu`, input not ready.
- The party menu's existing `selected_slot == 6 → CANCEL` mapping is off by one: 6 is CONFIRM, 7 is CANCEL.
- The truck ride lock is a game task, not a script, so its lock line says no script is running.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog
