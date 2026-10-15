# Remove the execution queue

Operator request (2026-10-15): the Runs & Comparisons execution queue duplicates the experiment queue; remove it. Viewer-only, so no feature switch. The workbench snapshot keeps cohort membership and infrastructure/launcher exclusions; it stops building queue rows. The ad-hoc next run stays visible on PokéNav where it is queued.

## M1 — remove the execution queue

- [x] Remove the EXECUTION QUEUE box, `WorkbenchData.queue`, the queue-status argument to `workbenchSnapshot` and the `.wb-queue*` styles; the data-problems block moves to the top of the page. Queue assertions in the store tests become cohort membership and exclusion assertions.
  COMMIT: `feat(viewer): remove the execution queue from Runs & Comparisons` (eda1cb0)
- [x] Merge main (single-card experiment queue): `workbench.html` conflict resolved to main's card without the execution queue (c3669ad). Viewer 583 tests; lint clean; checked in a browser against the real runs store: no execution queue, same 8 cohort options as main, experiment queue renders, no problems.
- [x] Review round 1: Claude CLI LGTM (nits: dead navigation lease check, stale names, double spaces); Grok (cursor-grok-4.5-high) BLOCKING on tests that no longer proved accepted receipts add cohort membership.
- [x] Fixes: `parseNavigationReceipt` drops the queue.json/lease-owner check that only fed the queue; accepted-receipt, frozen-checkout, pending-launch and experiment-ledger tests assert run cohorts. Viewer 583 tests; coverage 94.92 lines / 90.74 branches / 93.78 functions (gate 90 green); lint clean.
- [x] COMMIT: `refactor(viewer): drop the unused navigation lease check and prove cohort membership in tests` (d4b05bd)
- [x] Review round 2: Claude CLI LGTM, Grok LGTM. Shared advisory: the late-invalid navigation ledger test now also asserts no cohort is assigned. Remaining nits deferred: the malformed-ledger table has no on-disk run (rollback is covered by neighbouring tests); no two-cohort crossover test (membership is keyed by run id).
- [ ] Operator approval, local merge into main, restart viewer on 8790.
