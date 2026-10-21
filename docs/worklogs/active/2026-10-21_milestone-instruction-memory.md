# Conservative milestone instruction memory

Owner: Codex, branch `codex/milestone-instruction-memory`, isolated worktree.

## Authorization and scope

Operator approved implementation on 2026-10-21: new feature switch, bundle treatment only, permanent full archive, compact formatting, offline verification against ea04/d548/1331/fd95/8892/acfa. No measured runs, live-run edits, or inference probes. The preceding proposal is approved; no new implementation approval is required.

One integrated milestone: RED tests and trace fixtures → GREEN production wiring, registry/bundle/pending experiment, compact ledger and auditable selection → gates and frozen independent review → serialized local landing and viewer proof when gates permit. Do not archive this worklog without approval.

## Policy / invariants

- INV-1 OFF produces byte-identical existing memory and conversation ledger.
- INV-2 All selected delivered episodes stay in the archive; retention only projects model input. Exact text, page order, attribution and source refs survive for retained episodes.
- INV-3 No turn-age expiry. Only verified completed story scenes advance chapters; unrelated trainer, arrival and evolution milestones cannot retire instructions.
- INV-4 Only audited exact game-text templates can retire an older episode. Unknown or mixed/future/reusable dialogue stays. Missing completion proof retains evidence.
- INV-5 Keep all current-chapter episodes, including the chapter-transition call. Runtime classification cannot depend on historical run IDs or analyst keep lists.
- INV-6 No objective/route selection, new game knowledge or synthesized dialogue. Recorded retention receipt explains every kept/retired episode without injecting the retired quotes.
- INV-7 Full event logs and raw RAM remain immutable; trace replay uses source-prefix hashes and original cutoffs. Add to bundle treatment, leave control/defaults OFF; register pending, no queue/approval/launch.

## Load-bearing questions resolved during implementation

- Prior counts were manual classifications; mechanically unknown cases must stay even if that makes the implementation more conservative. Explain every difference rather than forcing a count.
- Need a source-attested exact-template catalog and native completion ownership; no heuristic semantic extractor.
- Coherent delivered native state and existing milestone predicates qualify chapter/proof; undelivered/failed state cannot retire memory.
- Remove duplicated room-history injection only with this switch ON; retain existing delivery/archive channels.

## Checklist

- [x] RED: defaults/OFF invariance, native completion vs arrival, mixed/unknown retention, production delivery, full archive and six snapshot replay.
- [x] GREEN: implementation and trace keep/drop manifests.
- [x] Registry/bundle/pending entry/explainer and schema.
- [x] Wiring deletion/restoration proof.
- [x] Gates: test, lint, build, coverage >=90 each metric, vendor, experiment/page checks.
- [ ] Principles self-review and frozen Claude/Grok/GPT review.
- [ ] Landing board, merge, main tests and viewer/browser proof.

## Evidence / review log

Initial base: 4b70c35dd. Existing analysis snapshots: ea04 #22522; d548 #23110; 1331 #26032; fd95 #25304; 8892 #25455; acfa #10969. No benchmark benefit claim.

RED: 9 new failures, 3398 existing agent tests passed; `runs/milestone-instruction-memory/red.log`. Source fixtures retain verbatim original events, per-prefix hashes and exact cutoffs.

GREEN progress: RED commit 82ae0b285. Six full original prefix replays verified source hashes, identical complete archives and exact retained page text/provenance. Actual counts: ea04 27/51, 61666→17532 chars; d548 6/14, 32360→10004; 1331 5/13, 32254→9640; fd95 6/14, 32811→10194; 8892 6/14, 31783→9971; acfa 3/12, 21809→5157. Deliberate conservative difference: ea04 nurse greeting results #5006/#11212 retained as reusable service information (manual proposal had archived them).

Agent full coverage suite passed 3411 tests (229 files): lines 99.20%, branches 93.14%, functions 97.81%. Additional safety/wrapper tests pass separately; final gates repeat after final source sync. Python with configured ROM: 3806 pass. Initial unconfigured direct pytest invocation failed on missing POKEBENCH_ROM; no Python source changed. Initial parallel coverage hit unrelated 5-second timeout flakes; worker-limited coverage avoids load without changing tests/thresholds. Full viewer coverage initially found one frozen-bundle comparison needing the appended switch excluded; focused fix passes. Legacy registry position/count tests and frozen historical feature helper updated for appended OFF switch.

Final gates: 3414 agent tests, 1657 viewer tests, 3806 Python tests passed. Coverage: agent lines 99.20 / branches 93.17 / functions 97.81; viewer 97.95 / 91.33 / 94.35; Python 97.29 / 93.11 / 100. Build, tsc/eslint, ruff/format/mypy, vendor and page checks pass. All experiment definitions parse in the complete agent suite. `experiments-check` reports 150 malformed starter-decision-salience ledger lines, exactly identical on unchanged main (baseline captured); this branch does not edit that ledger.

Wiring proof: disabling the factory switch read makes the production delivery assertion fail; disabling the companion-ledger switch reads makes the duplication assertion fail. Both restored; 17 targeted tests pass. Initial deletion harness incorrectly searched only stdout for the assertion on stderr; its captured log is preserved, and the separately named v2 attempts and receipt prove both failures/restorations.

Browser proof: 1280/1440/375 collapsed/expanded explainer screenshots inspected under canonical runs/mockups/milestone-instruction-memory-v1/shots. Candidate viewer 8796 serves an isolated explicitly named offline-retention-audit-not-gameplay replay, without queue approvals/autorun. History shows 27 kept / 24 archived; opening Raw event JSON exposes retention/rules/native chapter references. Harness Config feature card says ON in the derived audit fixture and its Read Explainer link opens the tracked page. Console errors empty. No timeline marks added. Preview is not a new gameplay run or a live-main proof.

Landing: joined board at number 9 on Oct 21 16:08 New York time. Coordinator confirmed no holds except for #1; withdrawn hold request. Main remains 4b70c35dd. Review packet will freeze this isolated candidate; queued landing requires main sync/re-gates/re-review of any changed packet. No main move, viewer-main restart, experiment approval or measured run has occurred.

COMMIT: GREEN implementation `7bda28463`. Pending experiment source now names that exact implemented checkpoint; it remains blocked until reviewed landing and cohort design. This metadata commit freezes no new gameplay behavior. Review receipts live under ignored `runs/milestone-instruction-memory/` and /tmp/pokebench-milestone-memory-review-r1; reviewer outcomes are not predeclared.

## Frozen review result and landing stop

Frozen code/docs candidate: `5410dbc03d0d663998e5b1e0182fa89678fa214d`, base `4b70c35ddb964e18d4e618bce57317503948a02c`, canonical binary diff SHA-256 `21f9705f5d172e41f6d03ae1882751824115ceaa0de356e68f95289c22d1a4d5`. Principles self-review completed with no FAIL. Clean HEAD and exact digest independently reproduced before/after review. Complete packet, transports and synthesis preserved at `runs/milestone-instruction-memory/review-r1/`.

- Claude CLI: exit 0, empty stderr, one successful result and terminal `VERDICT: LGTM`.
- Fresh GPT lane `/root/memory_review_gpt`, no inherited context: independently verified digest, 15 focused tests passed, `VERDICT: LGTM`.
- Grok Cursor: exit 1, usage limit, no verdict. Unavailable; never counted as approval.
- Availability fallback `/root/memory_fallback_sol` (gpt-6.1-sol) and `/root/memory_fallback_astra` (gpt-6-astra), both no inherited context: independently verified unchanged digest/status, both `VERDICT: LGTM`; focused 15 and 17 tests pass respectively. Reduced vendor diversity; these do not satisfy missing Grok cloud lane for landing. Sol accidentally invoked the full suite first: 3413 passed, one unrelated serial-comparison child-start timeout; scoped retention suite then passed. This does not replace the earlier successful full gated run.

Triage: zero Fix findings. Follow-up only: explicitly pin the five incidental templates with no additional completion predicate; generalize exact home-sign speaker name if source attribution supports it (other names currently stay); optional bounded fixture caching/retention optimization; unrelated Unicode title escape cleanup; additional exact dialogue variants. No scope expansion or code changes made for these suggestions.

Landing stop: corrected queue notification to actual chat title; same branch retains place, now number 8. Repository execute-worklog rule requires operator decision when a cloud review lane is unavailable. No self-merge, main move, live viewer restart or experiment launch. Scratch preview 8796 stopped after browser proof; canonical editable Python environment restored. This evidence-only branch commit follows the frozen reviewed candidate and is not represented as part of that review packet. Before any later landing, resync main, rerun gates and seal/review the resulting packet as required.

## Operator Grok review exception

On 2026-10-21 the operator explicitly authorized: "I'm okay with the Grok review exception. Use the completed reviews and land it when our turn comes." The Grok usage-limit gate is waived for this change; use the completed Claude/GPT and two availability-fallback reviews, retaining the reduced-diversity disclosure. This authorizes local landing when this branch reaches number 1. It does not waive serialized landing, current-main synchronization, required gates, changed-packet review, post-landing main tests/browser proof, or authorize experiment launches. Await board notification; no polling, queue reordering, or main move while another branch holds the slot.
