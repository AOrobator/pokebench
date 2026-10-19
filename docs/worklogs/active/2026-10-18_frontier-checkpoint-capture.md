# Frontier checkpoint capture

## Problem Statement

PokeBench can save one native emulator state selected by `POKEBENCH_CHECKPOINT_AT`, but a frontier run does not preserve each newly observed required progression milestone. The operator authorized a P0 runner improvement so the two independently launched runs can each keep their own milestone checkpoints while the shared archive records the first arrival for each milestone without overwriting a winner. Captures must retain native-event and run provenance, exclude legacy, optional activity and trainer milestones, ignore `present_at_start`, surface failures without changing benchmark grading, and preserve the existing single-target environment behavior.

## Skills Loaded

`agent-observability`, `pokebench-story-milestones`, `feature-worklog`, `execute-worklog`, `close-the-loop`, `feature-switch`, `feature-explainer`, `experiment-queue`, and `pokebench-experiment-design`. The checkpoint recorder itself is measurement infrastructure and needs no switch. The later continuation-task correction changes model-facing text and therefore follows the feature-switch contract.

## Architecture

The agent-owned milestone catalog will expose the same required progression sequence used by the story frontier, excluding legacy aliases, optional activities, and optional trainer victories. Checkpoint capture will support two modes: the existing single named target and an all-frontier mode enabled explicitly for runs. Every qualifying observed event is serialized through one capture queue. Each successful capture writes a run-local `.state` plus JSON sidecar under that run's `checkpoints/` directory.

After the run-local pair is complete, capture writes a complete immutable candidate pair under a shared milestone library and atomically creates that milestone's first-arrival index with exclusive-create semantics. A losing run keeps its run-local pair but cannot replace the winner. The index points only to an already complete candidate. Capture errors reject the capture queue and are reported by the runner; they do not synthesize milestones, stop targets, or change run grading.

Native milestone events are produced from a recorded observation and exclude `field_transition` through their game-owned predicates where supported. The current API can pause immediately after that observation, but it does not expose a separate emulator-wide quiescence certificate. This change will preserve that exact first-observed snapshot boundary and will not invent a stronger stability claim.

PokeBench review found that save-state runs receive the boot-only initial user task, including when a target is set. `save-state-task-truth-v1` will be a default-OFF guidance switch: OFF preserves the exact old task; ON tells a save-state run that it resumed from a recorded checkpoint while boot runs remain byte-identical. The two continuation runs must explicitly enable it. This is a deterministic correctness repair with production-path tests; its pending registry entry will remain unqueued and will not pretend that a cohort is needed to prove which start kind the runner supplied.

## Invariants

- INV-1: All-frontier capture accepts only the canonical required progression catalog; legacy aliases, optional activities, optional trainer milestones, and `present_at_start` never create checkpoints. Test with mixed milestone events.
- INV-2: Existing `POKEBENCH_CHECKPOINT_AT=<native milestone>` behavior remains single-target and captures once. Invalid/legacy targets still fail before launch. Test the environment parser and single-target sequence.
- INV-3: Each qualifying milestone is captured at most once per run, in observation order, with pause/checkpoint/unpause serialized. Test duplicate and rapid successive events.
- INV-4: A run-local state is never published without its sidecar provenance. Sidecars bind the event sequence/evidence/time/origin, run start identity, ROM, harness revision, features, start state, and state digests. Test exact metadata and write failure.
- INV-5: The shared first-arrival winner is never overwritten. Its exclusive index points only to a complete candidate pair; concurrent/losing claims preserve each run-local pair. Test a pre-existing winner and exclusive-create failure.
- INV-6: Capture failure is surfaced through `settled`/`close`, always attempts to unpause, and does not alter milestone events, stop reasons, or benchmark grading. Test pause, endpoint, digest, disk, and promotion failures.
- INV-7: Checkpoint capture failures produce a durable run-local failure sidecar and the existing `telemetry_error` event/Activity History path without changing the run's terminal reason. Test the recorder seam and event schema.
- INV-8: With `save-state-task-truth-v1` OFF, initial task text is byte-identical. With it ON, only save-state starts use resume wording; boot and targeted goals remain truthful. Test the helper and the real `live.ts` production call.

## Security Review

All filenames come from the closed milestone catalog and run IDs already validated by the runner. No shell commands or user-derived traversal are introduced. State bytes are bounded and digest-verified by the existing server/client contract. Shared promotion uses exclusive creation and never overwrites an existing first-arrival index. The ROM remains external and no save-state artifact is staged in Git.

## Milestones

**M1 — Contract and RED tests**
- [x] Define the required-frontier capture contract in failing tests: catalog exclusions, all-frontier queueing, provenance, first-arrival non-overwrite, and explicit failure propagation.
- [x] Run focused tests and record the expected failures.
- [x] COMMIT: `test(checkpoints): cover frontier milestone capture` (`b40692e6`, RED)

**M2 — Runner implementation**
- [x] Implement the catalog, capture modes, serialized run-local writes, provenance sidecars, and race-safe first-arrival promotion.
- [x] Preserve the single-target environment behavior and wire explicit all-frontier capture into the runner.
- [x] Perform deletion/restoration receipts for catalog filtering, serialization, and exclusive first-arrival claiming.
- [x] Run focused tests and a fake-server/filesystem rehearsal.
- [x] COMMIT: `feat(checkpoints): capture required frontier milestones` (`6b2e3b7b`, GREEN; includes the shared live-run save-task repair)

**M3 — Save-state initial-task truth**
- [x] Add RED helper and production-path tests for boot/save-state and open/targeted tasks.
- [x] Register `save-state-task-truth-v1` default OFF through the complete feature registry/preset/viewer path.
- [x] Add the self-contained explainer and pending correctness-tier experiment record; do not queue or approve it.
- [x] COMMIT: `test(play): cover save-state initial task truth` (`c48d4d06`, RED)
- [x] COMMIT: `fix(play): tell restored runs they resumed` (`6b2e3b7b`, GREEN combined with M2 because both changes share the live-run capture/start wiring)

**M4 — Gates and review**
- [x] Run `just test`, `just lint`, `just build`, `just coverage`, and `just verify-vendor` (coverage aggregate limitation recorded below).
- [ ] Principles self-review with zero FAIL rows.
- [ ] Run the required cloud multi-model review loop on one frozen packet; triage findings under the two-round rule.
- [ ] Report the branch commit and evidence to the coordinator; do not launch runs, approve experiments, merge, or touch canonical `main`.

## Closing the Loop

Proof requires RED then GREEN focused tests, a fake-data capture rehearsal showing two run-local checkpoint sets and one immutable first-arrival winner, full repository gates including the 90% coverage floors, and review. No real gameplay/model run is authorized in this worktree. Landing, viewer restart, experiment launch, and live milestone capture remain separate coordinator/operator actions.

## Session Log

- 2026-10-18: Created this worklog before implementation. Read `CLAUDE.md` and the five applicable skills. Read-only discovery found the existing single-target `CheckpointCapture` and the viewer-owned required frontier list. The operator's request is the approval for this scoped worklog and implementation; gameplay launch remains excluded from this lane.
- 2026-10-18: RED receipt: `pnpm --filter @pokebench/agent test -- checkpoint-capture.test.ts` ran the agent suite (2,452 existing tests passed) and the seven new behavior assertions failed: required catalog missing, no all-frontier capture, no full provenance, no promotion, failures did not continue/record, and the new environment selector was absent. The first attempt was tooling-only (`vitest: command not found`); `just setup` installed the isolated worktree dependencies before the valid RED run.
- 2026-10-18: Coordinator relayed a blocking PokeBench review finding: `live.ts` sends “The game has just booted” after loading a save state. Scope expanded before touching that path. Feature-switch discipline applies because this changes model-facing text. The continuation launches must wait for both the truthful task switch and a cold-load semantic proof.
- 2026-10-18: Save-state task RED receipt: the agent suite ran 2,460 existing tests green and all three new tests failed because `initialPlayTask` does not exist and `live.ts` still constructs boot wording inline. Cases cover boot/save-state, switch OFF/ON, open play, a native target, and the production call site.
- 2026-10-18: Merged canonical `main` at `6f8059fa` into the isolated branch before finalization. Resolved the appended-switch registry churn without reordering any registry, normalized historical definitions to the new default-OFF value, and refreshed the JIT control-base digest after its explicit feature map changed.
- 2026-10-18: GREEN focused receipt: checkpoint capture, save-state task truth, lifecycle ordering, the two-run real-filesystem rehearsal, and cold-load argv forwarding passed (3 files, 33 tests). The rehearsal wrote distinct `run-a` and `run-b` local state/sidecar pairs, complete candidates for both, and kept `run-a` in the exclusive first-arrival index.
- 2026-10-18: Deletion/restoration receipts: (1) replacing the required-frontier membership check with unconditional selection failed the exclusion test with 4 captures instead of 2; (2) removing the promise-chain serialization failed with 2 concurrent captures instead of 1; (3) replacing exclusive first-arrival creation with an ordinary write overwrote the seeded earlier winner and failed; (4) deleting the save-state wording condition made both open and targeted continuation tests return the old boot wording. Each production line was restored and the focused suite returned green.
- 2026-10-18: `just experiments-check` passed all 111 definitions. The new entry is pending with no queue position and explicitly says the boot runner would produce identical arms; correctness comes from production-path tests. `just pages-check docs/explainers/save-state-task-truth-v1.html` passed. Agent package suite passed 156 files / 2,463 tests; viewer package suite passed 84 files / 1,173 tests after rebuilding the agent dependency.
- 2026-10-18: GREEN implementation commit `6b2e3b7b` contains both milestones. They share `live.ts`, the recorded feature list and preset fixtures, so one atomic commit keeps the runnable launch interface consistent.
- 2026-10-18: Full gates after initializing the pinned vendor submodule: `just test` passed agent 2,466, viewer 1,174, and Python 2,478 tests with 229 ROM-dependent skips; `just build`, `just verify-vendor`, `just experiments-check` (111), and the explainer page check passed. The worktree-local `just lint` passed TypeScript and Ruff but its mypy lacked the existing native `mgba._pylib` binding; running the unchanged source through canonical main's binding-equipped mypy passed 92 files. Agent coverage passed at 97.99% statements / 94.24% branches / 98.33% functions / 99.23% lines; `checkpoint-capture.ts` is 96.73% statements / 88.15% branches / 100% functions / 100% lines. Python coverage passed at 97.48% lines / 93.42% branches / 99.43% functions. The aggregate coverage recipe cannot complete because unchanged `packages/viewer/src/server-stream.test.ts` exceeds its fixed 5-second timeout under coverage (one timeout on the aggregate run; a separate viewer-coverage run produced one timeout and one backpressure timing assertion), while all 1,174 viewer tests pass without instrumentation. No retry, timeout widening, serialization, skip, or source workaround was added.

## Surprises

- The existing checkpoint sidecar binds the milestone sequence and state hashes but not the full run-start provenance needed for a promoted reusable library.
- The current native checkpoint endpoint returns a state after an immediate pause, but no independent stability/quiescence certificate exists. The implementation will label the capture as first-observed rather than claiming an unprovable stable overworld state.
- Save-state task wording is not derived from `start.kind` today. This makes a checkpoint continuation internally contradictory even when the state loaded correctly.

## Multi-Model Review Log

Round 1 frozen at `a5a6d54a` (`6f8059fa..a5a6d54a`, binary diff SHA-256 `74afc41446d844e5aeecf5efd534e07e6fe5eef6b1a35fb8e8d8947bec050950`). Principles Adherence: 10 PASS / 3 N/A / 0 FAIL. Cursor Grok returned literal `VERDICT: LGTM` with coordinator-reproduced custody (ask mode could not run shell). Dedicated Claude CLI was logged out; Cursor Opus and Fable, and Cursor GPT exhausted account quota. Local `think_fast`/`think_swarm` are prohibited for PokeBench review because they are benchmark subjects. Fresh no-history Sol and Astra fallback reviewers independently reproduced the packet digest and clean head, then returned blocking findings: an exclusive write can leave a poisoned partial winner index; unsuccessful unpause is not checked; final snapshot failure skips lifecycle drains; and the save-state task wiring test searches source strings rather than observing the delivered task. All are accepted as in-contract defects/evidence gaps. The cumulative fix batch must add late-failure, unpause, lifecycle and production-consumer tests, then repeat principles and the selected review roster.
- Round 1 fix RED: the agent suite kept 2,465 tests green while three new focused assertions failed at the intended seams: the poisoned empty index remained after a later candidate, unpause 503 resolved instead of rejecting, and a registered lifecycle task did not run after final journal failure. The external reviewer independently demonstrated that the source-string task test also survives replacement of the actual delivered task; that mutation receipt is the RED evidence for the consumer seam.
- Round 1 cumulative fix GREEN: first-arrival now stages complete bytes and atomically hard-links the final index without replacement; both pause and unpause require successful HTTP plus the requested response state; lifecycle drains run even if the final recorder snapshot fails while preserving the first error; and `deliverInitialPlayTask` is an injectable production consumer seam used by `live.ts`. Three focused files / 35 tests passed. Replacing the delivered content at that seam with `PLAY_TASK` failed the exact-message assertion with boot text instead of resumed text, then restoration returned the focused suite green. No new production file, dependency, configuration surface, permission, or runtime owner was added.
- Post-fix gates: `just test` passed agent 2,468, viewer 1,174, and Python 2,478 tests (229 unchanged ROM-dependent skips). Build, vendor integrity, experiment registry (112), explainer check, TypeScript/ESLint, Ruff, formatting, and canonical binding-equipped mypy (92 files) passed. Agent coverage passed at 97.96% statements / 94.22% branches / 98.33% functions / 99.23% lines; checkpoint capture is 96.03% statements / 87.65% branches / 100% functions / 100% lines, and run lifecycle is 96.29% / 93.75% / 100% / 100%. Python remained unchanged from its prior 97.48% lines / 93.42% branches / 99.43% functions receipt. The unchanged viewer coverage-only stream timeout limitation remains recorded above.
- Round 2 reviewed `a5a6d54a..67f1979c` (fix-diff SHA-256 `ee8fd7c318dd476fbbde59c31848d784412f3b53c44b417f544a33906d482ef6`). Grok, Sol and Astra all returned `VERDICT: BLOCKING`: checked unpause can mask a primary pause/checkpoint/digest failure; HTTP-200 contradictory pause bodies lack operand proof; and the lifecycle test did not combine snapshot and cleanup failures to prove first-error retention plus continued draining. The operator explicitly confirmed round 3 under the unchanged bounded scope. The launch-only follow-up constraint is 45 minutes (`2,700,000` ms) from the finally landed current-main bundle, never a branch-only or stale preset; this lane still will not launch or merge.
- Round 3 RED: 31 focused assertions remained green while the new exact primary-error test failed with `unpause request failed with HTTP 503` instead of the original `pause request failed with HTTP 502`. The new contradictory HTTP-200 pause/unpause body cases and combined snapshot/cleanup lifecycle case already passed, exposing proof gaps rather than additional implementation defects.
- Round 3 GREEN and operand mutations: `capture()` now retains the first error while always attempting checked unpause; 3 focused files / 38 tests passed. Disabling the shared response-body confirmation made both independent pause-on and unpause-off tests fail by resolving instead of rejecting. Replacing lifecycle `failure ??=` with assignment made the combined test surface `cleanup failed` instead of the primary `journal full`; restoration returned the focused tests green. The pre-fix RED independently proves cleanup-error replacement in checkpoint capture.
- Round 3 full gates before review: `just test` passed agent 156 files / 2,471 tests, viewer 84 files / 1,174 tests, and Python 2,478 tests with 229 unchanged ROM-dependent skips. `just build`, `just verify-vendor`, `just experiments-check` (112), the explainer page check, TypeScript/ESLint, Ruff, formatting, and binding-equipped mypy (92 files) passed. Agent coverage passed at 97.99% statements / 94.23% branches / 98.33% functions / 99.23% lines. The unchanged viewer coverage-only stream timeout limitation remains recorded above.

## Boy Scout Log

None. Scope is limited to checkpoint capture and its catalog/tests.

## Archive Milestone

- [ ] ASK USER: archive only after landing and live proof.
