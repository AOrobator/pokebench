# Checkpoints on by default for boot starts

Operator approval: The operator said yes on 2026-11-05 to making frontier checkpoints the default for boot starts. Run 274b saved none because `POKEBENCH_CHECKPOINT_FRONTIER` was unset.

## Scope

- `checkpointSelection` takes the run's start. A boot start with the variable unset captures every required frontier milestone.
- `POKEBENCH_CHECKPOINT_FRONTIER=0` is the OFF switch and restores the old no-capture behavior. `1` keeps its meaning. Save-state starts stay opt-in.
- Pause cost from run 5f0f: at most 145 ms a save, about 5.3 s over nearly 8 hours.
- Model-visible effect (found by Claude review, verified in the events): a capture that overlaps a tool wait ends that wait early with reason `paused`. In 5f0f, 4 of about 120 saves did this: seq 1588 gave the model "the game is paused, so the battle did not advance", and seq 1070, 1390 and 30908 skipped a settle wait. Run 274b, with no capture, has none. Cause is inferred; pauses are not logged.
- Newly exposed paths: hand `just run-agent` boot runs, viewer-queue runs (`next-run.ts`), boot serial-comparison arms. `launch.sh` and boot fixed trials already had this. `run_start` does not record capture mode.
- No registered feature for now: the variable is the switch, `0` is OFF. Operator decision on this effect is required before landing and is recorded below.

## Progress

- [x] RED: tests for the boot default and the OFF switch (3 failed, 15 passed). COMMIT: `test(checkpoints): pin the boot default and the off switch` (99f838c7c)
- [x] GREEN: selection, live.ts wiring, skill text. Focused: 18 passed; agent tsc and changed-file eslint clean. COMMIT: `feat(checkpoints): save frontier milestones by default on boot starts` (818e1a9d8)
- [x] Gates in a CPU window at 818e1a9d8 on base 3095abed7: just lint, build, test, verify-vendor all exit 0. Agent 2460, viewer 860, env 2901, gateway 38 passed; floors held. First lint try failed only because the clone venv lacked the mGBA binding, copied from the main venv.
- [ ] Claude, Grok and GPT review
- [ ] Land, then `just test` on main

## Frozen boundary

Included: `checkpointSelection` start-aware default, `0` as OFF, live.ts passing `start`, one sentence in the plain-run-launch skill. Non-goals: registered harness feature, viewer changes, `launch.sh` and `fixed-runner.ts` (they still set `1`, which stays valid), any live run. Built in a shared clone because this thread may not create a git worktree; lands by fast-forward.
