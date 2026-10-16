# Story frontier experiment filter lists every experiment

Operator ask (2026-10-15): the Runs & Comparisons EXPERIMENT dropdown was missing experiments, most
importantly the running finals (incumbent plus every finalist) and the Think Fast whole-map ×
navigation-memory 2×2. Viewer-only measurement change: no feature switch, no explainer.

## Inventory of recorded experiments (real run store, before → after)

| Cohort | Ledger | Runs | Before |
|---|---|---|---|
| experiment:full-map-navigation:finals | runs/experiments/full-map-navigation/finals.jsonl | 2 so far | missing |
| factorial-2x2-think-fast | launch-receipts/navigation-factorial-think-fast-n4/trials.jsonl | 32 | missing |
| hint-on-best-think-fast | launch-receipts/hint-on-best-think-fast/trials.jsonl | 4 | missing |
| dialogue-information-think-fast-n4 | trials.jsonl | 12 | missing |
| think-fast-objectives-off-30m | trials.jsonl | 2 | missing |
| interface-docs-experiment / interface-docs-resumed | manifest.json attempts | 2 / 12 | missing |
| loop-guard ×3, named-interactions ×2, navigation-topology-astar, navigation-memory | verified receipts | unchanged | present |

Not listed on purpose: factorial-2x2-qwen38 and grass-cost never launched; the aborted first 2×2
attempt (30b2, 2126, 5521) is excluded from the 2×2 by its README; early baselines have no cohort.

## Milestone 1: ingest finals and hand-run cohorts

- [x] RED: finals cohort, hand-run cohorts, no relabeling of owned runs
  COMMIT: `test: story frontier experiment filter lists finals and hand-run cohorts` (d9a7a49)
- [x] GREEN: viewer 650/650 tests, coverage gate passes (all files 95.36 / 91.14 / 94.41), lint clean
- [x] GREEN COMMIT: `fix: story frontier experiment filter lists finals and hand-run cohorts` (80ec7d7)
- [x] Claude CLI review: LGTM with hardening notes. Applied: plan.json dirs left to provenance, hand-run
  ids may not take a verified or experiment: name, duplicate runs across receipts reported, finals and
  queue ledgers tolerate a torn last line, plus tests (viewer 652/652, coverage 95.39 / 91.16 / 94.41, lint clean)
- [x] HARDENING COMMIT: `fix: harden hand-run cohorts per Claude review` (1112755)
- [x] Grok review: CHANGES REQUESTED (torn-line trim dropped complete rows; unvalidated id claim;
  verified names reserved only after membership). Claude re-review: CHANGES REQUESTED (plan.json skip
  dropped think-fast-objectives-off-30m). Fixed: only provenance-shaped plans skip, a last line is dropped
  only when it is not JSON yet, ids claim a dir only as one safe segment, every strict receipt id is reserved.
- [x] FIX COMMIT: `fix: address Grok and Claude re-review of hand-run cohorts` (993570b), rebased on main e0a0552
- [x] Round 3: Grok 4.7 high LGTM, Claude CLI LGTM. Viewer 652/652, coverage 95.38 / 91.16 / 94.39, lint clean.
  Real store: every cohort listed, problems []. Deferred (non-blocking): hand-run ids not checked against
  provenance directory names; a cohort literally named "all" would collide with the dropdown default.
- [x] Operator approved merge and restart (2026-10-15 16:43 UTC); rebased onto main fb4b6df, viewer 655/655, lint clean
- Standing expectation: new experiments appear in the dropdown without being asked. Queue and finals
  ledgers and any new launch-receipts/<dir>/ with trials.jsonl or manifest attempts are picked up automatically.
- [ ] 8790 restart only with operator OK: the finals runner lives in that process

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-15). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
