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
| PB8 Misbehavior loud, bounded | PASS | A failed read on a page is a visible HARNESS BUG line (test_a_failed_read_on_a_page_is_a_visible_harness_bug); non-learning battle pages read no memory (test_other_battle_pages_read_no_memory). |
| PB9 Rock-solid-or-ask | PASS | Scope (pages only, no question line, no tool change) is the proposal the operator approved ("yes", 1:44 AM ET). Step set 0–3 grounded in pret evolution_scene.c MVSTATE_* and T_MVSTATE_*. |
| PB10 No carve-outs | PASS | No skips, excludes or threshold changes; existing tests changed only for registry positions and the one ON-behavior expectation (no comparison while printing now asserts with the switch off). |
| PB11 Verify pinned dependency | N/A | No dependency or vendor change. |
| PB12 macOS privacy prompts | N/A | ROM read only through POKEBENCH_ROM in tests, as before. |
| PB13 Close the loop | PASS | RED commit 6c014bc7b; GREEN, gates, review and landing recorded below. |
- Bundle membership: The operator 2026-10-22 1:49 AM ET, "This fix should go in the bundle." Added to the bundle arm (switches list, base off) of bundle-v-control-2h, bundle-v-control, bundle-cook-1h, whole-map-cook-1h and whole-map-pair-2h, the five fixed bundles that carry move-learn-tool-v1. Control arm stays off.
- M2 GREEN: reader (move_learn.py EARLY_STATES 0-3, battle pages by regex then learner check), game_state/rerender wiring (needs move-learn-comparison-v1), registration in features.ts, play-preset, next-run, legacy set, SERVER_FEATURES (TS + Python, default off). Registry-position test updates across ~40 agent tests and 13 env tests. Wiring deleted once (rerender move_learning_early_enabled=False): 9 new tests red; restored.
- M3: explainer docs/explainers/move-learn-early-comparison-v1.html (pages-theme, pages-check clean), README, FEATURE_EXPLAINERS mapping + panels/server tests; experiments/move-learn-early-comparison-v1.json pending (incumbent = d951 recorded bundle arm with this off); readiness row.
- Gates: just coverage pass (agent 4432, viewer 1669 tests; Python lines 97.38% branches 93.38% functions 100%), just lint pass, just verify-vendor OK. New env tests 53 pass.
