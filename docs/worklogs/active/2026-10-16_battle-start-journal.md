# battle-start-journal: stale battle starts, torn save reads and handoff owners

## Problem Statement

Cook harness audit (`runs/reports/2026-10-16-cook-harness-audit/`, read-only) found four bug families in `env/pokebench_env`. The operator approved fixing them at 5:34 AM New York time ("fix all of these bugs and then put them in the bundle"), with standing approval to merge once review is sufficient; that is this worklog's approval. The thread owner lands the branch; this branch stops at three cloud LGTMs on a frozen packet.

1. **Stale battle at battle start (model-visible).** At a second or later battle start, the readout shows the previous battle: sh02 T922 (state 15743, raw-ram 6167) `Battle details: TRAINER single · turn 3 · finishing (outcome won)` with `Foe ZIGZAGOON … HP 0/15`; e588 T1500 (state 20646, raw-ram 7362) the same while a WINGULL battle starts; show T744 (state 18780, raw-ram 7894) `STATE COVERAGE ERROR: harness bug: invalid battle positions`. All three say `Screen: unknown (callback2 0x08036FAD)`.
2. **Activity History battle events (journal only).** A phantom `battle_outcome won` right after every later `battle_started` (sh02 9688, 12028, 13650, 15303, 15749, 16590; show 18791, a battle then lost), phantom `battle_hp/pp/status_changed` diffed against the previous battle (54a7 5341-5349, show 14722-14724), `battle_type: null` on every `battle_started`.
3. **Torn save-block reads in the native action journal (journal only, plus a latent model-facing risk).** 239 `harness_bug` events (bag, pc_items, berry_trees, planted_berries, daycare, party checksum) are decodes in the middle of `MoveSaveBlocks_ResetHeap` or `EncryptBoxMon`/`SetBoxMonData`. The journal decodes after every emulated frame wherever the CPU is. Dedupe keys on the message text with slot numbers and hex, so the same bug repeats.
4. **Unlabeled 1-3 frame handoff callbacks reported as unsupported harness bugs (journal; model-visible if a poll lands there).** CB2_NewGame 0x08085EF9, return-to-field wrappers 0x080860C9/0x08086195/0x080861CD, wall clock 0x081349F5/0x0809E8B5, starter bag 0x08133F0D, nickname exit 0x080EFE99.

Out of scope (other branches): readout.py wording, world_context.py field-message lines, menus.py start menu, loop-supervisor.ts, bundle-v-control.json, push-back/loop-guard recovery, level-up box, the party Cancel slot (7c).

## Skills Loaded

feature-worklog, execute-worklog (incl. Landing on main), feature-switch, feature-explainer, pokebench-game-state, agent-observability, multi-model-review (+ reviewer-invocation). Common rules: `scratchpad/common.md`.

## Architecture

Source grounding: pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` (clean), US ROM SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`. Every address below was read from the ROM (literal pools, call targets, first instructions) and, where it appears, from archived raw RAM.

### Battle start (fix 1, 2)

- `CB2_InitBattleInternal` (battle_main.c:619) calls `SetUpBattleVarsAndBirchZigzagoon` (battle_controllers.c:42: `gBattleMainFunc = BeginBattleIntroDummy`, every `gBattlerPositions[i] = 0xFF`), sets callback2 `CB2_HandleStartBattle` and then `gMain.inBattle = TRUE` (line 703). `gBattlersCount`, `gBattleMons`, `gBattleOutcome` and `gBattleResults` still hold the previous battle.
- `CB2_HandleStartBattle` state 15 → `InitBattleControllers` sets positions, `gBattlersCount` and `gBattleMainFunc = BeginBattleIntro`. State 18 sets callback1 `BattleMainCB1`, callback2 `BattleMainCB2`.
- `BeginBattleIntro` (line 3017) → `BattleStartClearSetData` clears `gBattleOutcome` (line 3096) and `gBattleResults` (turn counter, line 3142), then `BattleIntroGetMonsData` → `BattleIntroPrepareBackgroundSlide` → `BattleIntroDrawTrainersOrMonsSprites`, which copies the new `gBattleMons` (line 3407) and only then sets `BattleIntroDrawPartySummaryScreens`.
- So while `gBattleMainFunc` is one of those five functions, outcome, turn and battlers can belong to the previous battle. ROM: BeginBattleIntroDummy 0x08039EC9 (`bx lr`, one literal ref at 0x0803273C), BeginBattleIntro 0x08039ECD (7 refs from InitBtlControllersInternal; body `bl BattleStartClearSetData; gBattleCommunication[1]=0; gBattleMainFunc=0x0803ABC1`), BattleIntroGetMonsData 0x0803ABC1, PrepareBackgroundSlide 0x0803AC35, DrawTrainersOrMonsSprites 0x0803AC85, DrawPartySummaryScreens 0x0803AF81; each referenced once, from the predecessor's pool. CB2_HandleStartBattle 0x08036FAD (docs/findings/2026-10-16_battle-text.md).
- Raw RAM (show run): 2333-2334 main 0x08039EC9, cb2 0x08036FAD, count 0, positions ff (first battle); 6603-6604, 7509, 7758 main 0x08039ECD, cb2 0x08036FAD, count 2, outcome 1, turn byte 2 (the stale `turn 3 · finishing (outcome won)`); the next archives have main 0x0803AF81 and outcome 0.
- Fix: `read_battle_state(..., current_battle_only=True)` returns `initializing` while main is one of those five, or every position read is 0xFF. Game state applies it only under the switch; the journal always.
- Journal: `battle_started` waits for the first frame decoded as the current battle (initialized) and takes `battle_type` from it, recording `activated_frame`; a battle that ends before any valid decode still gets `battle_started` (type null) then `battle_ended`. `battle_outcome` and battler diffs only between frames of the current, initialized battle.

### Coherent frames (fix 3)

- `MoveSaveBlocks_ResetHeap` (load_save.c:84) moves the pointers first, copies ~107 KB across a VBlank, then re-keys. Runs on every map load, return to field and `CB2_InitBattle`. `EncryptBoxMon` / `SetBoxMonData` also span instructions.
- `AgbMain` (main.c) runs callbacks, then `WaitForVBlank` spins on `gMain.intrCheck`. ROM 0x080008AC-0x080008D3 is `WaitForVBlank` (push; ldr r2,=gMain 0x030022C0; clear bit 0 of +0x1C; loop 0x080008C6-0x080008CF; pop/bx). While the main thread's next instruction is in that function (user/system mode, Thumb), no callback is mid-execution, so save blocks, keys and party are whole.
- Raw RAM across all runs: 132,449 of 133,087 archives at gprs[15] = 0x080008C8 (next instruction 0x080008C6, the loop top), system mode; the rest are in memcpy (LR inside MoveSaveBlocks_ResetHeap), BIOS calls, IRQ entry (mode 0x12) etc. Busy polls never run long: at most 9 consecutive archives in any run.
- Fix: `main_loop_idle(read)` (True/False, None when the reader has no CPU). The journal skips frames that are not idle (no observe, `previous` kept), and emits one `harness_bug` (owner `native_action`) if 600 frames in a row are not idle. Game state, under the switch, treats a busy frame like `field_transition`: no save-block reads.
- Dedupe: `harness_bug` key = owner + message with every hex/number token replaced by `#`; the event gains `kind` (that normalized text).

### Handoff owners (fix 4)

ROM-verified callback2 values, each 1-3 frames between supported owners:

| callback2 | function | ROM proof | phase |
|---|---|---|---|
| 0x08085EF9 | CB2_NewGame | one ref 0x08031674 (Birch speech end); sets gFieldCallback=0x080FB4E1, DoMapLoadLoop(&gMain.state), SetMainCallback1(0x08085E05), SetMainCallback2(0x08085E5D) | field_transition |
| 0x080860C9 | CB2_ReturnToField | IsOverworldLinkActive ? SetMainCallback2(0x08086119) : FieldClear + SetMainCallback2(0x080860F5) | field_transition |
| 0x08086119 | CB2_ReturnToFieldLink | the link branch above | field_transition |
| 0x08086195 | CB2_ReturnToFieldWithOpenMenu | gFieldCallback2=0x080AF6A5; bl 0x080860C8 | field_transition |
| 0x080861B1 | CB2_ReturnToFieldContinueScript | gFieldCallback=0x080AF189; bl 0x080860C8 | field_transition |
| 0x080861CD | CB2_ReturnToFieldContinueScriptPlayMapMusic | gFieldCallback=0x080AF169; bl 0x080860C8 | field_transition |
| 0x080861E9 | CB2_ReturnToFieldFadeFromBlack | gFieldCallback=0x080AF3C9; bl 0x080860C8 | field_transition |
| 0x0809E8B5 | ReturnFromStartWallClock (clock.c:76) | InitTimeBasedEvents; SetMainCallback2(0x080861CD); stored as savedCallback by StartWallClock | field_transition |
| 0x081349F5 | CB2_StartWallClock | only ref is StartWallClock (0x0809E8C5); creates task 0x08134CB9 (clock_transition) | clock_transition |
| 0x08133F0D | CB2_ChooseStarter | only ref 0x080B114C (ChooseStarter, savedCallback CB2_GiveStarter 0x080B1159); SetVBlankCallback(NULL), SetGpuReg ×5 | starter_choice_transition |
| 0x080EFE99 | ChangePokemonNickname_CB (tv.c:3301) | SetMonData(gPlayerParty[gSpecialVar_0x8004], NICKNAME, gStringVar2); bl 0x080861CC | field_transition |
| 0x08036FAD | CB2_HandleStartBattle (before inBattle is set) | battle-text findings | battle_transition |

Only these. Party/bag init callbacks (0x081B7F35, 0x081B01E1, 0x081AAB9D, 0x081AAD8D) are unverified and stay unsupported. In game state, under the switch, `Screen:` reads `battle_transition` for 0x08036FAD; the other screen labels are unchanged (milestone code reads `screen`).

### Switch

`transition-coherence-v1` (server, observation group, needs null). ON: fixes 1, 3 (game-state gate) and 4 in what the model sees. OFF: today's bytes. A correctness fix: intended ON IN BOTH ARMS of bundle-v-control (the bundle file is the readiness thread's). Journal fixes have no switch: the model never sees journal events.

## Invariants

- INV-1: OFF reproduces the recorded readouts byte for byte (show T744, sh02 T922, e588 T1500 fixtures). Test: re-render with the run's recorded switches.
- INV-2: ON never reports the previous battle's outcome, turn or battlers while the new battle initializes. Test: same fixtures ON read `initializing`; a later frame (main 0x0803AF81) decodes normally.
- INV-3: the journal never decodes save-derived resources or party on a frame where the main loop is not idle. Test: e588 405, 687e 202, 2a25 394 archives (busy) emit no harness_bug and keep `previous`; an idle archive decodes clean.
- INV-4: the journal never goes silently blind: 600 busy frames in a row emit one harness_bug.
- INV-5: only ROM-verified callbacks are relabeled; an unlisted unknown callback is still `unsupported`.
- INV-6: one `battle_outcome` per battle, from the current battle; `battle_started.battle_type` from the first valid frame.

## Security Review

No new inputs, endpoints, subprocesses or files outside the repo. RAM fixtures hold RAM windows only (no ROM bytes, no .state/.sav). Reads stay under the existing frame lock.

## Milestones

**M1 — RED**
- [x] Fixtures from raw RAM: battle starts (show 7894, sh02 6167, e588 7362 + a post-init frame), torn saves (e588 405, 687e 202, 2a25 394 + an idle control), handoff callbacks
- [x] Tests: battle_state current-battle guard; game state OFF byte-identical / ON readouts; journal battle events; coherence gate + blind guard + dedupe; handoff phases; switch registry both stacks
- [x] COMMIT (RED)

**M2 — GREEN**
- [x] Implement battle_state, frame coherence, action_history, ui_state, game_state, switch plumbing
- [x] Gates: `just test`, `just coverage` ≥90, `just lint`, `just build`, `just verify-vendor` (34 Python failures are main's, see session log)
- [x] COMMIT (GREEN)

**M3 — proof, explainer, experiment entry**
- [ ] Real-ROM re-render over every battle start and busy archive in the cook runs (OFF equals recorded, ON diffs only where expected); journal replay over archives
- [ ] Explainer `docs/explainers/transition-coherence-v1.html`, FEATURE_EXPLAINERS, pending `experiments/transition-coherence.json`, readiness row, pages-check
- [ ] COMMIT

**M4 — review**
- [ ] Merge main, gates, principles self-review, seal packet
- [ ] Claude, Grok, GPT lanes LGTM on the same packet; report to the thread owner (no self-merge)

## Closing the Loop

Report: branch, frozen head SHA, sha256 of `git diff --binary main HEAD`, three verdict lines, gate counts and coverage, switch id and arms.

## Session Log

- 2026-10-16 05:50 AM EDT: worktree `/private/tmp/pokebench-battle-start-journal` from main `1f4ac74e`; `.env` copied; `just setup`. Discovery: source, ROM disassembly and raw-RAM scans above.

- 2026-10-16 06:00 AM EDT: RED. Fixtures (gzip JSON, RAM windows only, built by a scratch recorder that wraps `load_raw_ram` and keeps every non-ROM read of the re-render and the journal, plus gMain, battle IWRAM and the battle globals): `env/tests/env/fixtures/transition-coherence-battle-start.json.gz` (show 6359/6362/6364/6600/6603/6605/7893/7894/7895/7896, sh02 6167/6168, e588 7361/7362/7363; recorded readouts for show T744, sh02 T922, e588 T1500), `…-torn-saves.json.gz` (e588 404-406, 687e 201-202, 2a25 393-394, sh02 4974-4975, storage reads included), `…-handoffs.json.gz` (show 7834 CB2_ReturnToField, sh02 3454 CB2_ChooseStarter). Probe with today's code on the fixtures reproduces the audit: OFF equals the three recorded readouts; show 6359→6362→6364 gives phantom `battle_pp_changed 31→35`, `battle_hp_changed 13→19`, `battle_status_changed`; 6600→6603→6605 a stale `battle_outcome won turn 3`; 7894 `invalid battle positions` (battle and menu) and `battle_type null`; e588 405 berry tree 1 `dc312c01dc312c01` + daycare checksum, 687e 202 daycare checksum, 2a25 394 bag empty-slot + planted berries.
  Tests: `env/tests/env/test_transition_coherence.py` (switch registry and rerender wiring; OFF byte-identical and ON readouts at the three battle starts, post-init frames unchanged, busy-poll save gate, idle overworld unchanged; current-battle guard per intro main func and cleared positions; journal battle events on real frames and synthetic start/end pairing; main-loop idle on archived CPUs; torn-save frames skipped with `previous` kept; blind guard at 600 and its reset; dedupe by owner+kind; the 12 handoff callbacks, an unlisted one, CB2_HandleStartBattle in and out of battle, real handoff frames, game-state screen label), `packages/agent/src/transition-coherence.test.ts` (registry, server list, Python lists, presets default off, pending experiment). Python: collection error (module missing); agent: 4 failing.
  COMMIT: `test(RED): transition-coherence-v1 and journal fixes for stale battle starts, torn save reads and handoff callbacks` (ec349a4e)

- 2026-10-16 06:25 AM EDT: GREEN.
  - `env/pokebench_env/transition_coherence.py`: switch id, `BATTLE_INTRO_MAIN_FUNCS`, `main_loop_idle` (WaitForVBlank 0x080008AC-0x080008D3, user/system Thumb; None without CPU registers), `HANDOFF_CALLBACKS` (12), `BUSY_LIMIT` 600, `diagnostic_kind`.
  - `battle_state.read_battle_state(read, *, current_battle_only=True)`: initializing while main is an intro step or every position is 0xFF. `ui_state.read_active_ui(..., transition_coherence=True)`: passes it to the battle reader; handoff callbacks become not-ready transitions just before the `unsupported` fallback (only when no Birch owner matched). `game_state.read_game_state(..., transition_coherence_enabled=False)`: battle and UI readers get the flag; `Screen: battle_transition` for 0x08036FAD; no save-block reads when the main loop is not idle. `rerender.read_state` passes `"transition-coherence-v1" not in off`.
  - Journal (`action_history.py`, always on): `advance` skips frames whose main loop is not idle (no observe, `previous` kept), one `native_action` harness_bug after 600 in a row; `battle_started` waits for the first initialized frame (`battle_type` from it, `activated_frame` recorded), or is emitted with null type before `battle_ended` if none came; `battle_outcome` only on initialized frames; battler diffs only between two initialized active frames; harness_bug dedupe by owner + `kind` (numbers and bare hex → `#`, 0x addresses kept), `kind` added to the event details.
  - Registry: `SWITCHABLE_FEATURES`/`FEATURES` (observation, needs null, copy with Off and "both arms")/`SERVER_FEATURES`/`playHarnessFeatures` last; presets optional + default false (`normalizeFeatures`, `flagFeatures`); `DEFAULT_NEXT_RUN` false; Python `SERVER_FEATURES` and default-off list. Pending `experiments/transition-coherence.json` (finals incumbent, activation NEW_GAME_CREATED, primary ROUTE_103, provisional source.commit ec349a4e) and readiness row; `just experiments-check`: ok, 64 experiments. Schema regenerated: unchanged.
  - RED test fixes in GREEN: fixtures regenerated with the ON render's reads too (ON reads the battle text window on the initializing path); two assertions corrected (the synthetic fixture's battle has input ready, so `input`; the all-zero idle frame is itself an unsupported menu owner, so the blind-guard count filters to `native_action`). Registry shifts: `.at(-N)` +1 for SWITCHABLE_FEATURES/SERVER_FEATURES/playHarnessFeatures/FEATURES-switchable across 15 agent test files; observation count 27; legacy off-lists; play-preset and next-run literals; switchboard rows 71; Python default-off set, `len(SERVER_FEATURES) == 34`, battle-message-waiting `SERVER_FEATURES[-3]`, rerender kwargs.
  - Guard deletions (receipts in scratchpad `bsj/receipts/`): rerender wiring removed → 7 red; journal gate removed → 6 red; intro guard removed → 10 red; game-state save gate removed → 1 red; handoff branch removed → 15 red; TS SERVER_FEATURES entry removed → 1 red; each restored → green (58 passed).
  - Gates (ROM via `.env`): agent 1559 passed, viewer 885 passed; Python 2294 passed, 34 failed. The 34 fail on main 1f4ac74e too (stash check: same list, `route103_rival` reads `OPPONENT_A` outside older real-ROM fixtures, from the `claude/rival-route103-splits` merge); `claude/route103-fixture-windows` (3c237922) adds those windows and is not on main yet. No new failure from this branch. Coverage agent 97.89/94.56/98.2/99.14, viewer 95.34/91.02/93.62/97.64, Python lines 97.39 branches 93.29 functions 100 (transition_coherence.py, battle_state.py, rerender.py 100%). lint green except the known mypy `mgba._pylib`; build green; verify-vendor OK.
  COMMIT: `feat: transition-coherence-v1 reads battle starts, handoffs and mid-callback frames as transitions; journal skips torn frames (default off)` (86230acf)
- 2026-10-16 06:30 AM EDT: M3 RED: `panels.test.ts` (FEATURE_EXPLAINERS mapping, Harness Config card link, explainer quotes the stale finishing line, the positions coverage error, the ON initializing line and the WaitForVBlank range) and `server.test.ts` (allowlist serves `transition-coherence-v1.html`): 2 failing. Real-ROM proof over the eight cook runs running in the background.
  COMMIT: `test(RED): transition-coherence-v1 explainer link and serving`

## Surprises

- The journal's `battle_started` fires on the activation frame, which is always before the battle decodes, so `battle_type` was null by construction.
- main 1f4ac74e already fails 34 real-ROM Python tests (route103_rival reads outside older fixtures); a branch to fix it exists. Gates here record those separately.
- ON at an initializing second battle shows the first battle's existing initializing rendering, including `Bag: ` (empty, no word) and `Menu state: input phases: ` from readout.py; not changed here (readout.py wording belongs to another branch).
- Raw RAM: every busy archive is a short streak (at most 9 in a row in any run), so the busy-frame gate costs at most a few polls.

## Multi-Model Review Log

(none yet)

## Boy Scout Log

(none yet)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog
