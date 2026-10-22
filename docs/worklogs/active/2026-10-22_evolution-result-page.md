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
- [ ] GREEN minimal repair and explainer update
- [ ] Gate deletion/restoration; test, lint, build, coverage, vendor
- [ ] Frozen Claude, Grok and independent GPT reviews; synthesis
- [ ] Landing board, ff-only main, main tests and viewer build/live receipt

## Session log
- 2026-10-22: Created isolated branch codex/evolution-result-page at a637f683c. Told Claude. No active run modified.

- RED: five regressions fail at discarded result acknowledgment, including the actual d951 native archive. Tests cover the existing server factory OFF/ON and result states 15/20/21. Receipt /tmp/evolution-result-red.log.
