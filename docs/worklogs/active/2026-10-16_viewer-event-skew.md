# viewer-event-skew: an older viewer build never silently drops a newer run

Operator report, 2026-10-16 about 5:10 AM EDT: the stats page showed only the control run of overnight round 2 although both lanes were live, with errors like `line 4553: invalid event at : must have required properties action, status, request`.

Root cause: the 8790 viewer was built at `308ddd3e`; the trials run from the pinned harness `6d2be8afb37c`, whose `packages/agent/src/events.ts` adds `battle.message`/`battle.prompt`/`battle.text_phase` to state and battle stops/`battle_auto_presses`/page fields to `dialogue_auto_advance`. The viewer's closed schema rejected those events in `runs/2026-10-16T04-51-03_qwen36-gpu0_54a7/events.jsonl`, the whole run became status `invalid` and fell off the current-run card. The message named the first union member (`operator_control`) instead of the event's own type.

Branch `claude/viewer-event-skew` in `.claude/worktrees/agent-ac78386488eab5966`. Viewer-only plus the agent's `eventProblem`; no harness behavior changes, so no feature switch. Lane freeze: no traffic to 8091/8098/8075/8076, the 8790 viewer and running experiments are untouched; verification uses copies under the gitignored `runs/skew-scratch/`.

## Design

- `eventProblem` validates against the union members whose `type` literal matches the event's `type` (fewest errors wins among same-type members), reports `invalid <type> event at <path>: <message>`, rewrites additional-property errors as `unexpected property <name>`, and gives unknown types and non-objects their own messages.
- The viewer knows its own build from `dist/build-stamp.json`, written after `tsc` by `dist/build-stamp.js` (`git rev-parse HEAD` + `git status --porcelain` in the package dir). No stamp means unknown, which keeps today's strict behavior.
- Skew = the viewer build is known and differs from the run's `run_start.harness` (other commit, or either side dirty). Under skew a schema-invalid event whose envelope is valid is skipped (still order-checked); the run keeps its status, and `problem` reads `viewer build X is older than this run's build Y: … Restart the viewer (just viewer-main).` (older/newer from `git merge-base --is-ancestor` in the viewer tree, else "differs from"). JSON-broken lines, bad envelopes, skipped run_start/run_end, and any schema failure from the same build stay `invalid` (integrity).
- Stats page: the snapshot lists the run's problem in its page problems, and the current-run plate shows it. The single-run stream emits one skew problem instead of the misleading per-line error.
- Docs: fixed-run-launch skill, CLAUDE.md and the justfile say a merge followed by a launch from a newer pin needs `just viewer-main` before the launch check.

## M1: RED, GREEN, gates

- [x] RED tests: agent `events.test.ts` (type-directed `eventProblem`, `eventEnvelope`): 13 of 55 fail. Viewer `src/event-skew.test.ts` (build stamp, `skewOf`, workbench snapshot skew vs same build vs unknown build, broken JSON/envelope/run_end stay invalid, plate problem, single-run stream): file fails to import (`build-stamp.ts` does not exist).
  - RED COMMIT: `test: RED viewer keeps a newer-build run listed with a restart-the-viewer problem, and event problems name their own type`
- [ ] GREEN implementation.
- [ ] Docs: skill, CLAUDE.md, justfile.
- [ ] Gates: test, coverage (90), lint, build.
- [ ] Verified read-only on copies of the two real runs with the 308ddd3e schema.
