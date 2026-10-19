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
- [x] COMMIT: implementation/GREEN (`ba47ac08`).

**M3 — Review and land**
- [x] Sync current main and rerun gates.
- [x] Principles self-review with zero FAIL rows.
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
- 2026-10-19: synchronized current `main` at `a7be38f6` with merge commit `35eedbf9`; the intervening automatic-running feature was outside the loop modules and merged cleanly. The synchronized `just build`, `just test`, and `just lint` gates passed with the same 2,530 agent, 1,196 viewer, and 2,709 Python tests.
- 2026-10-19: the first synchronized coverage run hit the existing five-second per-test limit in two unrelated agent tests (`exit-reachability` serpentine routing and the recorded `4caa` people-card wrapper) while 2,528 tests passed. Running those files unchanged in isolation passed 38/38; the one permitted unchanged full rerun then passed all 2,530 agent, 1,196 viewer, and 2,709 Python tests. Coverage remained agent lines 99.22 / branches 94.11 / functions 98.18, viewer lines 97.65 / branches 91.49 / functions 93.88, and Python lines 97.64 / branches 93.77 / functions 100. No timeout, serialization, test, or threshold was changed. Synchronized `just verify-vendor` also passed.
- 2026-10-19: after the Round 1 fix batch, `just build`, `just test`, and `just lint` passed at 2,533 agent, 1,196 viewer, and 2,709 Python tests. The first coverage attempt reached the unchanged viewer suite and hit two `server-stream.test.ts` timing assertions; that file passed unchanged 17/17 in isolated coverage. The next full run repeated the already-documented two unrelated agent timeouts; a final unchanged run with no concurrent reviewer process passed all suites and floors: agent lines 99.22 / branches 94.14 / functions 98.18, viewer lines 97.65 / branches 91.49 / functions 93.88, Python lines 97.64 / branches 93.77 / functions 100. No timeout, sleep, retry wrapper, serialization, skip, or threshold changed. `just verify-vendor` passed.

## Multi-Model Review Log

### Round 1 — frozen `a7be38f6..33c7435a`, diff SHA-256 `33b170fb04e37bfc21fc3724f3a26f3fa70af8c3e400ecf8884bf9833ad97b1f`

- Claude-family lane unavailable: Cursor Opus, Sonnet, and Fable each returned the account usage-limit error; the dedicated Claude CLI review profile reported `loggedIn=false`. None counted as a review or approval.
- Grok 4.7 High: `VERDICT: BLOCKING`. Accepted: `clockHit` reset its place counter on `observe`, unlike the legacy non-observe branch; the registry helper test did not prove priority through `LoopCoordinator.complete`. Classified its callback-ownership note as an in-contract ownership defect despite the review labeling it a follow-up, because INV-5 explicitly reserves recovery to the coordinator.
- Isolated Codex GPT-5.6 Sol xhigh (`fork_turns=none`): `VERDICT: BLOCKING`. Independently reproduced the packet digest. Accepted: interface rules invoked a coordinator recovery callback; production priority wiring lacked a caller-seam collision test. Accepted subtraction of the unintended `LoopCoordinator` and `LoopCoordinatorOptions` facade exports as removal of scope growth.
- Fix batch: observations no longer alter the clock action counter; interface rules now return pattern-state reset facts and the coordinator alone decides recovery; candidate insertion is deliberately reversed so the static registry is the sole priority owner; a real state-cycle/transition collision exercises `LoopDetector.complete`; the facade exposes only its legacy surface.
- Adversarial receipt `coordinator-registry-bypass-20261019`: replacing the coordinator's `firstLoopHit` call with first-candidate insertion selection made the production collision test fail with the transition-loop message instead of the earlier state-cycle message (1 failed / 4 passed). Restoring the registry call returned the focused architecture, clock, and battle-menu suite to 27/27 green.

### Round 2 preparation — blocked by moved canonical main

- Before resealing, canonical `main` moved from `a7be38f6` to `cd596604`; merged it as required. The loop-owned files merged cleanly and the agent/viewer suites passed (2,535 / 1,196), but the new main tip's Python battle-damage path failed 23 existing archive/readout fixtures with `KeyError: 33702542` while reading newly required RAM cells. `git diff main HEAD -- env` is empty, so the failures are wholly inherited from canonical main.
- The active `codex/battle-effective-damage` branch contains additional unlanded repair commits, but this loop refactor does not cherry-pick or repair another owner's domain. Round 2 was not sealed or dispatched. Per the landing gate, a red synchronized main blocks review completion and self-merge.
- 2026-10-19 continuation: canonical `main` advanced to `db7234da`, including the battle fixture repair and later reviewed changes. Merged it as `68819b7d`; the loop-owned files merged cleanly. Full synchronized gates now pass: build clean; 2,580 agent, 1,238 viewer, and 2,724 Python tests; lint clean; vendor verified; coverage agent lines 99.22 / branches 94.07 / functions 98.13, viewer lines 97.72 / branches 91.33 / functions 93.97, Python lines 97.12 / branches 92.85 / functions 100. Round 2 may now be resealed from this tip.
- 2026-10-19 Round 2 packet `db7234da..dc4abc28`, SHA-256 `1d2f3f1ce64498e4a7c2e717af6c89279a70e3776d8d828152f42d73871c9263`: Grok 4.7 High returned `LGTM`; isolated GPT-5.6 Sol xhigh found no behavioral defect but blocked on missing negative facade-export proof and missing deletion receipts for clock-observe continuity and coordinator-only lifecycle ownership. Claude Sonnet remained unavailable with the account usage-limit error, so its lane did not count.
- 2026-10-19 proof fix batch: the architecture suite now pins the exact runtime facade exports, rejects the unintended `LoopCoordinatorOptions` type export, and structurally excludes recovery authority from interface-rule source. Receipt `facade-negative-surface-20261019`: temporarily re-exporting `LoopCoordinator` and `LoopCoordinatorOptions` failed the exact facade test (1 failed / 5 passed). Receipt `clock-observe-continuity-20261019`: removing the observe exclusion made the recorded clock continuity test fail with no warning/supervisor notices (1 failed / 8 skipped). Receipt `interface-recovery-authority-20261019`: adding an optional recovery callback to `observeState` made the ownership test fail (1 failed / 5 skipped). Each mutation was restored independently; the focused architecture and clock suites returned 15/15 green.
- 2026-10-19 final follow-up preparation: canonical `main` advanced to `aac98413`; merged it cleanly as `aec94092`. Integrated gates pass with the configured ROM: build clean; 2,581 agent, 1,240 viewer, and 2,724 Python tests; lint clean; vendor verified; coverage agent lines 99.22 / branches 94.08 / functions 98.13, viewer lines 97.72 / branches 91.32 / functions 93.97, Python lines 97.12 / branches 92.85 / functions 100.
- 2026-10-19 final Round 2 follow-up packet `aac98413..51c001c1`, SHA-256 `19ffe31e20b77fb09b79634e66f2b365f92f891aca2981a6f0435f15fc763f09`: Grok 4.7 High returned `LGTM` (it could inspect the matching packet/worktree source but its sandbox could not independently hash or read Git). Isolated GPT-5.6 Sol xhigh verified the digest, exact diff identity, focused/full agent tests, and lint, then returned `BLOCKING` on two remaining evidence gaps: the facade type-export guard does not catch inline `export { type LoopCoordinatorOptions }`, and the lifecycle-ownership guard does not pin exact `observeState` and `menuReturn` parameter tuples independently. Claude remains unavailable. Per the two-round review cap, no third fix/review cycle or landing proceeds without operator direction.
- 2026-10-19: operator explicitly authorized a third fix/review round. Canonical `main` had advanced to `3c626e32`; merged it cleanly as `55de4a18`. The facade test now asks the TypeScript checker for the module's exact combined value/type export names, so inline type-only re-exports cannot bypass it. The lifecycle test pins both runtime arity and exact TypeScript parameter tuples for `observeState` and `menuReturn`.
- 2026-10-19 Round 3 receipts: `facade-inline-type-export-20261019` added only `export { type LoopCoordinatorOptions }` and the exact compiler-resolved export test failed with the extra name (1 failed / 5 skipped). `observe-state-callback-authority-20261019` added only an optional `_onReset` callback and the runtime arity assertion failed 2 versus 1 (1 failed / 5 skipped). `menu-return-callback-authority-20261019` added only an optional `_onReset` callback and the runtime arity assertion failed 3 versus 2 (1 failed / 5 skipped). Every mutation was restored independently; architecture plus clock suites returned 15/15 green and agent typecheck/ESLint passed.
- 2026-10-19 Round 3 integrated gates at `2c52a3f2`: the first build attempt exposed a stale worktree dependency link after the newly merged viewer added `ws`; `pnpm install --frozen-lockfile` materialized the already-locked dependency and the unchanged build then passed. Full configured-ROM tests passed: 2,581 agent, 1,261 viewer, and 2,750 Python. Full lint passed. Coverage passed: agent lines 99.22 / branches 94.08 / functions 98.13; viewer lines 97.60 / branches 90.93 / functions 93.72; Python lines 97.07 / branches 92.68 / functions 100. Vendor verification passed.

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
