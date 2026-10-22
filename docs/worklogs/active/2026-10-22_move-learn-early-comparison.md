# move-learn-early-comparison-v1

Operator approval: The operator 2026-10-22 1:44 AM ET ("yes") to the proposal in the "Peck and Double Kick declined" thread.

## Why

Run 2026-10-22T00-22-02_qwen36-gpu0_d951 (bundle arm) answered learn_move forget "none" for DOUBLE KICK at turn 430 (1:31 AM ET) from the evolution scene's "COMBUSKEN is trying to learn DOUBLE KICK." page (event seq 16473, MVSTATE 1). move-learn-comparison-v1 lists the moves only at the YES/NO box and the forget-a-move list, so the model never saw DOUBLE KICK's type, power or description. In run ea04, the same model, shown the block at the box, reasoned Fighting beats Rock and learned it.

## Behavior

ON (needs move-learn-comparison-v1): the same comparison block on the pages before and while the game asks: evolution and trade scenes at MVSTATE 0-3, and in battle on the pages "<mon> is trying to learn <move>." and "But, <mon> can't learn more than four moves." No question line on those pages. Game server switch, default off.
OFF: today's readout bytes.

## Milestones

- [x] M1 RED: tests from d951 raw RAM (evolution page, two battle PECK pages)
- [x] M2 GREEN: reader, registration (TS + Python), presets, next-run default
- [x] M3 explainer, pending experiment, readiness row
- [x] Gates: just test, just coverage (90), just lint
- [ ] Review: Claude, Grok, GPT lanes LGTM on the frozen packet
- [ ] Land ff-only, just viewer-main

## Log
- M1 RED: 18 pytest failures + 3 vitest failures (switch not registered, reader ignores early pages). Fixtures: d951 raw-ram 00007183 (evo page, seq 16473), 00007072 / 00007077 (battle PECK pages, seq 16298 / 16306).

## Principles self-review (docs/agent-principles.md)

| ID | Verdict | Evidence |
|---|---|---|
| PB1 Game grades the run | N/A | No grading, milestone or story change. |
| PB2 Failed runs count | N/A | No run records changed or removed. |
| PB3 One run is an anecdote | PASS | No benefit claimed; registered as a pending one-switch experiment (8 per arm boot schema, not powered or approved). The defect itself is shown from recorded raw RAM (d951 seq 16473), not inferred. |
| PB4 Declare harness advantages | PASS | Model-facing readout change is a named, default-off switch recorded in harness_features; text is the game's own move data and descriptions, no type chart, no gym or story facts. |
| PB5 Change one thing | PASS | One switch; OFF reproduces today's readout and state JSON (test_off_is_the_readout_without_the_block, test_the_boxes_and_the_forget_list_are_unchanged, test_state_json_is_unchanged). |
| PB6 Long runs fail where short can't | PASS | Found in a 70-minute bundle run; adds at most 7 lines on move-learning pages only. No truncation of model context. |
| PB7 No event log, didn't happen | PASS | Readout lines reach the model through the recorded tool results; fixtures are byte-for-byte raw-RAM archives with sha256 provenance. |
| PB8 Misbehavior loud, bounded | PASS | Harness read failures stay loud and bounded: a failed read on a matching page is a visible HARNESS BUG line (test_a_failed_read_on_a_page_is_a_visible_harness_bug); non-learning battle pages read no memory, a page naming another learner reads only the learner slot, another move only its name, and evolution pages never take the battle path (counting-reader tests, test_an_evolution_page_never_takes_the_battle_path). Model tool-call validation is unchanged. |
| PB9 Rock-solid-or-ask | PASS | Scope (pages only, no question line, no tool change) is the proposal the operator approved ("yes", 1:44 AM ET). Step set 0–3 grounded in pret evolution_scene.c MVSTATE_* and T_MVSTATE_*. |
| PB10 No carve-outs | PASS | No skips, excludes or threshold changes; existing tests changed only for registry positions and the one ON-behavior expectation (no comparison while printing now asserts with the switch off). |
| PB11 Verify pinned dependency | N/A | No dependency or vendor change. |
| PB12 macOS privacy prompts | N/A | ROM read only through POKEBENCH_ROM in tests, as before. |
| PB13 Close the loop | PASS (in progress) | RED 6c014bc7b, GREEN 37225c00e, review-round-1 fix ae1b0b9c3 and pin 0d5359cf9 recorded with gates; review round 2, landing and the live viewer check are still open and recorded below when done. |
- Bundle membership: The operator 2026-10-22 1:49 AM ET, "This fix should go in the bundle." Added to the bundle arm (switches list, base off) of bundle-v-control-2h, bundle-v-control, bundle-cook-1h, whole-map-cook-1h and whole-map-pair-2h, the five fixed bundles that carry move-learn-tool-v1. Control arm stays off.
- M2 GREEN: reader (move_learn.py EARLY_STATES 0-3, battle pages by regex then learner check), game_state/rerender wiring (needs move-learn-comparison-v1), registration in features.ts, play-preset, next-run, legacy set, SERVER_FEATURES (TS + Python, default off). Registry-position test updates across ~40 agent tests and 13 env tests. Wiring deleted once (rerender move_learning_early_enabled=False): 9 new tests red; restored.
- M3: explainer docs/explainers/move-learn-early-comparison-v1.html (pages-theme, pages-check clean), README, FEATURE_EXPLAINERS mapping + panels/server tests; experiments/move-learn-early-comparison-v1.json pending (incumbent = d951 recorded bundle arm with this off); readiness row.
- Gates: just coverage pass (agent 4432, viewer 1669 tests; Python lines 97.38% branches 93.38% functions 100%), just lint pass, just verify-vendor OK. New env tests 53 pass.

## Review round 1 (packet a637f683c..37225c00e, diff sha256 184d0e37…696f)

- **Claude** (Claude CLI, `CLAUDE_CONFIG_DIR=~/.claude-review`, plan mode): `VERDICT: LGTM`. Hardening notes: evolution-decision-v1 OFF reads gMoveToLearn from the old address (pre-existing for move-learn-comparison-v1); `_with_state` typed `object` (fixed: now `ActiveUi`, ignores removed).
- **GPT** (isolated Codex CLI `gpt-5.6-sol` xhigh): `VERDICT: BLOCKING`, four findings. Triage:
  1. Battle page for another learner read the move before checking ownership; a cleared gMoveToLearn could surface a HARNESS BUG. Accepted, fixed: slot and party name first, then the move name on page 1, then the learner; counting-reader tests.
  2. With evolution-decision-v1 OFF, an evolution page fell through to the battle path and surfaced a gBattleStruct HARNESS BUG the switch introduced. Accepted, fixed: only a battle screen's message pages take the battle path; test that the evolution page with evolution-decision-v1 OFF renders the same with the switch on or off. Not accepted: making the comparison require evolution-decision-v1 (pre-existing address issue, every arm has it on, a dependency change needs the operator).
  3. source.commit pinned the RED commit. Accepted: repinned to the fix commit, notes corrected.
  4. panels.test loop cost O(K×F). Rebutted: one id added to an existing loop pattern; no shared-gate change in scope.
- **Grok stand-in** (isolated Codex CLI `gpt-6-astra` xhigh, the operator "yes" 2026-10-22 2:14 AM ET): round 1 still running when round 2 was sealed; superseded.
- Fix verified RED-first: reverting move_learn.py fails 3 new tests; reverting the screen gate fails the evolution test.
- Repinned experiments/move-learn-early-comparison-v1.json source.commit to ae1b0b9c36c9ecd0835caad321fd98925112c0fb.
- Repin commit follows the fix commit.
- Round-1 Grok stand-in (`gpt-6-astra` xhigh) finished on packet 37225c00e: `VERDICT: BLOCKING`, the same ownership-before-read finding as GPT #1 (already fixed in ae1b0b9c3); PB8/PB13 wording tightened.
- Gates on 0d5359cf9 + this worklog edit: just coverage pass (agent 4432, viewer 1669; Python lines 97.38% branches 93.40% functions 100%), just lint pass, verify-vendor OK.

## Review round 2 (packet a637f683c..6b1e92d63, diff sha256 05f76afd…1427)

- **Claude** (Claude CLI, plan mode): `VERDICT: LGTM`.
- **Grok stand-in** (isolated Codex `gpt-6-astra` xhigh; The operator "yes" 2026-10-22 2:14 AM ET while Cursor is out of usage): `VERDICT: LGTM`.
- **GPT** (isolated Codex `gpt-5.6-sol` xhigh): `VERDICT: BLOCKING`, test-evidence asks only: a production-shaped trade-scene fixture (the trade path shares the reader and step numbers; flag-only test today) and batching the panels.test explainer loop (existing pattern). Confirmed both round-1 bugs fixed and OFF parity; no code defect.
- The operator 2026-10-22 9:35 AM ET: "land now". Landing board: Codex milestone-drought-suppression held LANDING since 2:17 AM with no reply; The operator 9:54 AM ET: "move ahead" (land-move used).

## Landing

- `git merge --ff-only 6b1e92d63` on main (main was a637f683c, the reviewed base). Merge SHA 6b1e92d63.
- `just build` then `just test` on main: agent 4432, viewer 1669, env 3947 passed (viewer tests need the fresh agent dist).
- `just viewer-main`: 8790 at 6b1e92d63, 3 live runs kept (d51d GLM, 704c gpu0, 2aca gpu1), all live with no problem. Explainer served 200 at /explainers/move-learn-early-comparison-v1.html; the live Harness Config has the MOVE-LEARN EARLY COMPARISON card with "Read explainer" linking it.
- Live model check: next bundle-arm launch from this pin will carry the switch; not yet observed in a run.
