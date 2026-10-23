# Roxanne autonomous controller — offline implementation and qualification

## Problem Statement
The operator authorized implementation, native checkpoint/history qualification, scoring verification and a GPU-free rehearsal of the sixteen-GPU-hour Roxanne plan. No inference, measured gameplay, campaign launch, automatic compute reservation, shared-main edits or promotion is authorized. Offline emulator replay of recorded inputs is authorized qualification, not new model play.

## Skills Loaded
feature-worklog; execute-worklog; feature-switch; feature-explainer; pokebench-game-state; agent-observability; pokebench-decision-probes; close-the-loop; talk-to-claude; multi-model-review.

## Architecture
Reuse recorded event schemas/context construction and native mGBA save/load. Typed controller owns bounded frozen batches, revision lineage, protected reserve, blinded grade lock, nomination and terminal reports. Filesystem adapter writes atomic durable state; rehearsal adapter never imports gateway discovery or calls inference. Restore bundles bind checkpoint bytes, native observation, prior events, delivered model context and source hashes. CPU qualification replays recorded native button changes from the real initial save and verifies RAM against archived frames; failure remains an explicit not-qualified result, never a fabricated save. New model-facing reminder delivery is registered/default OFF and applied once through production continuation wiring.

## Invariants
- INV-1: offline commands cannot invoke GPU discovery/inference or execute a campaign; tests inject a rejecting transport.
- INV-2: spent + reserved + protected budget cannot exceed960aggregate endpoint minutes; batches complete before scoring/adaptation.
- INV-3: all declared episode outcomes remain in the denominator; restart cannot silently resample uncertain work.
- INV-4: recovery comes from ordered native events and coherent party snapshots, not narrated intent; reorder/HP-only/EXP-only do not qualify.
- INV-5: source-state/context digests and active input owner must match; missing state/history fails closed.
- INV-6: candidate delivery defaults OFF with exact OFF parity; one-shot insertion and retained-history receipt only.
- INV-7: protected families remain unavailable for prompt revision; deterministic qualification emits metadata/validity only.

## Security Review
No remote services or new dependencies. ROM stays external, read-only and untracked. Recorded state bundles and screenshots stay ignored. Native replay owns isolated CPU cores and scratch directories. No gateway calls. No shared listener/process/lease modifications.

## Milestones
**M1 — Controller and native trace scorer**
- [x] RED tests: controller/scorer modules absent; both new suites fail importing their production owners. Budget/concurrency, frozen batches, uncertain restart, grade locks, recovery and winner assertions committed before implementation.
- [x] GREEN controller/scorer, durable frozen batches, independent trace/hash verification and raw anonymous event grading; archive ea04/d548 scoring checked.
**M2 — Checkpoint and history qualification**
- [x] RED restore integrity/ownership/hash and native replay tests: missing production modules fail TS/Python collection. M1 first GREEN17tests; types checked after optional milestone evidence repair. RED commit45c544640.
- [x] GREEN restore builder: d548T488,2e93T637,ea04T578,da1cT393 match all7native regions+registers; all4fresh-core reloads and current production party/location decodes pass. Hash-bound validated-reconstructed histories (37,33,10,22messages) preserve original task/visible loss evidence. Original historical HTTP bodies are unavailable, explicitly disclosed. Protected families remain sealed until final prompt freeze.
- [x] All four development/readiness native starts recovered; failed early reconstruction attempts retained as failed attempts. Protected starts intentionally remain sealed, not claimed qualified.
**M3 — Delivery, rehearsal and review**
- [x] RED/GREEN registered default-OFF one-shot reminder; ordinary pi continuation, seeded production memories/guard, disjoint evidence namespace and source turn base, prefix persistence, clock lifecycle and hash-bound context-budget restoration. Fresh play remains unchanged.
- [x] Full network-denied fake-clock rehearsals: 36 episodes / 180 ordinary pi-loop responses through provisional fixture validation, and 10 episodes / 50 responses stopping without a nominee. Exact frozen prompt text is delivered; raw trace evidence is retained and scores recomputed by the runner. Uncertain restart, acquisition failure and teardown overrun tests pass.
- [x] Gates: full TS test/coverage suites at two workers, Python4019passed with external ROM, build, lint, unchanged >=90% floors and pristine vendor. Final source cleanup has focused regressions in addition to the full suites.
- [ ] Principles and independent reviews on frozen implementation packet
- [x] Tracked offline report and default-OFF feature explainer; isolated headless viewer card/link proof and desktop/phone screenshots.

## Closing the Loop
No launch. Prove native load+context restoration independently from fake rehearsal. Record real receipts and link a local verified report. Do not mark campaign ready if qualification is missing. Leave implementation on the owned branch; no main merge is part of this offline request.

## Session Log
- Commits: RED45c544640; restore RED97bccf5ed; initial GREEN4c07dddc5; continuation RED5bdff8e21. Native proof receipts are under canonical ignored runs/reports/roxanne-controller-offline-20261023/qualification/.
- Continuation qualification now seeds production event memories/guard state, preserves sequence/turn namespaces, and restores RTC plus budget usage anchors. All four complete conversations (975/1271/1155/785 messages) reproduce frozen first contexts (37/33/10/22 messages) and all eight production tools. No original HTTP wire bodies exist; this is an explicitly validated reconstruction.
- Launch boundary: the public command is rehearsal-only. The injected episode-host interface is implemented by the offline adapter; no benchmark transport is bound or launched. A later authorized launch must check model file/tokenizer/template/context/sampling parity across GPUs, bind the measured episode host, coordinate leases, and qualify protected starts after the finalist freeze. This milestone does not claim live readiness or promotion.

- 2026-10-23: authorization is the operator's explicit implementation/qualification/scoring/rehearsal request. Reusing isolated codex/roxanne-campaign-plan worktree at e3da528c2, with its existing planning document. Main pointer belongs to Birch and remains untouched.

- Native reconstruction: d548T488 and2e93T637 now reproduce all7native regions and CPU registers exactly and reload through the one-frame vendor load step. Both have zero mismatched decision checkpoints. Must preserve source RTC epoch; mGBA RTC_FIXED value is milliseconds (source interface.c). No GPU calls.

## Surprises
- Historical development/control runs checked have no native run-level checkpoints; vendor milestone ZIPs inspected contain metrics/maps/logs, not emulator saves. Complete native_input journals may permit deterministic CPU reconstruction; must prove matching RAM.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive this worklog

- Full native qualification: all seven archived RAM regions and CPU registers match on reconstructed saves and independent fresh loads; the production decoder matches party identities/species/levels/HP/moves and location. Native RTC values use milliseconds, per pinned mGBA source; source time is fixed for the vendor load frame then advances via RTC_WALLCLOCK_OFFSET.
- History defects found and repaired offline: temporary context notes cannot become persistent conversation; applying the window twice can drop a screenshot; an already collapsed dialog can duplicate its text; a cold context budget loses the learned usage anchor; serialized bundle property order must not invalidate equal hash-bound fields. Native ea04 first-context mismatch exposed the budget omission and now passes with its reconstructed usage anchor.
- Scoring defects found and repaired: party gains carried out of the gym battle do not establish outside preparation; native battle epochs prevent transient RAM flags from creating fake rematches; beyond-cap events cannot rescue a score. ea04 is eventual recovery plus victory from the earlier loss start, with one unchanged rematch; strict success is false and its late recovery is outside that start's 30-minute cap.
- Adversarial evidence: removing reminder wiring, full-batch reservation, outside-gym gain gating or restore-integrity checking makes the targeted test fail; originals restored. Record/logs are in runs/reports/roxanne-controller-offline-20261023/.
- Gate setup: worktree Python runtime is now isolated, with its own editable package and corrected launcher paths. Missing POKEBENCH_ROM caused early native-fixture test failures; all 4019 Python tests subsequently pass with the existing external ROM. An unchanged map-cycle coverage test hit 5 seconds under concurrent qualification load; the full identical TS suites are rerun with two workers, without timeout/floor/exclusion changes.

- Final scorer wiring mutation: bypassing verifyEpisodeOutcome in runFrozenBatch makes the false-score-through-batch regression fail. Original raw trace and terminal occupancy remain recorded before evidence rejection; fixtures cannot enter a measured host. A second integrity mutation covers the final structural bundle verifier after the JSON-key-order repair.

- Shared main advanced independently from e3da528c2 to74590b432d55295d6c35153466dec152993443a7 while this branch was in progress; canonical tree is clean. This work made no main commit or merge. This frozen branch is reviewed against its original e3da528c2 base, not claimed synced/landed at current main.

- Round1 review synthesis: canonical runs/reviews/2026-10-23-roxanne-controller/round1-synthesis.md. Claude/GPT and standing Sol/Astra fallback found four in-contract defects: grading telemetry leaked arms; native incoherence was dropped; discarded outside gain could justify unrelated inside change; move deletion alone counted as acquisition. Grok failed exhausted quota (failure receipt retained); reduced vendor diversity disclosed. All fixes remain in original runner/scorer/autonomous/report/test owners, no new APIs/domains.
- Review fixes: grading views normalize assistant usage/context/request telemetry and timestamps, hash only blinded view; original telemetry/hash remains retained. Token tie-break reads original outcomes after grade lock. Native gaps remain at their sequences, fail recovery closed, and native victory stays independent. Outside credit is bound to identity plus acquired level/species/move and retained at rematch, including actual transition provenance; empty move slots alone are not acquisition.
- RED review-red-2.log reproduces all four defects through production consumers. GREEN review-green-3.log passes34 focused tests. Seven performed operand mutations in review-mutations.json fail their targeted regressions and originals were restored. Added native malformed RAM/identity/moves/diagnostic/map cases through checkEvent→recoveryFrames→verifyEpisodeOutcome, and actual RunRecorder context/usage through runFrozenBatch→grade.
- Correction to earlier ea04 verification claim: its legacy trace contains incomplete native snapshots. Native victory remains observed and later outside preparation remains forensic evidence, but recovery is now unverified and cannot clear campaign thresholds. No archived evidence was edited. Four separately qualified restore/history starts remain valid.
- Round2 gates/rehearsal and exact cumulative fix review pending; branch remains unmerged and campaign unlaunched.

- Post-fix complete default coverage passes3957agent/1717viewer/4019Python (review2-default-coverage.log). Final lint-only cleanup removed unused binding/non-null assertion; full lint/build/vendor now pass. A second complete default coverage run on those restored final sources is in progress (review2-restored-coverage.log); a prior run was deliberately stopped because a mutation overlapped its read window, not used as evidence.
- Both network-denied public CLI rehearsals rerun:36episodes/180responses,15h20m aggregate and7h40m wall fixture winner;10episodes/50responses no nominee,5h aggregate/2.5h wall;0benchmark GPU calls,leases released. Updated report rendered at1280/1440/375 with no overflow/page errors and opened screenshots; four earlier source-bound qualification cases remain valid.

- Round2 synthesis is runs/reviews/2026-10-23-roxanne-controller/round2/synthesis.md. Claude and Astra BLOCKING on required-evidence gaps; isolated GPT and fallback Sol LGTM. All four accepted behavioral fixes. Missing proof: independent timing/compaction/end metadata operands, original-token tie, and isolated retained capability kinds. Scope remains unchanged; two blocker-producing rounds mean operator scope confirmation is required before a third reviewer dispatch (multi-model-review SKILL.md). No third review was started.
- Added40 focused tests total, including actual RunRecorder latency/ttft/end counters, distinct message/event clocks, compaction, independent member/level/species/move positive+discard cases, native victory on the incoherent frame itself, and runAutonomousCampaign decisive original-token tie despite equal grader tokens. Seventeen performed independent operand mutations fail with assertion payloads; restored source SHA and exact operand text recorded in review2-operand-mutations.json.
- Stronger grade-consumer schema assertion exposed a timestamp-format defect in the normalized copy (UTC ISO versus canonical Eastern envelope). Fixed inside original runner using existing easternTimestamp owner; original raw evidence unchanged. Its performed mutation fails checkEvent at the grading consumer. No production file/API/config/domain added.
- Current unreadable native lifecycle snapshots are not assumed to be an old-run-only issue. Conservative evidence veto may stop a measured campaign; future live recorder/host qualification must resolve that within separately authorized launch preparation. No change to missing-proof policy is made here.
- Final full gates and fresh CLI rehearsals are being rechecked on restored sources. Final independent review remains pending operator confirmation of unchanged offline scope; branch unmerged, heldouts sealed, no campaign launched.

- Final restored-source gates pass:3963agent/1717viewer/4019Python with original default workers and unchanged90%floors, full lint/build/vendor. Logs proof-final-{coverage,lint,build}.log. Fresh network-denied rehearsal-proof-final and rehearsal-proof-final-no-nominee complete36/10episodes with0GPUcalls and released ownership. No further implementation is pending; independent re-review alone requires operator scope confirmation before round3.

## Operator amendment: campaign execution
The operator's subsequent direct instruction is "run the experiment as planned". This confirms the planned sixteen-aggregate-GPU-hour campaign and authorizes the previously withheld launch phase. It also supplies operator confirmation of the planned scope after two blocker-producing offline review rounds; round3 may review the repaired offline implementation. This is new user authorization, not a self-authored checkpoint waiver. The offline terminator remains unchanged; launch is a separate milestone below.

Launch milestone owners: existing run/server/continuation factories and exclusive compute leases, a measured episode-host binding and bounded cloud grading adapter, durable campaign CLI/runner control, source-pinned registration/viewer proof. Reuse existing owners; no game policy/route/automatic battle choices. Before any measured call: full offline review LGTM, current-main integration/gates/landing coordination, measured host and clock/context qualification, checkpoint eligibility, model/tokenizer/template/context/sampling equality, explicit affected-owner window clearance and normal exclusive leases. All launch-host changes require their own tests/review/rehearsal. Protected validation is still sealed until finalist freeze.

Coordination receipt: current local play pid53193/8077 observed; no process stopped or altered. just tell-claude reports no listener/saved for next mailbox. Operational request sent to existing "Coordinate Claude sessions" chat 00000000-0000-4000-8000-f5efe0494f81 under run-coordination skill. Proposal: next cleared8hdual-GPU window,960aggregate minutes, at most36episodes plus budgeted calibration; source16a21235c, intended historicalQwen3.6-35B-A3B-Q4_K_M/65536context pending serving parity. User authorization present; owner clearance pending. No detached endpoint claimant, lease, hardware query or inference started.

- Offline gate closed: round3 Claude/GPT/fallbackSol/fallbackAstra all literalLGTM at98c527806, synthesis runs/reviews/2026-10-23-roxanne-controller/round3/synthesis.md. Reduced vendor diversity remains disclosed. No measured-host benefit or launch-readiness claim.
- Live preflight diagnostic native-unreadable-preflight.json:18ea04snapshots are mid-callback/native CPU non-idle, including normal battles and a field handoff; direct decoding is insufficient atomicity proof. No historical raw data was edited. Asked the operator whether verified fully empty transitions may be nonsamples using raw RAM plus complete journal, retaining missing/partial/diagnostic/journal-gap veto. Policy-dependent work awaits his answer; independent host/integration preparation continues.
- Coordination replies: battle-decision ownerredacted-id and completed-rematch ownerredacted-id explicitly clear their own GPU0+GPU1 scheduling scopes, exact window to reconfirm when ready. Coordinator identified53193 as MacGLM8099, not either GPU; preserve it. DoubleKick and Claude/scheduler global clearance still pending; archived fast-knockout owner could not be contacted. No GPU call/lease started.
