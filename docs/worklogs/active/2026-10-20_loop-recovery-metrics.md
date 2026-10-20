# Loop recovery metrics per loop type

## Problem Statement
Follow-up item 6 (the operator "yes" 2026-10-20 12:44 PM ET): replace the single "story milestone or new map within 30 turns" test with a shared safety check plus a recovery test per loop type (navigation, dialogue, battle menu, story-character stall), and keep stall telemetry when old briefings retire (done in positive-supervisor-v1: retired briefings are diagnostic loop_guard events).

## Architecture
Measurement only, no switch (feature-switch skill: measurement features do not change model input). `packages/agent/src/loop-recovery.ts` (recoveryCollector streams events; loopRecoveries for arrays) and `loop-recovery-cli.ts` (`just loop-recovery [--runs-root DIR] <run_id> ...`, streams events.jsonl line by line). run-analysis skill section "Loop guard effectiveness".

## Milestones
**M1**
- [x] RED: loop-recovery.test.ts (types, each recovery test, intervention sources, safety/relapse, f28d turn 450, CLI)
- [x] GREEN: loop-recovery.ts, loop-recovery-cli.ts, just loop-recovery, run-analysis skill section.
- [ ] Review, landing

## Session Log
- Branch claude/loop-recovery-metrics from main 2678b3e8. f28d (558 MB) streams in about 6 s.

## Surprises
## Multi-Model Review Log
## Boy Scout Log
## Archive Milestone (user-gated)
- Gates: agent 2841, viewer 1386 (server-human needs a built viewer dist in a fresh worktree; passes after pnpm -r build); lint clean; agent coverage 97.2/92.9/97.6 (loop-recovery.ts 98.7/90.7/100).
- Review r1 (f08aa162): Grok and Claude BLOCKING on the same bug: breaker and auto-talk events are stamped turn+1, so each fire counted itself as a relapse. Fixed: relapse = same source with a later seq within the window from the fire; safety ignores a run end before the fire; test in the recorder's shape. Agent tests pass.
- Review r2 (41a7a90f): Claude LGTM; Grok BLOCKING: a fire right after the readout that changed the Story characters line was typed from the older roster. Fixed: the latest roster before the fire types it; recorder-order test (MAY line then stall_gate; none line then drought). Also: the CLI reports a bad line and exits 2.
