# Six-hour run logs: read them whole

## Operator report

2026-10-20 9:24 AM ET, the operator: "When I look at the frontier graph, I don't see the latest 6-hour cook run."

## Cause

`bundle-cook-6h-v2` ran both trials to the 6-hour wall cap (`run_end reason budget`). Their logs are 1,199,379,889 bytes (control `2026-10-20T03-02-13_qwen36-gpu0_8d39`) and 558,104,423 bytes (bundle `…gpu1_f28d`); 92% of the control log is `state` events (~37 KB each).

1. The viewer's streaming readers (`workbench-reader.ts`, `frontier-recording.ts`) refuse logs over 512 MiB: both runs show "Run log exceeds the streaming byte bound; no split graded", status invalid, off the frontier graph.
2. The fixed-run runner reads the whole log into one string (`fixed-runner.ts` `events()`, `classifyTrial`); Node cannot build a string over 0x1fffffe8 characters, so no outcome was recorded and both lanes retry every 5 minutes.

## Milestones

### M1

- [x] RED: a re-iterable streaming line reader; `classifyTrial` grades from lines in one pass; the runner, `fixed-run analyze` and receipt analysis read logs through it; the viewer bound is a shared constant above the six-hour logs
  - RED run: run-log.test.ts fails to load (no module); 7 classifyTrial cases fail because a one-shot line stream does not grade like the whole text.
- [ ] GREEN
- [ ] Gates: `just test`, `just coverage`, `just lint`
- [ ] Proof: classify the real 1.2 GB log with the built code
- [ ] Review: Claude, Grok, GPT
- [ ] Land, restart viewer, restart the runner so it records both outcomes, confirm both runs on the frontier graph

Non-goals: shrinking `state` events (a recorder change; follow-up), timeline changes, any change to run data.
