# Explicit evolution decision

## Current status
Third fix/review cycle authorized by the operator with “yes”. Implementation remains **not ready to land** pending the targeted correction and review. Round2 found a reproduced fade/hold observation deadlock. Code reviewed at `eebf338b1ce426933ab7a979f3d4d25682f51ef5`; this subsequent worklog-only receipt does not change implementation. No merge, viewer-main restart or measured launch. Operator approval is required before a third fix/review cycle.

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

- Integrated capture/stream main9e9e84a3 via9dbffcd5. Full gates passed: agent2600/viewer1280/environment2782; lint/build/vendor clean. Coverage environment96.93% lines/92.43% branches/100% functions, both TS stacks above90 independently. Receipts /tmp/evolution-integrated-*.txt. Repeated real production tool probes after integration: both choices pass (COMBUSKEN/TORCHIC level16) with new raw capture code; integrated-live-receipt.json and individual tool/native JSON retained. Both processes stopped cleanly.
- Subsequent main908dd6c7 changes only the other worklog; integrated it without repeating unchanged production tests (git diff9e9e84a3..908dd6c7 names only docs/worklogs/active/2026-10-19_capture-stream-workers.md).
- Claude lane unavailable: dedicated Claude CLI auth loggedIn=false; Cursor Opus5 and Sonnet5 both return explicit monthly usage-limit errors. Receipts /tmp/evolution-review-opus-unavailable.{stderr,receipt.json} and /tmp/evolution-sonnet-availability.stderr. Initial dispatch used a moving main base and never reviewed code; discarded, not round1. Grok availability check returned AVAILABLE. Normal Grok/GPT plus two distinct fresh fallback reviewers will review the same immutable packet. Missing Claude cloud lane means no self-merge under execute-worklog; obtain operator decision on fully reviewed candidate.

## Round1 review synthesis
- Frozen base908dd6c791fe3919a5f8b32fc0534099900f8e1a/headb2483c59d252d0debfa68e59ec6a2358dc6d9fd3; exact binary SHA2569b60c49de2c66c8be65797edbce67cd89a739907cc3eb94c0157f32050f51346. Pre/post HEAD/status and digest unchanged.
- Grok Cursor cursor-grok-4.5-high: LGTM, exit0, empty stderr; independent digest agrees.
- GPT isolated /root/gpt_evolution_review (gpt-5.6-sol, xhigh, fork none): BLOCKING human readout activates without tool because human explicit OFF list omits new switch. Independently reproduced digest and native failure. **Fix:** force this agent-only switch OFF at the existing server human-mode boundary before readers initialize. No new production owner/file/API or human feature; fixes declared OFF invariant.
- Fallback /root/fallback_astra_evolution (gpt-6-astra, fork none) and /root/fallback_sol_evolution (gpt-6.1-sol, fork none): each LGTM, independent pre/post canonical digest and clean status. Reduced vendor diversity, not Claude cloud replacement for self-merge. Astra focused13 passed/1 skipped without ROM; GPT focused14 passed with exact ROM. Main full gates had no skips.
- Grok ack toggle reset/diagnostic recovery: Follow-up, no concrete failing episode; do not expand scope. GPT extra EOF whitespace: non-blocking cleanup, unchanged.
- Additional listed Claude Haiku5.5 availability probe also usage-limited, receipt /tmp/evolution-haiku-availability.stderr. No credential/settings changes.
- RED regression for human-mode exact launch env and native state8, before implementing correction. Round2 is cumulative re-review after fix; two-round cap remains.

- R1 human-mode fix GREEN: existing serve.run human boundary forces evolution-decision OFF before observation/native readers initialize, preserving other switches and direct buttons; no new production path. Exact human launch env + real native state8 factory/API regression passes. Original RED /tmp/evolution-human-red.txt has pytest environment rendering redacted; assertion failure retained, and assertion now uses a local set to avoid rendering environment values. Intermediate test-helper tuple mistakes retained in green/green2 receipts; final /tmp/evolution-human-green3.txt is15passed. Deleting human guard fails the intended assertion; /tmp/evolution-human-guard-mutation1.txt; restored.
- Real native human-server probe: r2-human-live-receipt.json and r2-human-live-probe.log retain evolution_cancel_window/CANCEL, no choose_evolution wording, API404. Isolated process terminated. No measured sessions affected.
- Full fix gates before latest integration: agent2600/viewer1280/environment2783; lint/build/coverage/vendor all pass, /tmp/evolution-r2-*.txt. Sync latest incoming main (battle decision readiness plus viewer-only fixes) before round2.

- Latest-main integration0a12c2d2: preserved battle-decision-ready-v1 in both arms and viewer race fixes; registry/order fixture adjustments keep the new evolution ID appended once, global OFF. Focused95 tests and build passed.
- Composition audit found a tool-registration gap in the newly landed battle snapshot retention: a successful choose_evolution result must retire the previously retained automatic observation, just like every other game action. Otherwise an automatic pre-model battle observation that reaches the evolution window can be appended again after the fresh evolution result. This is the existing tool-result delivery owner, no new runtime/API/domain; add a production-shaped RED test before adding the new tool name to the existing recognized action set, conditional on evolution feature ON for OFF invariance.

- Latest integration GREEN: native human guard and conditional choose_evolution result-retirement operand pass full tests agent2614/viewer1284/environment2783, lint/build/coverage/vendor. Receipts /tmp/evolution-r2-integrated-*.txt. Native production Python unchanged since successful human probe; agent native evolve/cancel execution owner unchanged. Context OFF/ON test9/9 passes; removing name operand fails ON and restored9/9 (/tmp/evolution-context-mutation1.txt and restored1.txt).
- Current built viewer browser recheck: ON card, choose_evolution docs, explainer click, replay visible frame, Activity History/raw decision args; opened r2-card/r2-replay screenshots under8791 preview. Served byte hashes match built app/panels/HTML in r2-viewer-served-hashes.json. Scratch viewer stopped. HTML itself unchanged from opened1280/1440/375 proofs.
- Before round2, incorporating latest main42c4a65a: only other worklogs, explicit visited-terrain OFF registration in shared bundle, and its fixed-runner regression changed since0a12c2d2. Effective visited bit already OFF; preserve incoming registration and run relevant viewer checks. Production source unchanged by this last sync.

- Final round2 base42c4a65a03c3646361d0850917c5a9b87fee59d0 integrated. This last main delta contains no production source changes; source directories are byte-identical to gated9896f46d. Shared bundle's explicit visited OFF metadata preserved. Full viewer1285 and viewer coverage passed after sync; final build passed. Agent2614/environment2783 full tests and lint/coverage/vendor from immediately preceding identical production tree stand; no unrelated duplicate runs. Total6682 tests across current source.
- Final coverage: agent lines99.23/branches93.98/functions98.06; viewer lines97.69/branches91.04/functions93.77; environment lines96.93/branches92.43/functions100. All independently above90. No thresholds/excludes/timeouts changed.
- Round2 freeze uses original /tmp/evolution-boundary-r1.md unchanged; /tmp/evolution-triage-r2.md explains concrete human correction and necessary registration of new game tool in latest main's existing snapshot-retirement set. No new production file/API/runtime owner, strategy policy, experiment launch or benchmark claim. Principles /tmp/evolution-principles-r2.md, canonical packet and fix diff sealed after this commit. Claude remains unavailable; use normal Grok/GPT plus same independent fallback contexts, all on same cumulative packet. No self-merge without operator decision on missing Claude lane.

## Round2 review synthesis and operator checkpoint
- Base42c4a65a03c3646361d0850917c5a9b87fee59d0/head eebf338b1ce426933ab7a979f3d4d25682f51ef5, canonical binary SHA256 b3d067592f83ff94a14fae7ca45a138dcce1a2be80ee4022f4f63d6d545685d5. Controller independently reproduced digest and checked HEAD/index/status unchanged after all reviewers. /tmp/evolution-review-r2.diff and packet-r2.json; ignored review-r2-synthesis.json retains receipt.
- GPT /root/gpt_evolution_review (gpt-5.6-sol xhigh, original fork none): LGTM, independently reproduced pre/post digest; exact-ROM Python15/15, evolution9/9, battle context44/44, viewer config132/132, all123 experiment definitions. Human and stale-retained-snapshot fixes accepted.
- Fallback /root/fallback_astra_evolution and /root/fallback_sol_evolution: each LGTM on same packet with independently reproduced pre/post digest and clean status. Astra14 passed/1 ROM skip; this does not replace main full ROM gates. Supplemental only, not missing Claude approval.
- Cursor Grok cursor-grok-4.5-high: BLOCKING, exit0 and empty stderr. It reports ask-mode shell rejection and could not independently reproduce digest this round; controller digest agrees, so do not claim independently qualified Grok approval. Its concrete finding was separately reproduced below. Claude CLI/Opus/Sonnet/Haiku remain unavailable; no self-merge authority.
- **Fix required, not implemented:** native evolution gate skips the inner FrameSettle hook when holding the cancellation window. If palette fade (or a still-black palette) requires settling, the observation waits for emulated frames which cannot arrive before an explicit decision. This can prevent delivery of the decision readout itself.
- Bounded reproduction on frozen source: `fade_settle_r2_repro.py` uses production serve/install/observation order and the existing native state8 fixture with palette-fade bit active; 200 frame attempts, zero native frames, observation remains blocked, pending-decision API200 still responds. A test-only `park()` releases the waiter for cleanup and observation returns200. Receipt `runs/evolution-proof/fade-settle-r2-repro.json`. No production edits, live sessions, ROM writes or third review were performed.
- The next authorized correction should let observations capture an intentionally held native decision without advancing the emulator or inventing a default choice, and cover observation requests started before and during the hold. Keep OFF parity, real pause semantics and actual-frame attribution; do not broaden to strategy or move-choice automation. This is a proposal, not an implemented fix.
- `execute-worklog` says: “If blockers remain after round 2, stop and ask the operator to choose: land as is, fix only the listed bugs, or drop the change.” Both rounds are complete. **STOP: ask approval for one further cycle limited to this reproduced fade/hold observation deadlock.** No landing recommended with this known blocker.
- Final viewer lint also passed after metadata-only sync (/tmp/evolution-r2-final-viewer-lint.txt). All owned probe/game/scratch-viewer processes terminated; temporary browser tabs closed, explainer kept. The worklog remains active, not archived.

## Round3 authorized scope
- The operator answered “yes” to one more fix/review cycle limited to the verified fade/hold observation deadlock. This supersedes the round2 STOP for this cycle only; no merge or Claude-lane exception was granted.
- Fix design: existing FrameSettle gains an optional held-input predicate wired only from the ON native evolution gate. Capture immediately when already held, or at the actual frame entering the hold for existing waiters. Preserve real pause priority, no fake frames, no default evolution choice. Record input_hold as the reason in the existing typed settle receipt; update its cross-stack enum/schema. OFF keeps predicate absent and previous behavior.
- RED: production serve/install/observation composition for fade/black × request-before/during-hold, with finite thread cleanup, actual frame counts, pending decision unchanged, and real pause priority. Agent schema must accept the native held-input receipt. No new runtime owner/tool/policy.

- R3 focused GREEN50 Python and10 agent tests. Native real production server/API/tool probes after fix: repeated observations stay at237970 with settle={frames:0,reason:input_hold}, explicit evolve -> COMBUSKEN16, cancel -> TORCHIC16; full raw/source identities retained in r3-live-receipt.json. Both isolated servers stopped.
- New wiring and entering-hold deletion mutations fail the intended assertions and were restored. First already-held mutation exposed an unbounded synchronous pause-followup in the test, was terminated and restored (attempt1 incomplete, not passing evidence). Reworked that followup to a bounded observer thread; fresh already-mutation2 fails assertions and restored3 passes50. Unique receipts preserved.
- Updated explainer for held-state capture; phone diagram now uses an equivalent readable flow rather than a horizontally clipped diagram. Final1280/1440/375 screenshots opened, pages-check passed, preview copied to8791.
- Pre-integration full tests pass; lint first found import ordering only, fixed with scoped ruff. Current main advanced to e31fc573 (four registered recovery switches and shared legacy fixture). Stop pre-integration lint chain and preserve source receipts; integrate main once and rerun full gates before round3 freeze. No disabled tests, weakened bounds, or approval/launch changes.

- e31fc573 integration gates GREEN: agent2637/viewer1291/environment2787; lint/build/vendor pass. Full coverage rerun passed unchanged: agent lines99.24/branches93.87/functions97.95; viewer lines97.69/branches91.04/functions93.77; Python lines96.93/branches92.42/functions100. First coverage run hit existing viewer malformed-stream 250ms timing bound (263ms); unchanged rerun passed, no limits altered. Receipts /tmp/evolution-r3-sync-{agent2,viewer2,python2,lint2,build2,coverage2,coverage3,vendor3}.txt.
- Main advanced again to78df380c (safe-navigation-strides-v1 plus landing receipt). Integrate once before freeze; retain the exact held-input fix and incoming stride behavior. No experiment approvals or launches.
