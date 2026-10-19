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
- [x] Source/ROM grounding and retained raw archive replay.
- [x] RED tests for gate, observations, tool/factory and bundle.
- [x] COMMIT RED: `0c4156b0278b42facde445e7d145d7163155466c`.
**M2 — Implementation and integration**
- [x] Native frame gate/API, observation repair, decision tool, registry/factory/JIT integration.
- [x] Bundle ON/control OFF, pending experiment/readiness, linked HTML explainer.
- [x] Focused tests and guard deletion mutation.
- [x] Gates: just test, just lint, just build, just coverage, just verify-vendor (pre-sync receipts below).
- [x] COMMIT GREEN: implementation and pre-sync proof; SHA recorded immediately after commit.
**M3 — Proof, review and landing**
- [x] Isolated real-ROM probe for both choices, transition and move-learning boundary; raw archives and exact tool result.
- [x] Explainer browser proof and recorded decision visibility/replay.
- [ ] Principles self-review and frozen cloud Claude/Grok/GPT review (two-round cap).
- [ ] Local fast-forward landing only after required approvals; post-merge test/viewer proof.

## Closing the Loop
Report implementation, tests, native proof, review, landing and live status separately. No measured performance claim.

## Session Log
- 2026-10-19: Read rules/skills, inspected recorded trace and paired screenshots, checked clean reference pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881. Task_EvolutionScene checks held B, state WAIT_CYCLE_MON_SPRITE, graphics active and CAN_STOP before canceling; no actual CANCEL cursor exists.

- RED commit created: native gate/observation/API tests fail at collection because evolution_decision owner does not exist yet (expected). Beginning implementation.
- Native archive proof: validated raw-ram/00004516.json.gz (SHA-256 d5d18b2c912d375654f29fa7129c7a315473eff4814788a884b10c7a75aeaeef) with exact ROM f3ae088181bf583e55daf962a92bb46f4f1d07b7. Production read_state/render OFF retains selected CANCEL; ON yields evolution_decision, selected null, choose_evolution wording, no B declines. Gate freezes the actual archived native cancellation window. Receipts: runs/evolution-proof/archive-{on,off}.txt.
- Focused native tests cover both choices, stale/duplicate tokens, pre-window B suppression, trade/uncancellable/move-learning exclusions, production server installation, native action input journal and readout.
- Full Python with exact ROM: 2758 passed (before final added journal/factory tests); all agent tests 2587 passed. Later viewer run had a known socket timing failure and new explainer fixture failure; fixture corrected to use a modern feature-bearing run.
- Initial coverage run hit existing five-second timeouts in serpentine navigation and full-run ID-card rehearsal while other gates ran concurrently. No timeouts or gates modified; retrying without concurrent heavy gates.
- Isolated native checkpoint replay attempts diverged before evolution and are NOT outcome proof. No measured sessions, source recordings or saves were altered. These failed replay attempts were superseded by the successful excluded natural-battle probe below.

- Final native proof: actual level-16 evolution reached naturally in an excluded isolated probe. `runs/evolution-proof/native-final-receipt.json` binds the exact pending checkpoint, ROM SHA-1, identities, raw archives, 300 blocked frame attempts per choice, native input sequence, screenshots and both outcomes. Evolve reaches native YES/NO for DOUBLE KICK with COMBUSKEN; cancel retains TORCHIC with evolution_was_stopped true. Original measured sessions unchanged. Paired screenshots are `final-evolve.png` and `final-cancel.png`, opened and inspected.
- Native proof found two necessary repairs before review: state 15 waits on result text, requiring an A acknowledgement only for verified printer 0/gStringVar4 waits after an explicit decision; and the move reader used 0x02022F58 instead of gMoveToLearn at 0x020244E2. ROM BL 0x0813EA38 -> MonTryLearningNewMove 0x08069318; STRH 0x080693EC loads its pointer from literal 0x0806941C. Both repairs are ON-only; move-learning choices remain native/model-owned.
- Earlier scratch screenshots were black because the direct mGBA probe needed reset after binding its video buffer. Those are NOT visual proof. Final native screenshots and raw observation pairing supersede them.
- Explainer browser proof at 1280, 1440 and 375 widths, screenshots opened. Fixed phone code-example overflow. Local link returns 200. New feature-card route and bundle arm tests pass. Synthetic excluded viewer rehearsal is separate from real native execution receipts.

## Surprises
- Evolution runs in real time between model calls; a tool without an emulator frame gate would still permit implicit evolution.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] ASK USER before archiving.

## Final pre-review receipts
- Native final proof uses `final4-evolve` and `final4-cancel` raw archive indexes; after-image pairing is recorded in each observations.jsonl. Both complete writable memory sets/CPU/ROM hashes reparse through the production reader. Pending readouts show no selectable menu and choose_evolution; evolved readout shows the native YES/NO and DOUBLE KICK. Final images opened: COMBUSKEN with YES/NO, TORCHIC stopped evolving. The earlier final3 images were superseded by two render frames so the YES/NO is visibly drawn.
- Real production server/API + real gameTools execute path exercised for both choices with no inference: `live-tool-{evolve,cancel}.json` retains exact pre-observation, arguments, model-facing tool result and state; `live-native-*.json` retains native journal entries. The evolve result verifies COMBUSKEN. Cancel returns to the field with the same identity as level-16 TORCHIC; its textual result honestly says animation ended rather than inventing a stop flag after the UI closed. Both isolated server processes terminated cleanly. This is an excluded manual tool probe, not a measured model run.
- Deletion mutations: native window hold, tool-factory switch, result-printer ownership, and production move-owner wiring all failed the intended tests and were restored. Unique receipts retained under runs/evolution-proof/mutation-*.txt.
- Final pre-sync tests: agent 2588, viewer 1266, Python 2763 with exact ROM and no skips. Coverage: agent statements 97.76%, branches 94.01%, functions 98.13%; viewer statements 94.98%, branches 90.92%, functions 93.68%; Python lines 97.09%, branches 92.74%, functions 100%. Vendor pristine. Lint/build receipts are in /tmp/evolution-{lint,build}-frozen.txt.
- GREEN implementation committed. Syncing current main before the frozen review; unrelated incoming feature defaults and bundle settings must be preserved.

- Main integration: merged incoming 0b5ad284f448237800952b95536dfa14b0cde952, preserving battle-refusal-loop defaults and Wally/tutorial owner fixes. Combined both native reader options. State-only act mode rejects evolution-decision because that tool surface cannot expose choose_evolution; compatible state-only fixtures explicitly keep it OFF.
- Eligibility audit: the game cancellation check does not test palette fade. ON gate now holds any verified cancellation window regardless of the legacy readiness flag; regression proves legacy ready=false still becomes an explicit pending decision.
- Browser receipt: built isolated viewer8896 against an approval-free scratch root. Feature card ON and explainer click-through verified, choose_evolution documented, playback reaches a visible recorded frame, Activity History and raw JSON show decision=cancel and the matching result. Fixture clearly labelled SYNTHETIC and does not claim model/native execution. Screenshot shots/replay.png and shots/card-feature.png opened. Served app.js/panels.js/explainer match built/local SHA256 receipts in runs/evolution-proof/viewer-served-hashes.json.
- Post-sync full tests: agent2600, viewer1268, Python2776 passed with exact ROM. Lint/build passed. Coverage and vendor receipt follows before sealing the packet.

- Post-sync final coverage: agent lines99.22%, branches93.98%, functions98.13%; viewer lines97.60%, branches90.92%, functions93.68%; environment lines97.11%, branches92.79%, functions100%. All floors90 passed; vendor pristine. Receipts /tmp/evolution-final-{test,lint,build,coverage,vendor}.txt. Current main remains0b5ad284f448237800952b95536dfa14b0cde952.
- Principles PB1–PB13 scored with evidence and zero FAIL rows in /tmp/evolution-principles-r1.md; immutable boundary /tmp/evolution-boundary-r1.md. Preparing clean merged candidate for Claude-first cloud review. Standalone Claude credentials unavailable, so use approved Cursor Claude equivalent. No unrelated-chat messaging authorized; verify main has not changed before any landing.
