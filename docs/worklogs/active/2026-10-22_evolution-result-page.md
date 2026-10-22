# Evolution result-page acknowledgment

## Approved scope
User: "Go ahead with the minimal fix and the readout correction. Add the regression tests, get it reviewed, and land it on main so it’s actually in the bundle."
Repair the existing evolution-decision-v1 path only. Recognize native waiting move-learning result text at Task_EvolutionScene state 15 after a declared evolution decision; report the waiting result correctly. No move-choice policy, tools, schema, new loop rules, measured runs, or changes to frozen historical logs.

## Evidence and native ownership
Run 2026-10-22T00-22-02_qwen36-gpu0_d951: choose_evolution evolve turn 425; learn_move forget none turn 430, result seq 16514; state seq 16513 raw archive 7202, frame 256445. COMBUSKEN did not learn DOUBLE KICK. State 15, move state 11, task flags 129. Printer 0 waits in battle text at 0x02022E51; result_message_waiting only admits gStringVar4. Retained decision then drops A and B. Source pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 src/evolution_scene.c Task_EvolutionScene EVOSTATE_TRY_LEARN_MOVE, MVSTATE_CANCEL, EVOSTATE_LEARNED_MOVE; src/text.c TextPrinterWait. Matching ROM f3ae088181bf583e55daf962a92bb46f4f1d07b7.

## Invariants and checks
- Existing switch OFF is unchanged; no frame gate installed, same legacy readout.
- Result acknowledgment requires native evolution state 15, printer 0/window 0, active waiting printer, no autoscroll; battle text only after TASK_BIT_LEARN_MOVE.
- Real YES/NO move choices remain under caller control. No learned-move strategy.
- Production server factory, state/readout, native frame hook and action journal are regression seams.
- Native archive is retained byte-for-byte with provenance and hash; ROM stays external.

## Milestone
- [x] RED regression commit
- [x] GREEN minimal repair and explainer update
- [ ] Gate deletion/restoration; test, lint, build, coverage, vendor
- [ ] Frozen Claude, Grok and independent GPT reviews; synthesis
- [ ] Landing board, ff-only main, main tests and viewer build/live receipt

## Session log
- 2026-10-22: Created isolated branch codex/evolution-result-page at a637f683c. Told Claude. No active run modified.

- RED: five regressions fail at discarded result acknowledgment, including the actual d951 native archive. Tests cover the existing server factory OFF/ON and result states 15/20/21. Receipt /tmp/evolution-result-red.log.

- RED commit dd6bcd338. GREEN: existing gate additionally recognizes the verified battle-text result buffer only with TASK_BIT_LEARN_MOVE, and covers native result states 15/20/21 (same result domain as LearnWait). Readout reports evolution_result ready with the printed page. Tests: 24/24 evolution tests. New tests corrected to turn on expanded controls (synthetic fixture has no save), and assert the readout including its value field; final assertions cover production delivery.

- Guard deletion receipts (each restored before next): /tmp/evolution-result-delete-{battle-buffer,result-state-20,result-state-21,readout-ready,result-bit,readout-wiring}.log. Each mutation failed the named targeted test; /tmp/evolution-result-restored.log: 5 passed. The 20/21 cases independently detect each missing state. Gate/readout twin checks are covered by separate readiness and wiring mutations; no claim that every legacy operand was mutated.
- Worktree setup: initial gate attempts used linked dependencies and exposed mixed main/worktree package identity; first viewer test also preceded its build. Replaced with a complete offline pnpm install and worktree-local Python venv. These setup failures are preserved in /tmp/evolution-result-{test,test-after-build,lint}.log; no source workaround or threshold change.
- The existing switch is present and true in bundle-v-control-2h base.features and the bundle switch list; it also applies to control by the existing operator contract. No experiment added because no new switch is introduced. No bundle promotion or measured benefit claimed.

- Production seam extended: state endpoint returns exact corrected controls; ActionJournal records the automatic A/release and evolution_result menu phase. Native mGBA package is linked into the isolated venv (the module alone, not shared editable environment). Main sync 16b76df84 includes the already-landed early move comparison; no conflict in this patch. Landing board number 4, exact Codex session ID verified.
