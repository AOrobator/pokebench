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
- [x] GREEN: `run-log.ts` (`RUN_LOG_MAX_BYTES` 8 GiB, `fileLines` re-iterable chunked line reader, `linesOf`); `classifyTrial` grades in one pass from lines; runner `events()`, `fixed-run analyze` (`rescoreTrials`/`completeLog`) and receipt analysis read through `fileLines`; workbench and frontier readers use the shared bound.
- [x] Gates: `just lint` clean; `just coverage` passes (agent 2702, viewer 1352, env 2894; Python 96%)
- [x] Proof (built code, real logs): control `…gpu0_8d39` valid, wall cap, furthest TEAM_AQUA_WOODS_EVENT_COMPLETE, 2.2 s; bundle `…gpu1_f28d` valid, wall cap, furthest RUNNING_SHOES_RECEIVED, 1.0 s. Workbench reader streams 110,122 and 79,167 events at ~185 MB RSS.
- [x] Review: Claude, Grok, GPT
- [x] Land, restart viewer, restart the runner so it records both outcomes, confirm both runs on the frontier graph

Non-goals: shrinking `state` events (a recorder change; follow-up), timeline changes, any change to run data.
- Review round 1: Claude LGTM; Grok and GPT BLOCKING on one finding: `completeLog` used `first ??= e.type`, so a first event with `type: null` let a later run_start count as first. RED test added.
- Fix: `completeLog` takes the first event's type with a seen flag. Gates rerun: lint clean, coverage passes.
- Review round 2: Claude and Grok LGTM; GPT BLOCKING: `rescoreTrials` read the log twice (`completeLog`, then `classifyTrial`), so a one-shot stream or a log replaced between passes could be graded on different bytes than were checked. RED test added.
- Fix: `rescoreTrials` grades and checks completeness in one pass (`Completeness.tap` feeds `classifyTrial`). Gates rerun: lint clean, coverage passes.
- Merged main (16a96d7d, baseline log streaming from another thread; no overlap). Gates rerun on the merge: lint clean; coverage passes (agent 2702, viewer 1355, env 2894).

## Review and landing

- Round 3 on frozen packet `16a96d7d..a979aa77` (SHA-256 `12bb2477…f60e`): Claude (read-only subagent; CLI login expired), Grok (Cursor `cursor-grok-4.5-high`) and GPT (Codex CLI `gpt-5.6-sol` xhigh; Cursor GPT at its usage limit) all VERDICT: LGTM. Artifacts in `runs/reviews/big-run-logs/`.
- Landed `git merge --ff-only a979aa77`; `just build` + `just test` on main pass (agent 2702, viewer 1355, env 2894).
- `just viewer-main` → viewer at `a979aa77`. The old runner (pid 68351, still the pre-fix build, looping on adopt) ignored SIGTERM; with no trial or server alive it was killed and relaunched through `just fixed-run run bundle-cook-6h-v2`, which recorded both outcomes and finished: bundle `…f28d` valid, wall cap, RUNNING_SHOES_RECEIVED; control `…8d39` valid, wall cap, TEAM_AQUA_WOODS_EVENT_COMPLETE.
- `/api/workbench`: both runs ended, no problem, 33 and 49 splits; the comparisons page frontier chart draws both under the v2 experiment.
