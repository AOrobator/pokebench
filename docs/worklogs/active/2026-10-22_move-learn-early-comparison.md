# move-learn-early-comparison-v1

Operator approval: The operator 2026-10-22 1:44 AM ET ("yes") to the proposal in the "Peck and Double Kick declined" thread.

## Why

Run 2026-10-22T00-22-02_qwen36-gpu0_d951 (bundle arm) answered learn_move forget "none" for DOUBLE KICK at turn 430 (1:31 AM ET) from the evolution scene's "COMBUSKEN is trying to learn DOUBLE KICK." page (event seq 16473, MVSTATE 1). move-learn-comparison-v1 lists the moves only at the YES/NO box and the forget-a-move list, so the model never saw DOUBLE KICK's type, power or description. In run ea04, the same model, shown the block at the box, reasoned Fighting beats Rock and learned it.

## Behavior

ON (needs move-learn-comparison-v1): the same comparison block on the pages before and while the game asks: evolution and trade scenes at MVSTATE 0-3, and in battle on the pages "<mon> is trying to learn <move>." and "But, <mon> can't learn more than four moves." No question line on those pages. Game server switch, default off.
OFF: today's readout bytes.

## Milestones

- [ ] M1 RED: tests from d951 raw RAM (evolution page, two battle PECK pages)
- [ ] M2 GREEN: reader, registration (TS + Python), presets, next-run default
- [ ] M3 explainer, pending experiment, readiness row
- [ ] Gates: just test, just coverage (90), just lint
- [ ] Review: Claude, Grok, GPT lanes LGTM on the frozen packet
- [ ] Land ff-only, just viewer-main

## Log
- M1 RED: 18 pytest failures + 3 vitest failures (switch not registered, reader ignores early pages). Fixtures: d951 raw-ram 00007183 (evo page, seq 16473), 00007072 / 00007077 (battle PECK pages, seq 16298 / 16306).
