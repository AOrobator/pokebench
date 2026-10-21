# Pending field dialogue handoff

User requests inspection and repair of the running bundle's dialogue/loop stall. One implementation milestone: add a default-OFF pending-field-dialogue-v1 treatment, regression tests, explainer and pending experiment; gates and independent review precede landing. Do not alter the measured run or its source.

## Evidence

Live bundle 2026-10-20T20-26-22_qwen36-gpu1_97a0, clean ee11d5b8. Navigation turn 635 (28131) returns during a trainer script with field controls locked before a message owner is visible. Observe turn 636 (28143) exposes ordinary dismiss_wait ready=true. From turn 637 battle_action repeats no-battle refusals without input. Frame 028143_0.png visibly shows Tommy's intro; native story confirms Tommy undefeated. Game source 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, RustboroCity_Gym_EventScript_Tommy and TextPrinterWait: A/B advances the ordinary message. Exact ROM SHA1 f3ae088181bf583e55daf962a92bb46f4f1d07b7.

Current observe wrapper settles only battleEngaged; refused battle_action explicitly skips auto advance. battle-refusal-loop-v1 requires initialized battle, so no-battle refusals evade it. Positive supervisor and fixed-point breaker are OFF; duplicate-turn-collapse ON only produces stage-1 text=null records. No no-tool diagnosis applies to this stall.

## Scope

When ON, observe settles an already owned ordinary field message. battle_action preflight settles that field message but returns the reached boundary without executing the queued battle choice, even if a battle starts. Preserve exact pages and automatic input records, existing caps, menu/choice boundaries, pause gate and cancellation. OFF retains existing outputs and calls. Never press through unknown locks, menus or naming screens. Existing battle behavior remains unchanged.

## Checklist

- [x] RED: observed pending field dialogue and queued battle action boundary regressions
- [x] GREEN: production wiring and metadata
- [x] Gates and mutation proof
- [ ] Independent review; landing only with required approvals
- [ ] Isolated/native evidence and local explainer delivery

Not authorized: changing current measured run's config or injecting game input. Gameplay improvement remains unmeasured.

RED receipt: focused production-wrapper suite: 3 expected failures / 47 passing; observe sent no B; battle_action executed the stale choice. Log /tmp/pending-field-red.log.


## GREEN receipts
- RED commit 386b57f4; focused restored suite 56/56 passing.
- Production-factory mutation (pendingField=false) fails its B-input assertion; restored focused suite passes. /tmp/pending-field-mutation.log and /tmp/pending-field-restored.log.
- TypeScript coverage suites: 3093 agent and 1502 viewer tests; no skips. Agent lines/branches/functions 99.17/93.05/97.60%; viewer 97.81/91.02/94.23%.
- Python with explicit external ROM: 3470 passed, no skips; lines/branches/functions 97.21/92.86/100%. Initial missing-ROM run (504 skips, two failures including a timing-sensitive screen-settle test) retained; configured rerun passes without code changes.
- TypeScript lint/build and Python ruff/format/mypy pass. Vendor exact clean pin verified.
- Raw RAM 10940 archive verified with SHA256 717af3d15afd0addb4a24ab606c93cedc0b46dd0ae6b532cfec34ea00a8c0323 and external ROM; production re-render confirms dismiss_wait cursor64, A/B input, no battle.
- Full experiments checker reports 150 pre-existing malformed starter-decision-salience trials.jsonl lines in shared runtime data; no definition error reported for the new pending entry. No logs altered.
- Explainer pages-check passes; candidate default remains OFF. Registry append requires updating historical tests' relative offsets and keeping this treatment OFF in frozen historical fixtures.
- Current-run input, configuration and frozen source untouched. Positive prompt config and no-battle refusal detection remain separate findings; no performance benefit asserted.

Synced concurrent frontier-cache main changes; resolved append-only server test conflict by retaining both tests. No dialogue implementation conflict.

Pending experiment now pins runtime implementation 8e9f36da; remains unqueued. Final cumulative review includes concurrent-main sync.

Final sync commits b43cd52a and 813a42d4 retain both appended tests; pending definition pins implementation 8e9f36da.


## Round-one triage
Sol fallback LGTM, Astra fallback LGTM with one concrete supported-configuration description issue. FIX: pending field dialogue ON and battle text OFF advertised automatic battle-text advancement. Condition that sentence on battleSource and cover the independent feature combination through description and execution. No new domain or behavior outside the pending field handoff. Claude CLI signed out; Cursor Sonnet, Opus and Haiku usage-limited. No self-merge allowed. Round-two cumulative review required after correction. Frozen r1:4d62be0f, SHA25696fe830a19e817057e3f72b80995c20ab2a0f43cac16b0317679f67cbe498a2b.

R2 description regression run against frozen r1 source fails as expected; corrected source restores all57 focused tests. Grok r1 LGTM; GPT r1 confirms the same description blocker. Cumulative r2 includes the one-line guard and independent pending-only description/execution regression.

R2 implementation commit431e7ecfb. Pending definition repins to it; remains unqueued and default OFF. Final review uses cumulative packet after this evidence commit.


## Concurrent registry integration
After all r2 reviewers approved and the reviewed patch synced byte-identically with d004be2dd, main landed exit-labels-v3. Integrated it on the candidate branch. Pending field dialogue appends after the now-landed switch; both defaults remain OFF and independent. Rebased historical registry-offset/feature fixtures on current main and kept the current-registry round-trip test genuinely ALL_ON. Pending definition explicitly holds exit-labels-v3 OFF. No pending-dialogue runtime/prompt behavior changed from reviewed r2. A third integration-only cumulative review follows. The operator was asked for explicit permission to coordinate a merge hold and waive the unavailable Claude lane; neither permission is inferred from silence.

Integration focused tests98 pass. Pending source repins to8d89a155; full gates and cumulative integration review follow. Current-registry ALL_ON invariance is retained; historical fixtures explicitly keep the new flag OFF.

Frozen integration evidence: registry integration8d89a155 and upstream evidence sync58f3fb882; pending definition pins8d89a155.84 narrow factory/registry tests pass after98 broader focused tests.

## Authorized integration and bundle inclusion
Operator explicitly requests integration, review, local-main landing and bundle inclusion. This resumes the listed metadata fix after the round-cap hold and authorizes proceeding with the disclosed unavailable Claude lane. Scope: integrate current main, complete the raw incumbent, append pending after the navigation switches, enable it only in three evolving bundle arms; controls/defaults remain OFF. Frozen histories and active runs remain unchanged, no gameplay launch. Re-review the cumulative frozen result with retained Grok/GPT and model-diverse outage fallbacks.

RED manifest test:1 intended failure/57 passes; corrected-build bundle test:1 intended failure/29 passes. GREEN complete raw incumbent in current registry order, missing values explicit OFF, preserve all existing bits. pending-field-dialogue-v1 ON only in three evolving bundle arms, OFF controls/defaults. Current/frozen runs untouched. Runtime owner remains byte-identical to approved r2.

Full integrated agent suite first3185 pass/2 historical expectation failures. Correct short-cycle registration position and compare story-battle-heal pending entry to its pre-pending-dialogue bundle arm. No runtime change or skipped test; rerun gates.

## Final integration candidate
Base e635fcbfe includes navigation-tool-use-guard-v1, semantic-current-map-feedback-v1 and short-cycle-fixed-point-v1. Retain every upstream runtime/schema/bundle change; pending dialogue appended last. Implementation pin bac6652e. Raw pending preset now has every switch explicit in registry order; arms differ only in pending-field-dialogue-v1. The three evolving bundle definitions enable it; controls and generic defaults OFF. Original measured runs and frozen definitions remain unchanged. Full Python3494 pass, lint/types/vendor pass. Final TS coverage/lint/build and exact cumulative review follow before landing.

Agent full3187 pass with coverage; viewer1523 pass/1 historical pending-incumbent mismatch. Preserve old open-goal experiment while excluding the newly bundled treatment from its historical comparison; no runtime edits. Final viewer/lint/build rerun before sealing.

Config-only sync main951c8efa retains its new pinned v7 pair unchanged and preserves evolving cook exit-labels/party-item switches alongside pending dialogue. The interrupted prior review is superseded, never counted as approval. Last verified coverage3187 agent/1524 viewer,3494 Python; all lint/build/vendor pass. Rerun TS coverage/config after this sync and freeze a new cumulative packet.

R5 reviewed74ec4eb2: Grok LGTM exit0/empty stderr; GPT LGTM; independent Astra and Sol fallbacks LGTM, all hash3b5e72b6. Main then landed waypoint switchdc22bc5d. Integrate without altering dialogue runtime, preserve upstream navigation schema/defaults and bundle membership, append pending last and retain pinned v7. New cumulative integration review required after gates.

Operator: "you dont need another review if its byte identical". r6 integration-only GPT/Astra/Sol LGTM, unchanged runtime approvals carried from r5; Grok r5 LGTM retained for byte-identical runtime. Main then landed healing feature852e4fe9. Preserve every upstream runtime, feature and bundle bit; mechanical registry/default fixture integration and raw176-key completion, followed by all gates. Dialogue implementation/prompt/fixture/explainer stay byte-identical to the reviewedr5 tree. No new dialogue behavior, no further review of unchanged runtime. User declines cross-chat hold.
