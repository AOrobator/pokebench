# Run-end checkpoint

Branch `claude/run-end-checkpoint`. Asked by the operator 2026-11-10 ("yes" to the guardrail proposal) after Opus 12bf stopped at turn 248 between milestones: the newest native save was B2F at turn 182 and an input replay to turn 248 drifted at a wild encounter. Not model-facing (recording only), so no feature switch; it rides the existing checkpoint capture (`POKEBENCH_CHECKPOINT_FRONTIER`, default on).

## M1 save the native state on every run end
- [x] RED: `checkpoint-capture.test.ts` (RUN_END save with reason/turn, failure recording, no-end close), `run-finish.test.ts` (tasks get the terminal reason after the final snapshot).
- [ ] GREEN: `CheckpointCapture.close(end)` saves `runs/<id>/checkpoints/RUN_END.{state,json}` after pending milestones, never promoted to the library; failure writes `RUN_END.error.json` and is logged without changing the end reason. `RunLifecycle.beforeRunEnd` tasks receive the terminal reason.
- [ ] Gates (CPU window), Claude + GPT review (Grok waived until 11/17), land.
- [ ] Real-ROM proof: a short scratch run stopped mid-route leaves a RUN_END.state that loads to the same map/position.
