# Clock set resumes on the story frontier

Requested 2026-10-14 in the project thread: runs started from the after-clock checkpoint (`CLOCK_SET.state`) never appear on the story frontier graph.

Takeover note: the fix was found as idle uncommitted edits in the main checkout (last touched 22:21 local, author unknown). The operator chose to land that work. It was copied as a patch into this worktree; the main checkout was not modified. Unrelated worklog edits for other features in that patch were left behind for their owners.

## Causes

1. `plottedAgent` in `frontier.ts` requires `config.start === "boot"`; checkpoint runs record `save_state`.
2. `frontier-recording.ts` rejected agent logs over 64 MiB, so long runs (e.g. `20-12-53_think-fast_c547`, 78 MB) became problems. The streaming reader already bounds at 512 MiB.

## M1: Birch send-off measurement (`birch-rescue-requested-v1`)

- [x] RED: env/agent tests for town state 0x4050 in 2/3/4
  COMMIT: `test(milestones): Birch send-off is town state 2-4, not the rival meeting (RED)` (5634231)
- [x] GREEN: story reader, schema, milestone, hint step, switchboard/target/split lists. Agent 1037, Python 1868 pass.
  COMMIT: `feat(milestones): record the Birch send-off from Littleroot town state` (af86c90)
- Measurement feature, not a behavior switch. The hint text only changes model input when `next-milestone-hint-v1` is ON (pending experiment; the running hint batch uses its own frozen build).

## M2: frontier shows Clock set resumes (viewer only, no switch)

- [x] RED: frontier/workbench tests for resumed runs and the lifted 64 MiB bound (10 failing against HEAD source)
  COMMIT: `test(viewer): Clock set resumes and long agent logs reach the story frontier (RED)` (ec60767)
- [x] GREEN: `config.resume`, dashed hollow series after Clock set, notices, run details
- [x] Real data: 11 eligible resumed runs plotted on a scratch viewer (port 8806)
- [x] Gates: viewer 577 / agent 1037 / Python 1868 pass; coverage viewer 97.72/90.59/93.78, agent 98.86/93.9/98.01, Python 96.72/91.93/100; lint (mypy needs the native mGBA binding, absent in this worktree's fresh venv)
- [ ] Review: Claude CLI + Cursor Grok
  - Round 1 (packet runs/reviews/clock-resume-frontier): Claude CLI failed auth (OAuth session expired, exit 1). Grok BLOCKING: live resumed marks white-on-white; resumed-only overlays missing from model legend; y-scale counted off-chart pre-clock splits; summary medians mix New game and Clock set starts in mixed selections. All accepted.
  - [x] RED for round-1 fixes (2 failing against HEAD source) (c5bb8f5)
  - [x] GREEN: hollow marks stroke the series color, legend lists resumed models, scale uses only plotted points, summary warns on mixed starts
- [ ] Operator approval, then local merge to main


  - Round 2: Cursor Claude Opus hit its usage limit (exit 1). Grok BLOCKING: `.wb-live-run .wb-mark` CSS could still whiten live resumed marks; Birch not in the native objective catalog. Accepted the CSS carve-out (real-browser computed stroke rgb(37,131,189) on the live resumed mark at 8806). Declined the catalog addition: objectives are model-facing behavior and post-clock milestones are not in that catalog either.
  - [x] RED: stylesheet must carve resumed live marks out of the white stroke
