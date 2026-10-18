# Frontier checkpoint capture

## Problem Statement

PokeBench can save one native emulator state selected by `POKEBENCH_CHECKPOINT_AT`, but a frontier run does not preserve each newly observed required progression milestone. The operator authorized a P0 runner improvement so the two independently launched runs can each keep their own milestone checkpoints while the shared archive records the first arrival for each milestone without overwriting a winner. Captures must retain native-event and run provenance, exclude legacy, optional activity and trainer milestones, ignore `present_at_start`, surface failures without changing benchmark grading, and preserve the existing single-target environment behavior.

## Skills Loaded

`agent-observability`, `pokebench-story-milestones`, `feature-worklog`, `execute-worklog`, and `close-the-loop`. `feature-switch` and `feature-explainer` were inspected and do not apply: this is measurement/recording infrastructure and does not change model input, tools, actions, prompts, or defaults.

## Architecture

The agent-owned milestone catalog will expose the same required progression sequence used by the story frontier, excluding legacy aliases, optional activities, and optional trainer victories. Checkpoint capture will support two modes: the existing single named target and an all-frontier mode enabled explicitly for runs. Every qualifying observed event is serialized through one capture queue. Each successful capture writes a run-local `.state` plus JSON sidecar under that run's `checkpoints/` directory.

After the run-local pair is complete, capture writes a complete immutable candidate pair under a shared milestone library and atomically creates that milestone's first-arrival index with exclusive-create semantics. A losing run keeps its run-local pair but cannot replace the winner. The index points only to an already complete candidate. Capture errors reject the capture queue and are reported by the runner; they do not synthesize milestones, stop targets, or change run grading.

Native milestone events are produced from a recorded observation and exclude `field_transition` through their game-owned predicates where supported. The current API can pause immediately after that observation, but it does not expose a separate emulator-wide quiescence certificate. This change will preserve that exact first-observed snapshot boundary and will not invent a stronger stability claim.

## Invariants

- INV-1: All-frontier capture accepts only the canonical required progression catalog; legacy aliases, optional activities, optional trainer milestones, and `present_at_start` never create checkpoints. Test with mixed milestone events.
- INV-2: Existing `POKEBENCH_CHECKPOINT_AT=<native milestone>` behavior remains single-target and captures once. Invalid/legacy targets still fail before launch. Test the environment parser and single-target sequence.
- INV-3: Each qualifying milestone is captured at most once per run, in observation order, with pause/checkpoint/unpause serialized. Test duplicate and rapid successive events.
- INV-4: A run-local state is never published without its sidecar provenance. Sidecars bind the event sequence/evidence/time/origin, run start identity, ROM, harness revision, features, start state, and state digests. Test exact metadata and write failure.
- INV-5: The shared first-arrival winner is never overwritten. Its exclusive index points only to a complete candidate pair; concurrent/losing claims preserve each run-local pair. Test a pre-existing winner and exclusive-create failure.
- INV-6: Capture failure is surfaced through `settled`/`close`, always attempts to unpause, and does not alter milestone events, stop reasons, or benchmark grading. Test pause, endpoint, digest, disk, and promotion failures.

## Security Review

All filenames come from the closed milestone catalog and run IDs already validated by the runner. No shell commands or user-derived traversal are introduced. State bytes are bounded and digest-verified by the existing server/client contract. Shared promotion uses exclusive creation and never overwrites an existing first-arrival index. The ROM remains external and no save-state artifact is staged in Git.

## Milestones

**M1 — Contract and RED tests**
- [x] Define the required-frontier capture contract in failing tests: catalog exclusions, all-frontier queueing, provenance, first-arrival non-overwrite, and explicit failure propagation.
- [x] Run focused tests and record the expected failures.
- [ ] COMMIT: `test(checkpoints): cover frontier milestone capture` (RED)

**M2 — Runner implementation**
- [ ] Implement the catalog, capture modes, serialized run-local writes, provenance sidecars, and race-safe first-arrival promotion.
- [ ] Preserve the single-target environment behavior and wire explicit all-frontier capture into the runner.
- [ ] Perform deletion/restoration receipts for catalog filtering, serialization, and exclusive first-arrival claiming.
- [ ] Run focused tests and a fake-server/filesystem rehearsal.
- [ ] COMMIT: `feat(checkpoints): capture required frontier milestones` (GREEN)

**M3 — Gates and review**
- [ ] Run `just test`, `just lint`, `just build`, `just coverage`, and `just verify-vendor`.
- [ ] Principles self-review with zero FAIL rows.
- [ ] Run the required cloud multi-model review loop on one frozen packet; triage findings under the two-round rule.
- [ ] Report the branch commit and evidence to the coordinator; do not launch runs, approve experiments, merge, or touch canonical `main`.

## Closing the Loop

Proof requires RED then GREEN focused tests, a fake-data capture rehearsal showing two run-local checkpoint sets and one immutable first-arrival winner, full repository gates including the 90% coverage floors, and review. No real gameplay/model run is authorized in this worktree. Landing, viewer restart, experiment launch, and live milestone capture remain separate coordinator/operator actions.

## Session Log

- 2026-10-18: Created this worklog before implementation. Read `CLAUDE.md` and the five applicable skills. Read-only discovery found the existing single-target `CheckpointCapture` and the viewer-owned required frontier list. The operator's request is the approval for this scoped worklog and implementation; gameplay launch remains excluded from this lane.
- 2026-10-18: RED receipt: `pnpm --filter @pokebench/agent test -- checkpoint-capture.test.ts` ran the agent suite (2,452 existing tests passed) and the seven new behavior assertions failed: required catalog missing, no all-frontier capture, no full provenance, no promotion, failures did not continue/record, and the new environment selector was absent. The first attempt was tooling-only (`vitest: command not found`); `just setup` installed the isolated worktree dependencies before the valid RED run.

## Surprises

- The existing checkpoint sidecar binds the milestone sequence and state hashes but not the full run-start provenance needed for a promoted reusable library.
- The current native checkpoint endpoint returns a state after an immediate pause, but no independent stability/quiescence certificate exists. The implementation will label the capture as first-observed rather than claiming an unprovable stable overworld state.

## Multi-Model Review Log

Not started.

## Boy Scout Log

None. Scope is limited to checkpoint capture and its catalog/tests.

## Archive Milestone

- [ ] ASK USER: archive only after landing and live proof.
