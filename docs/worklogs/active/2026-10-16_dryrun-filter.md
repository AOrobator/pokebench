# Dry-run trials missing from the experiment filter

## Problem

The bundle-v-control card counted 4/4 (dry run) and 3/4 (cook), but the stats page's EXPERIMENT filter showed only 2 runs. The workbench reads fixed-run ledgers only from `runs/experiments/<id>/trials.jsonl`. `fixed-run dry-run` refuses while a ledger exists, so each finished dry run was moved to `runs/dryruns/<name>/`, and its trials lost their experiment tag. The live cook dry run launched 4 trials, but 2 never wrote run_start, so only 2 can plot.

## Fix

- [x] RED: archived dry-run ledgers keep their trials in `experiment:<dir>`; a live ledger's claim wins. COMMIT: `test(viewer): RED archived dry-run ledgers keep their trials in the experiment filter` (e5f6e5cb)
- [x] GREEN: `archivedDryRuns` in `workbench-store.ts` reads `runs/dryruns/*/trials.jsonl` fixed ledgers (invalid trials excluded with their reason); the `dry-run` refusal names `runs/dryruns/`.
- Gates: viewer 59 files / 783 tests pass; coverage 95.09 / 90.44 / 93.54 / 97.6; tsc + eslint clean.
- [ ] Review (Codex, grok), then operator approval to merge.
