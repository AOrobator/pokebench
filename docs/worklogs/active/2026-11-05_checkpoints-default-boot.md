# Checkpoints on by default for boot starts

Operator approval: The operator said yes on 2026-11-05 to making frontier checkpoints the default for boot starts. Run 274b saved none because `POKEBENCH_CHECKPOINT_FRONTIER` was unset.

## Scope

- `checkpointSelection` takes the run's start. A boot start with the variable unset captures every required frontier milestone.
- `POKEBENCH_CHECKPOINT_FRONTIER=0` is the OFF switch and restores the old no-capture behavior. `1` keeps its meaning. Save-state starts stay opt-in.
- No model-visible change, so this is a measurement setting and not a registered harness feature (feature-switch skill). Pause evidence from run 5f0f: at most 145 ms a save, about 5.3 s over nearly 8 hours.

## Progress

- [x] RED: tests for the boot default and the OFF switch (3 failed, 15 passed). COMMIT: `test(checkpoints): pin the boot default and the off switch` (99f838c7c)
- [x] GREEN: selection, live.ts wiring, skill text. Focused: 18 passed; agent tsc and changed-file eslint clean.
- [ ] Gates in a CPU window
- [ ] Claude, Grok and GPT review
- [ ] Land, then `just test` on main
