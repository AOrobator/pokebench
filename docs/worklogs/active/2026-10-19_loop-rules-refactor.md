# Worklog: loop-rules-refactor

Branch `codex/loop-rules-refactor`, base main `f0ff0138`. Local only. The operator approved this behavior-preserving split on 2026-10-19: keep one authoritative coordinator for sequencing, call correlation, rule priority, episode/recovery/stall state, model feedback, and `loop_guard` emission; move only pattern-specific state and detection into an explicitly ordered static rule set; preserve `loop-detection.ts` as the compatibility facade.

## Problem Statement

`packages/agent/src/loop-detection.ts` is 1,086 lines and combines call correlation, fingerprints, pattern-specific counters, priority ordering, episode lifecycle, supervisor feedback, recovery, and stop state. Adding a detector requires editing shared lifecycle code and makes accidental priority or recovery changes difficult to review.

## Skills Loaded

`agent-observability` for the producer, model-feedback, durable-event, and replay boundaries. `feature-switch` is intentionally not used: this is a structural refactor whose required observable behavior is byte-for-byte unchanged, not a new harness behavior.

## Architecture

- `loop/types.ts`: shared loop policy, observations, calls, notices, rule hits, rule context, reset reasons, and rule contract.
- `loop/fingerprints.ts`: semantic state and stable fingerprint helpers.
- `loop/call-tracker.ts`: tool-call start/result correlation and completed-call production.
- `loop/rules/basic.ts`: planning, observation, rejection, and ineffective-action rules.
- `loop/rules/field.ts`: transition, revisit, push-back, and trigger-script rules.
- `loop/rules/interfaces.ts`: dialogue, waiting, clock, and battle-menu rules.
- `loop/coordinator.ts`: ordered rule evaluation plus the single episode, recovery, stall, notification, model-context, and stop owner.
- `loop-detection.ts`: compatibility exports preserving current imports and constructor behavior.

The registry is a static ordered list. Rules may observe events, return evidence-backed candidates, and reset pattern state. Rules do not notify the model, emit events, declare recovery, or stop a run.

## Intended Consumers

- `harness.ts` and `same-plan.ts` keep importing the existing facade.
- `recorder.ts` and `events.ts` receive the same `LoopNotice` values and `loop_guard` records; no schema change.
- The pinned pi model-feedback path receives the same warning/supervisor text at the same point before the next decision.
- Viewer Activity History and raw-event inspection consume identical existing events; the closed timeline receives no additions or changes.

## Invariants

- INV-1 Existing public exports and the positional `LoopDetector` constructor remain compatible. A named options/factory API may be added internally without forcing callers to migrate in this refactor.
- INV-2 Event sequencing and tool-call correlation produce the same completed calls from the same event stream.
- INV-3 The static registry preserves the current `hit ??=` priority exactly and makes it directly testable.
- INV-4 Replayed streams produce identical warning, supervisor, recovery, stop, evidence sequence IDs, and `context()` output.
- INV-5 Rules cannot emit notices, notify the model, recover an episode, or declare stop state; only the coordinator owns those effects.
- INV-6 No event/schema/viewer behavior changes, no new timeline marks, no feature registry or experiment changes.

## Security Review

No new tools, network calls, subprocesses, game-memory writes, or model privileges. The change only reorganizes already-recorded inputs and diagnostics. Boundary JSON remains owned by the existing event schema.

## Milestones

**M1 — Characterization / RED**
- [x] Capture production-shaped event-stream replay outputs from the current implementation, including notices, evidence, recovery, stop, and context.
- [x] Add structural contract tests for the compatibility facade, static priority registry, and rule/coordinator ownership; observe them fail before the new modules exist.
- [x] COMMIT: characterization/RED (`2e0145f2`).

**M2 — GREEN**
- [x] Extract types, fingerprints, call tracker, grouped rules, and coordinator without changing public behavior.
- [x] Replay the characterized streams and existing focused loop suites.
- [x] Delete/disable one changed routing operand, observe the intended focused test fail under a unique receipt, restore it, and rerun green.
- [x] Run repository gates and verify vendor.
- [ ] COMMIT: implementation/GREEN.

**M3 — Review and land**
- [ ] Sync current main and rerun gates.
- [ ] Principles self-review with zero FAIL rows.
- [ ] Multi-model review until Claude, Grok, and GPT cloud lanes return LGTM on one frozen packet.
- [ ] Fast-forward local main and run post-land tests.
- [ ] Report merge SHA. Do not launch or alter experiments.

## Closing the Loop

The operator-visible behavior is the existing warning/recovery/stop stream and model context, so replay equivalence plus the current model-delivery and Activity History tests are the live surface. No viewer restart or measured run is required because the emitted contract is unchanged.

## Session Log

- 2026-10-19: operator approved a central coordinator with ordered rules, a compatibility facade, and old/new replay equivalence as a behavior-preserving refactor separate from new detector behavior.
- 2026-10-19: canonical `main` was clean at `f0ff0138`; created isolated worktree `/private/tmp/pokebench-loop-rules` on `codex/loop-rules-refactor` before source edits.
- 2026-10-19: baseline agent suite passed 2,527 tests across 161 files. Existing recorded-run replay fixtures already assert exact notices, evidence sequences, recovery, and turn-by-turn model contexts. Added a structural RED contract for the ordered registry and rule factory; before extraction it fails at import because `loop/rules/index.ts` does not exist.
- 2026-10-19: GREEN split: `loop-detection.ts` is a compatibility facade preserving its positional constructor and imports; `LoopCoordinator` now takes a named options object. Call correlation, fingerprints, shared types, and basic/field/interface rule state live in separate modules. The coordinator is 432 lines and remains the sole episode, recovery, stall, notification, context, and stop owner. The registry names all 14 priority positions and its first-hit resolution is directly tested.
- 2026-10-19: focused replay proof passed 223 tests across 13 loop suites, including the recorded Route 103, push-back, transition, battle-observation, battle-menu, reopened-dialogue, clock-view, trigger-script, diagnostic, recovery, stop, and supervisor paths. Full agent suite passed 2,530 tests across 162 files.
- 2026-10-19: deletion/restoration receipt `registry-planning-entry-20261019`: removing the `planning` entry made two architecture tests fail (registry shape omitted `planning`; a planning/observation/rejection collision selected `observation` instead of `planning`). Restoring it returned 3/3 green. No receipt was overwritten.
- 2026-10-19: repository gates after building fresh-worktree artifacts and linking the canonical checkout's existing mGBA Python binding into this disposable venv: `just test` agent 2,530, viewer 1,196, Python 2,709 passed with the configured ROM; `just lint` clean (tsc, eslint, ruff, format check, mypy); `just build` clean; `just coverage` agent lines 99.22 / branches 94.11 / functions 98.18, viewer lines 97.65 / branches 91.49 / functions 93.88, Python lines 97.64 / branches 93.77 / functions 100; `just verify-vendor` OK at `bbab97ad73e460b7cd7c08527d10ced30cc03fbe`.
- 2026-10-19: two setup-only gate attempts were retained: `git submodule update --init --recursive` found the outer pinned vendor but the vendor's unregistered nested `pokered` path has no URL; non-recursive init is the repo-supported setup. The first `just test` then proved the agent tests but viewer imports could not resolve before agent build; after agent build, the Play asset was still absent until the full viewer build. `just build && just test` passed. No source was changed to accommodate either setup failure.

## Multi-Model Review Log

Not started.

## Surprises

- A fresh worktree needs the agent and viewer builds before the viewer gate, and its fresh Python venv needs the already-built local mGBA binding for mypy. These are setup dependencies, not product changes.

## Principles Adherence

Scored against `docs/agent-principles.md` PB1-PB13.

| ID | Score | Why |
|---|---|---|
| PB1 | N/A | No milestone or game-progress grading changed. |
| PB2 | PASS | No run or failure record was discarded or rewritten. |
| PB3 | N/A | No benchmark claim or measured cohort. |
| PB4 | PASS | No harness capability changed; replayed event/model output is unchanged. |
| PB5 | PASS | One structural variable: ownership and module boundaries only. |
| PB6 | N/A | No context budget or compaction change. |
| PB7 | PASS | Existing recorded-run fixtures remain the replay oracle; schema and recorder are unchanged. |
| PB8 | PASS | Warning, recovery, stop, and diagnostic semantics remain bounded and replay-identical. |
| PB9 | PASS | The operator supplied the architecture and required behavior-preserving boundary. |
| PB10 | PASS | No skips, excludes, or thresholds changed; all floors pass. |
| PB11 | N/A | No pinned external API behavior changed. |
| PB12 | PASS | The configured ROM was read through `POKEBENCH_ROM`; it was not copied. |
| PB13 | PASS | RED, GREEN, deletion proof, full gates, worklog, and review checkpoint are explicit. |

## Boy Scout Log

None. This branch is restricted to the loop-detector split and its proof.
