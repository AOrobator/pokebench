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
- [ ] Principles self-review, frozen packet and cloud Claude/Grok/GPT review (round cap two).
- [ ] Land only with required reviews, then main tests and viewer/live proof.

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
