# Explicit evolution decision

## Problem Statement
The operator authorized this worklog and implementation on 2026-10-19: add an explicit evolution choice, enable it in the bundle, and repair the observation defect. Historical run `2026-10-19T01-08-57_qwen36-gpu1_petalburg-wholemap-probe-a` seq 10270 shows an invented selected CANCEL menu and mixed controls. Seq 10298 says B would decline stopping evolution; seq 10299 presses B despite the stated intention to evolve. This is interface evidence, not a strategic preference to cancel.

## Skills Loaded
feature-worklog, feature-switch, pokebench-game-state, agent-observability, feature-explainer, experiment-queue, execute-worklog, close-the-loop; multi-model-review before landing. User authorization covers starting implementation after this log; no additional worklog approval is required.

## Architecture
- Isolated branch/worktree from local main; vendor and measured runs untouched.
- Register default-OFF `evolution-decision-v1`, explicitly ON in bundle and OFF in control per the operator's instruction (overrides skill default-promotion restriction for this bundle).
- Native frame gate uses verified ordinary evolution task, state 8, live graphics task and CAN_STOP bit. Advance animation without arbitrary inputs, then hold at cancellation window until choose_evolution(decision: evolve|cancel). No wall-clock default. Decisions bound to the current native episode; repeat/stale decisions fail closed.
- Execute through ordinary native buttons only: neutral frames permit evolution; B cancels. Gate catches transitions inside existing button batches. No RAM writes, save repair or strategy advice. Trade/uncancellable evolution and subsequent move learning remain distinct.
- Fix selected CANCEL and generic directions/A/B guidance under the same switch; OFF preserves legacy bytes and execution.
- Tool-call/result plus native input/state receipts show choice and outcome. Preserve historical logs. Add linked explainer and pending unapproved experiment.

## Invariants
- INV-1: OFF retains prior tool list, prompt, observation and stepping; exact comparisons and production factory tests.
- INV-2: No cancellation-window frame advances before explicit choice; pre-window held/queued inputs cannot bypass gate. Frame-transition and long-batch tests, mutation test.
- INV-3: Evolve and cancel act only on a fresh matching eligible native episode; malformed/unknown/trade/move-learning states do not acquire decision ownership. Native reader and API tests.
- INV-4: No invented selectable menu or generic B-declines wording in the evolution animation with ON; actual move confirmation still exposes native cursor. Production readout tests.
- INV-5: Both choices retained; no recommendation, learnset foreknowledge or silent default. Bundle ON/control OFF and registry tests.

## Security Review
Local-only typed endpoint; bounded waits; no secrets, external messages, new arbitrary memory access, RAM writes or vendor edits. Pending native decision freezes only isolated agent emulator, not human mode. Never launch a measured experiment or alter another session.

## Milestones
**M1 — Native contract and regression tests**
- [x] Worklog created before implementation; user authorization recorded.
- [ ] Source/ROM grounding and retained raw archive replay.
- [ ] RED tests for gate, observations, tool/factory and bundle.
- [ ] COMMIT RED.
**M2 — Implementation and integration**
- [ ] Native frame gate/API, observation repair, decision tool, registry/factory/JIT integration.
- [ ] Bundle ON/control OFF, pending experiment/readiness, linked HTML explainer.
- [ ] Focused tests and guard deletion mutation.
- [ ] Gates: just test, just lint, just build, just coverage, just verify-vendor.
- [ ] COMMIT GREEN.
**M3 — Proof, review and landing**
- [ ] Isolated real-ROM probe for both choices, transition and move-learning boundary; raw archives and exact tool result.
- [ ] Explainer browser proof and recorded decision visibility/replay.
- [ ] Principles self-review and frozen cloud Claude/Grok/GPT review (two-round cap).
- [ ] Local fast-forward landing only after required approvals; post-merge test/viewer proof.

## Closing the Loop
Report implementation, tests, native proof, review, landing and live status separately. No measured performance claim.

## Session Log
- 2026-10-19: Read rules/skills, inspected recorded trace and paired screenshots, checked clean reference pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881. Task_EvolutionScene checks held B, state WAIT_CYCLE_MON_SPRITE, graphics active and CAN_STOP before canceling; no actual CANCEL cursor exists.

## Surprises
- Evolution runs in real time between model calls; a tool without an emulator frame gate would still permit implicit evolution.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] ASK USER before archiving.
