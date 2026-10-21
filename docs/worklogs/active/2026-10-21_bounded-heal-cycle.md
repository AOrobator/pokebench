# Bounded healing trips and milestone-turn cycle protection

## Problem Statement
The operator approved on 2026-10-21: implement the discussed cycle-warning fix, cover the full gate-directed healing trip including return, keep the exemption bounded, and put it in the bundle behind a switch. fd95 s6821/s6908 warn during a gate-directed trip. 0ced s6798/s12633 are recovery records quoting old cycle text on progress turns; s12424 is a cycle supervisor after a confirmed gate override. Replay must distinguish warnings, recoveries and delivery. Approval is the operator's latest instruction and the concrete design discussed in this chat; no new approval gate is inferred.

## Skills Loaded
feature-switch; agent-observability; feature-explainer; experiment-queue; feature-worklog; execute-worklog; close-the-loop. Review follows the repository cloud-lane requirements. Pending registration is not launch approval.

## Architecture
New default-OFF `progress-aware-cycles-v1`. A bounded trip tracker consumes typed gate refusals, states and completed results. The gate supplies game-map-table routes to each offered heal place and back to the refused opponent's map. Outbound and return routes are explicit; no model-reasoning or destination inference. The loop coordinator and stall briefing suppress obsolete cycle feedback with diagnostic records and evidence. Milestone progress resets stale cycle history and prevents warnings for that turn. Preserve all other guards.

## Invariants
INV-1 OFF and absent reproduce prior events and model context byte for byte.
INV-2 Only actual gate refusal starts a trip; repeated refusals cannot renew its bounds; confirm/battle cancels it.
INV-3 Route deviation, repeated no-progress calls and a hard completed-call limit end protection. Full HP must be observed at an offered destination before return protection starts.
INV-4 Protection covers return through the explicit route and ends at the refusal position or beside the opponent on the original map. Non-cycle guards stay active.
INV-5 Native progress has precedence over stale cycle evidence on its turn. Recovery rows must not imply a newly delivered warning.
INV-6 Typed diagnostics are visible through existing Activity History/raw events; no new timeline marks. Historical logs remain immutable.

## Security Review
Local-only logic and map-table data. No game actions chosen, subprocess additions, network origins, ROM copies or vendor changes.

## Milestones
M1 — Single integrated change (shared tracker and owners must ship together)
- [x] Failing tests and RED commit: route/HP/return bounds, milestone turn, actual replay and OFF invariance.
- [x] Implementation and GREEN commit: production wiring, schema, switch registry/defaults, bundle entries, pending experiment, linked HTML explainer.
- [x] Gates: test, lint, build, coverage, vendor, schema/pages/experiment checks; mutation receipts.
- [x] Production model-delivery and candidate viewer/replay/explainer proof.
- [x] Principles self-review, frozen packet and required integration reviews: Claude/GPT LGTM, Grok explicitly waived by the operator.
- [x] Land with required reviews/waiver and pass main tests. Viewer/live closure is recorded in the receipt named below.

## Closing the Loop
Replay schema-valid source evidence, inspect model context at next decision, test genuine loops after expiry/deviation and on confirmed battle. Candidate viewer uses scratch run root without approvals. Keep implementation, review, landing and live proof distinct.

## Session Log
COMMIT: `test: bounded gate heal trip and progress-aware cycle contracts (RED)` (1b67eb27).

2026-10-21: read-only discovery complete, isolated managed worktree created from main. No running gameplay or historical recording changed.

## Surprises
The cited 0ced s6798 and s12633 events have phase recovered, not warning/supervisor. 0ced s12424 follows confirm:true; this should remain unexempt as a genuine-loop control unless replay shows a separate progress defect.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] ASK USER: archive this worklog.

Pre-sync validation: coverage runs all tests: agent 3295, viewer 1607, Python 3600. Agent statements/branches/functions/lines 97.15/93.08/97.60/99.14; viewer 95.42/91.33/94.33/97.90; Python lines/branches/functions 97.23/92.98/100. Build, lint, vendor and pages-check pass. Five deletion mutations fail their intended tests and restored suite passes (runs/reviews/progress-aware-cycles/mutation-receipts.json). The initial pi test was corrected to use a genuine recorder milestone source rather than a manually constructed event with a wrong run id. Actual pinned pi now proves no stale note in the next request.

The standard experiments-check resolves canonical main and finds pre-existing starter-decision-salience ledger errors (150 invalid rows); no candidate-definition error was reported. Candidate definitions will also be validated separately against a scratch root. Main advanced with mart-stock-readout-v1 during development; sync required before freezing review.

COMMIT: `feat: bound cycle exemptions across gate-directed healing round trips` (8c9f9571). Synced with main 54640622 (mart-stock-readout-v1): retained main ordering, appended this switch after mart stock, preserved its bundle flags and tests, and reapplied historical index/exclusion assertions without changing their behavior. Return completes at the refusal position or beside the opponent, not merely on entry to its map.

COMMIT: `merge: current main into bounded healing cycle protection` (5bd58d24d). Synced tests: agent 3299, viewer 1610, Python 3638 pass (`just test`). Post-sync lint/build pass. The new feature key crossed the existing card-size fixture's 20x ratio by 116 bytes; increased that fixture's raw historical splits from 5000 to 6000, preserving the same 20x requirement (production projection is unchanged). HP diagnostics now disqualify healing proof and have a regression case. All 176 candidate experiment definitions and both control-base hashes validate directly; the standard experiment CLI intentionally resolves canonical main and reports that older ledger problem. A manually invoked Python coverage attempt omitted the ROM environment and failed/skipped; it is retained as a failed environment attempt, not a passing gate, and is rerun through `just coverage` with the configured ROM.

Main advanced to 0349ae26b (battle-refusal field correction, no new switch); sync this before the final gates and review.

COMMIT: `fix: verify healing HP and preserve historical projection test margin` (a05e80dc). During the next sync main advanced again to 4cfce22ec (caught-dex-input-v1 plus battle-field-refusal). Retained their code and registry ordering and appended this treatment last. Historical test arms explicitly keep this new treatment OFF; the registry round-trip test still uses the actual current all-on set. No production change was needed for the sync.

COMMIT: `merge: caught-dex and field-refusal main into cycle protection` (ccf1a3af1). Final synced coverage gate: agent 3306, viewer 1612, Python 3647 pass, zero skips. Agent statements/branches/functions/lines 97.17/93.08/97.66/99.16; viewer 95.41/91.32/94.33/97.90; Python lines/branches/functions 97.27/93.07/100. Lint/build/vendor/pages and schema equality pass. Candidate validation parses all 177 experiment definitions and both fixed definitions, including their frozen control-base hashes. Standard canonical experiments-check remains red solely on the old starter-decision-salience ledger rows.

Candidate browser: scratch server 8797 with historical fd95 plus a clearly named diagnostic rehearsal; no experiment approvals or queue runner. Rehearsal records come from the production StallBriefing over immutable fd95 source records, with game-table-derived routes added only in memory. Existing Activity History and raw-event detail show diagnostic retirement, no supervisor instruction, and no new timeline kind. Harness Config marks historical fd95 NOT RECORDED for this switch; its READ EXPLAINER link opens the intended tracked file. Phone and desktop explainer screenshots inspected (1280/1440/375); phone scrollWidth 375, wide diagram scrolls within its figure. No console errors. Screenshots: canonical runs/mockups/progress-aware-cycles/. The rehearsal is not a model/gameplay trial or a benchmark result.

Activation corrected to NEW_GAME_CREATED: milestone-turn protection can act in Birch's introduction, before truck exit (milestones.ts native definition), while the healing segment still needs a separately validated pre-refusal checkpoint and operator GPU-hour budget before queueing. No trials approved, launched or historical logs rewritten. Pending source pin identifies ccf1a3af1, the runtime implementation tree, until a future operator repin.

Before review, merge the evidence-only main update d00cded5 (only another worklog changed); the tested code is identical. Principles self-review: PB1-PB13 PASS with qualified scope, zero FAIL; artifact runs/reviews/progress-aware-cycles/principles.md. Required review roster: Claude standalone, Cursor Grok, fresh isolated GPT subagent.

COMMIT: `docs: record bounded cycle proof and native activation` (19706b13); evidence-only main sync (34ed17574). `just test` after the sync: agent 3306, viewer 1612, Python 3647 passed, zero skips. The frozen code is the same code as final lint/build/coverage; subsequent edits only recorded proof and corrected pending activation. Final implementation/pending registration/diagram and candidate delivery proof complete; reviews and landing remain pending.

COMMIT: `docs: freeze progress-aware cycle candidate for independent review` (57ca9336). Round1 packet base d00cded5, head57ca9336, SHA256 5fbf6dce325704d07f796fdf11c49725f807701977aabae56d376de652bfd3a0. All three required cloud lanes returned BLOCKING. Claude standalone exit0 identifies trigger-script reset; independent GPT validated both that and an invalid generated event (and ran all3306 agent tests); Cursor Grok exit0 returned only `VERDICT: BLOCKING` without an actionable finding body. First CLI launch attempts had empty logs because orphan child processes did not survive the tool process group; retained empty attempt1 logs, relaunched foreground wrappers as1a. No auth or model waiver inferred.

Triage, fix batch1: FIX P1 generated suppression evidence dedupes to3 references at fd95 result6704 (`[6701,6704,6265]`) but schema permits2; retain causal gate/milestone and current result. FIX P2 healing calls use the broad field reset, clearing separate trigger-script memory; introduce a cycle-only reset during healing and keep the broad reset on actual milestones. No unrelated findings accepted. The stricter full typed replay discovered P1 before reviewer synthesis; prior simplified browser rehearsal was insufficient to prove generated evidence cardinality. Add production-output schema validation and a schema-valid synthetic repeated-trigger regression before fixing either.

COMMIT: `test: validate cycle diagnostic records and preserve trigger guards (RED)` (1b5f918e). Both intended assertions fail: fd95 production output violates two-reference schema; synthetic trigger repetition warns OFF but is erased ON. Fix batch1 retains gate/milestone + current-result evidence and factors FieldRules.resetCycles, preserving trigger attribution/history on healing holds while keeping full resets on milestones.

GREEN review fixes: final stable tree passes just build/lint/test/coverage/verify-vendor, schema equality, pages-check and direct definition validation (177 entries plus both fixed control hashes). Tests: agent3307/viewer1612/Python3647, zero skips. Coverage statements/branches/functions/lines: agent97.19/93.11/97.70/99.17, viewer95.42/91.34/94.33/97.90; Python lines/branches/functions97.27/93.07/100. Both new restored-bug mutations fail exactly their intended assertions (round2-mutations.json). Full typed production replay:459 events,3 valid diagnostics, cited fd95 source6820/6907 use gate6701/current-result evidence. Candidate browser raw inspector shows these diagnostics, no supervisor delivery, no console errors; screenshot replay-diagnostic-final.png. New output validation closes the earlier source-only validation gap. No new production domains; three existing owners changed in the accepted fix batch.

COMMIT: `fix: preserve independent guards and validate cycle retirement evidence` (4681068e). Pending experiment source now pins this GREEN runtime implementation rather than the pre-review implementation. Round2 principles explicitly correct the two insufficient round1 PASS claims; zero FAIL after repair. All reviewers receive the same cumulative packet, both prior findings and their regressions.

## Round2 reviews, operator waiver and queued integration
Frozen packet: base d00cded5b433192d1cc4df3ea8570f12161fa721; head1ca43e5d8ec731ccc75c8983a0bd73b13ccef1a1; SHA256a2d43fff4d17aef799e09f0d9cfd82277bab3a00f075328fd5ec6119ba4ea336. Claude standalone exit0 VERDICT: LGTM (51 focused tests). Fresh GPT VERDICT: LGTM (3307 agent tests independently passed). Grok4.5 Cursor timed out600s with empty output; refreshed model list, same-packet Grok4.7 Medium retry also timed out600s. Neither timeout counts as a verdict. Two fresh fallback reviewers, gpt-6.1-sol and gpt-6-astra, each VERDICT: LGTM and115 focused tests passed; reduced vendor diversity honestly retained. Full receipts copied to canonical runs/reviews/progress-aware-cycles-1ca43e5d/.

Direct human authorization in this chat on2026-10-21: “Waive Grok for this one. Wait for your turn on the board, then resync, rerun the checks, re-review if the diff changed, and land it.” Grok waiver is scoped to this patch, including its authorized integration review. It is not a global workflow change. Prior review round cap does not prohibit the explicitly requested changed-diff integration review. No remaining concrete blocker was reported in completed round2 reviews. Claude's nonblocking observations remain in its full log; no new scope accepted.

Registered on shared landing board as codex/bounded-heal-cycle, correct chat ID; position7 at check. Existing order is authoritative; no hold of main for this candidate and no hand edits. Coordinator was told of the waiver and the slot requirement. Main has advanced with other features; do NOT merge or restart8790 until this branch reaches top. At top: pin current main, sync, resolve integration mechanically, run full gates, compare exact cumulative diff to reviewed packet, re-review changed diff with Claude/fresh GPT (Grok waived), ff-only land, test main, one viewer-main and live check preserving every trial, then land-done. Board's handoff queues a message to this chat automatically.

This evidence-only branch commit is not itself the previous frozen review packet, and is not being called reviewed/landable. Source runtime remains1ca43e5d until authorized integration. Waiting on external board handoff; no additional human approval needed to continue the steps above. No gameplay launched, historical source changed, main merge or live viewer restart by this chat.

## Authorized landing-slot integration
Board now lists this branch first; direct handoff received. Pinned main f671f35d4342ed5b2cebcbe7179af5c3ccf65203. Merge conflicts are registry append order/defaults, fixed bundle arms and historical registry tests, resolved by preserving all seven new training/catching switches from main then appending progress-aware-cycles-v1. Healing tracker/coordinator/stall production implementation is byte-identical to the previously reviewed runtime. New training registry assertion keeps the seven switches immediately before this appended treatment. Pending incumbent adds explicit false values for seven new switches. Existing historical all-on arms keep this treatment OFF.

Integration TypeScript suites pass agent3337/viewer1615. Schema generated bytes match. Explainer received newly required Emerald theme; pages-check passes and actual browser1280/1440/375 screenshots inspected, phone width=scrollWidth375, wide figure scrolls inside its container, no console errors. No live viewer/gameplay change yet. Full gates and changed cumulative-diff Claude/fresh-GPT re-review follow, Grok explicitly waived by the operator.

Integration bundle correction: while queued, whole-map-pair-2h became the active promoted-control versus pending-bundle definition. Original two-definition inclusion would leave this fix out of that current bundle. The user's explicit “put it in the bundle” authorization covers preserving the new control and enabling this switch only in the pending bundle there, plus whole-map-cook-1h. Extended direct production-definition check fails before the correction (active-bundle-red.log); four-definition production armFeatures test now asserts control false/bundle true. Existing gate-held-out/offInBoth settings are unchanged, so the healing exemption still requires an actual enabled gate refusal; milestone protection remains independently useful. New cumulative review boundary explicitly includes these four current definitions, no historical numbered variants or launch.

Landing-slot gates GREEN: just build/lint/test/coverage/verify-vendor, schema byte equality, pages-check and direct184-entry/four-fixed-definition validation all pass. Final just lint and just test repeated after current-bundle additions: agent3337/viewer1615/Python3702, zero skips. Coverage app-code statements/branches/functions/lines: agent97.24/93.04/97.76/99.18; viewer95.41/91.32/94.33/97.90; Python lines/branches/functions97.29/93.05/100. Four-definition focused fixed-runner suite47pass and control hashes unchanged. Full typed source replay459records/3diagnostics remains valid after sync. Pending experiment source pin2f3c03e7 contains the integrated runtime including all new registry flags. Actual model delivery, seven restored-bug mutation receipts and exact source fixtures remain retained; no core code changed after their proof.

Principles3 PB1-PB13 all PASS with evidence and explicit pending review/landing. Changed packet requires new Claude/fresh-GPT review; Grok is explicitly waived. Main remains pinned f671f35d and this branch retains first slot. No further product change planned after this freeze.

## Landing evidence (before the single viewer refresh)
Authorized changed-diff integration packet: base f671f35d4342ed5b2cebcbe7179af5c3ccf65203, frozen head af70fa34255e90a62268bd03826b0b13dbb45da0, SHA25697f8d6668b6662603f5249fde5f14bb02fcd43d9259117106805cd37d6f94864. Claude standalone exit0/empty stderr VERDICT: LGTM, source inspection; fresh independent GPT VERDICT: LGTM and independently3337agent/1615viewer tests. Direct human Grok waiver recorded above. Claude's repeated nonblocking observation on milestone clock coupling when story-progress-clock-v1 is OFF is a FOLLOW-UP, unbundled combination only; all four current comparisons and pending incumbent have the clock ON. No extra scope accepted.

Verified first on board, pinned canonical main clean, then `git merge --ff-only af70fa34255e90a62268bd03826b0b13dbb45da0` succeeded. Main just build and just test pass:3337agent/1615viewer/3702Python, zero skips. No source changed after frozen reviews. Main source merge SHA is af70fa34255e90a62268bd03826b0b13dbb45da0. This evidence-only commit touches only this worklog and is within the reviewed workflow's post-land exception. It precedes the viewer refresh so the served stamp can match latest main, including these docs, without a second main move afterwards.

Restart/browser verification for this landing is tracked in canonical `runs/reviews/progress-aware-cycles-af70fa34/live-proof.json`. At this evidence commit its status is pending_viewer_restart; after the single viewer-main refresh the receipt will record served commit, exact listener, gameplay survival, New York restart time, actual live card→explainer click, live runs and build-skew problems. That runtime receipt and screenshots close this final step without another main move. Full review/gate logs are retained beside it; historical recordings and all frozen gameplay checkouts are untouched. No measured trial or experiment approval issued. Keep branch/worklog unarchived: operator has not authorized archival.
