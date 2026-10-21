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
- [ ] GREEN: implementation and trace keep/drop manifests.
- [ ] Registry/bundle/pending entry/explainer and schema.
- [ ] Wiring deletion/restoration proof.
- [ ] Gates: test, lint, build, coverage >=90 each metric, vendor, experiment/page checks.
- [ ] Principles self-review and frozen Claude/Grok/GPT review.
- [ ] Landing board, merge, main tests and viewer/browser proof.

## Evidence / review log

Initial base: 4b70c35dd. Existing analysis snapshots: ea04 #22522; d548 #23110; 1331 #26032; fd95 #25304; 8892 #25455; acfa #10969. No benchmark benefit claim.

RED: 9 new failures, 3398 existing agent tests passed; `runs/milestone-instruction-memory/red.log`. Source fixtures retain verbatim original events, per-prefix hashes and exact cutoffs.
