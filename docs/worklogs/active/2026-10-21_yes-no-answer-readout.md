# YES/NO answer readout (yes-no-answer-readout-v1)

Approved by the operator 2026-10-21 00:08 UTC (8:08 PM ET): "lets do those fixes and put them in the bundle". One milestone: RED → GREEN → gates → cloud review. Branch `claude/yes-no-answer-readout`, worktree `.claude/worktrees/agent-a7b8aed0cefa75f8c`, based on local main dc7d0293. No runs, GPU, viewer restart, push, PR or merge (the coordinator lands it).

## Problem Statement

When a game YES/NO box has NO highlighted, the readout says only e.g. `Interface: clock_confirmation; input ready; selected NO; value 11:24 AM; UP/DOWN selects; A accepts selection; B returns to adjustment`, and the model keeps pressing A, which answers NO. Run `2026-10-20T19-58-04_qwen36-gpu0_ef9f` (read-only) set the clock to a time and answered NO on the confirmation from turn ~100 to 156 (8:02–8:09 PM ET). A decision probe at turn 156 (16 samples per arm, another session): as recorded 0/16 pressed UP then A; a supervisor redesign 0/16; with the line "To answer YES, press UP, then A. Pressing A now answers NO." 8/16 did.

## Skills Loaded

feature-switch, pokebench-game-state, feature-explainer, experiment-queue, feature-worklog, close-the-loop (gates), multi-model-review (cloud lanes only).

## Architecture

Server-side observation switch, render-only: `env/pokebench_env/yes_no_answer.py` decides the answer line from the already-read `GameState` (`active_ui` phase/selected/ready/diagnostic, or the battle-script YES/NO prompt), and `readout.format_readout` inserts it directly after the `Interface:` line when `yes-no-answer-readout-v1` is not in `POKEBENCH_FEATURES_OFF`. No reader, typed JSON or state change; rerender/replay get it from `off` like every readout switch. Agent registry transports the switch (`SERVER_FEATURES`), default OFF, bundle arm only.

## Invariants

- INV-1: OFF is byte-for-byte today's readout. Test: OFF golden and evidence-state OFF bytes equal the recorded tool result lines.
- INV-2: The line names only the highlighted option read from RAM; no line when selected is unknown, the input is not ready, a coverage diagnostic is present, or the phase is not a verified YES-over-NO no-wrap box. Test: parametrized readout tests.
- INV-3: "B also answers NO" only where pokeemerald's handler sends B to the NO path. Test: per-phase table asserted against the grounding table.
- INV-4: Production path honours the switch (env list → format_readout). Test: production observation route and rerender; delete-the-guard receipt.

## Security Review

No new inputs, subprocesses, network or file access. Text only from enumerated constants. Fixture holds only writable RAM reads (no ROM bytes, no frames).

## Milestones

**M1 — yes-no-answer-readout-v1**
- [x] Ground every recognized YES/NO prompt in pokeemerald (table below)
- [x] Write tests (readout YES/NO highlighted per prompt, unknown selection, not ready, OFF golden, ef9f evidence, registry/bundle/explainer link)
- [x] COMMIT: `test: yes-no-answer-readout-v1 readout line per YES/NO box, unknown selection, OFF golden, ef9f turn-156 evidence, registry and bundle arms (RED)` (37040773). RED: Python collection error (no pokebench_env.yes_no_answer); agent registry test and 3 viewer tests fail (no switch, no explainer, not in bundle arms).
- [x] Implement switch, registry collateral, bundle arms, pending experiment, explainer
- [x] Gates: `just build` ok; `just lint` ok (tsc, eslint, ruff, format, mypy 102 files); `just test` agent 3014, viewer 1443, pytest 3166 (ROM configured via copied .env, zero skips); `just coverage` agent 97.21/93.00/97.57/99.16 (stmts/branches/funcs/lines), viewer 95.09/91.06/93.85/97.70, Python lines 97.11 branches 92.69 functions 100; yes_no_answer.py 100%.
- [x] Delete-the-guard check recorded: readout wiring deleted 128 fail; switch gate 127 fail; ready guard 2; diagnostic guard 1; battle prompt branch 8; forfeit branch 2; forfeit B clause 2; default-off env list 3; agent SERVER_FEATURES transport 1 (vitest). Each restored, 151/151 green. Receipt runs/yes-no-answer-readout/mutations.txt (ignored).
- [x] COMMIT: `feat: yes-no-answer-readout-v1 says how to answer the other option of an open YES/NO box from the highlighted option in RAM (default off, bundle arm)` (c0f0da33).
- [x] Merge local main 5ab3f577 (story-progress-clock-v1, mac lane, supervisor redesign off) into the branch: registry collateral re-applied after story-progress-clock-v1 (this switch stays last); mechanical test index/list updates redone on main's test files. Post-merge gates: `just lint` ok, `just build` ok, `just test` agent 3031, viewer 1445, pytest 3166 (zero skips); `just coverage` agent 97.22/93.04/97.57/99.16, viewer 95.09/91.07/93.85/97.70, Python lines 97.11 branches 92.69 functions 100; fixed-cli check exit 0 on the three bundle definitions (worktree root).
- [x] Multi-model review loop until clean (round 1, all LGTM on f71366f0)

## Game grounding (pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean)

Every box is drawn YES above NO (gText_YesNo "YES\nNO"; battle boxes BattleCreateYesNoCursorAt row 9+2*pos). From NO, UP reaches YES; from YES, DOWN reaches NO; A answers the highlighted row. Menu_ProcessInputNoWrap (menu.c:1013) checks A, then B (MENU_B_PRESSED), then UP/DOWN through Menu_MoveCursorNoWrapAround (clamps, no wrap). Battle boxes guard UP on cursor != 0 and DOWN on cursor == 0. Checked by hand: wallclock.c:843 Task_SetClock_HandleConfirmInput (`case 1: case MENU_B_PRESSED:` back to adjustment), main_menu.c:1626 name confirmation, script_menu.c:224 Task_HandleYesNoInput (B → gSpecialVar_Result 0), battle_script_commands.c:5807 Cmd_yesnobox (B sets CURSOR_POSITION 1), battle_controller_player.c:1420 PlayerHandleYesNoInput (B closes without choosing), start_menu.c:1003 SaveConfirmInputCallback. A read-only inventory subagent checked the rest (file:line in the module docstring/table).

Covered active_ui phases (B also answers NO in every one): name_confirmation, clock_confirmation, starter_confirmation, the 11 party_*_confirmation, evolution_move_confirmation (normal and trade), egg_hatch_nickname_confirmation, pokeblock_feed_confirmation, slots_quit_confirmation, the 13 Task_CallYesOrNoCallback phases (menu_confirmation, shop/bag/pokeblock/pyramid/decoration/secret-base), field_confirmation, pc_toss_confirmation, field_yes_no, pc_confirmation, 4 move_relearner_*_confirmation, save/save_overwrite/pyramid_retire, clear_save_confirmation, frontier_record_confirmation, 4 minigame play-again boxes, trade_confirm/trade_cancel_confirm, 2 union_room_chat boxes, 3 union_room prompts, wireless_group_confirmation, factory_rental/swap_confirm. Battle: the four battle-script boxes (learn_move, stop_learning_move, yes_no, nickname_caught) with B; the forfeit box (battle input yes_no) without the B clause. Wrapping/toggling boxes (dodrio, factory, union room chat) keep both sentences true.

Left out (no line): easy_chat and mystery_gift (reader does not tie the cursor to the drawing sub-state), union_room_try_accept_chat_request (state 21 has no box in the game; it is state 19), wireless_leader_confirmation (reader says ready while noDraw erases the box). Not YES/NO: gender_selection, boolean "YES/NO" detail facts, reset_rtc_confirmation.

## Closing the Loop

- OFF bytes: the synthetic clock/field_yes_no/save readouts and the ef9f fixture readout render to the same sha256 (2f969c8f…) with the main checkout's pokebench_env and with this branch's switch off.
- `fixed-cli check` passes for bundle-v-control, bundle-cook-1h and whole-map-cook-1h: the dist entry reads the main checkout (mainCheckout()), so it was also run through `main(["check",id], deps)` with root = this worktree (start saves resolved from the main checkout's ignored runs/): all exit 0.
- Pending experiment parses with parseExperiment, no queuePosition; readiness row added (PENDING).
- Explainer: `just pages-check` clean; copied to main runs/mockups/yes-no-answer-readout-v1/, 200 at http://127.0.0.1:8791/yes-no-answer-readout-v1/yes-no-answer-readout-v1.html; desktop and 375px screenshots opened (one overlapping SVG label fixed). Card link and /explainers route covered by panels.test.ts and server.test.ts; no live 8790 click (viewer restart not allowed in this task).

## Session Log

## Surprises

- test_readout_truth's ROM replay renders recorded runs with their recorded off lists, which predate this switch, so a recorded field_yes_no state gained the line; the switch was added to that test's NEW (newer-than-recording, forced off) set like the other new readout switches.
- `fixed-cli check` always reads the main checkout's experiments/ (mainCheckout()).

## Multi-Model Review Log

Round 1, frozen packet base 5ab3f577 (local main) head f71366f0, `git diff` sha256 dcc4ccf0ab6f8d9de4d3e33788ad2d9d80358fb3fc53458304c13c063c3b4251; principles self-review PB1-PB13 zero FAIL (runs/yes-no-answer-readout/review-r1/principles.md); boundary runs/yes-no-answer-readout/review-r1/boundary.md. No local inference reviewers.
- Claude: `claude -p` failed ("OAuth session expired and could not be refreshed"); fresh read-only Claude subagent (the operator-approved fallback) verified the digest, hand-checked the handlers: VERDICT: LGTM. NITs: worklog "Write tests" box unchecked (fixed); a battle line would follow the Menu line if active_ui were ever None (text still true; battle always has an active_ui); handler strings are documentation.
- Grok (cursor-grok-4.5-high): VERDICT: LGTM. NITs: same worklog box; the pending experiment's incumbent keeps expanded-menu-battle-information-v1 off, so only incumbent phases (Birch, clock) show an Interface line there (and so this line); activation phases still show it.
- GPT: cursor gpt-5.6-sol-xhigh unavailable ("ActionRequiredError: You've hit your usage limit"); Codex default model refused ("gpt-6.1-sol is not supported when using Codex with a ChatGPT account"); isolated `codex exec --ephemeral --sandbox read-only -m gpt-5.6-sol -c model_reasoning_effort=xhigh`: no findings, VERDICT: LGTM.
No accepted fixes, so no round 2. Logs under runs/yes-no-answer-readout/review-r1/ (ignored).

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive after landing
