# Dry-run trials missing from the experiment filter

## Problem

The bundle-v-control card counted 4/4 (dry run) and 3/4 (cook), but the stats page's EXPERIMENT filter showed only 2 runs. The workbench reads fixed-run ledgers only from `runs/experiments/<id>/trials.jsonl`. `fixed-run dry-run` refuses while a ledger exists, so each finished dry run was moved to `runs/dryruns/<name>/`, and its trials lost their experiment tag. The live cook dry run launched 4 trials, but 2 never wrote run_start, so only 2 can plot.

## Fix

- [x] RED: archived dry-run ledgers keep their trials in `experiment:<dir>`; a live ledger's claim wins. COMMIT: `test(viewer): RED archived dry-run ledgers keep their trials in the experiment filter` (e5f6e5cb)
- [x] GREEN: `archivedDryRuns` in `workbench-store.ts` reads `runs/dryruns/*/trials.jsonl` fixed ledgers (invalid trials excluded with their reason); the `dry-run` refusal names `runs/dryruns/`.
- Gates: viewer 59 files / 783 tests pass; coverage 95.09 / 90.44 / 93.54 / 97.6; tsc + eslint clean.
- [x] GREEN COMMIT: `fix(viewer): GREEN dry-run ledgers moved to runs/dryruns stay in the experiment filter` (e8fea392)
- Review 1 (Codex gpt-5.6-sol, 2026-10-16 2:30 AM EDT): BLOCKING. P1 archives read in filesystem order, a run named by two archives silently went to the first; P2 the changed refusal text had no test. Fixed together (review-fix commit): archives sorted by name, a second claim is reported as a problem and the run stays in the first; test for the dry-run refusal and its guidance. grok run produced no output (rerun).
- Gates after the fix: viewer 59 files / 784 tests; coverage 95.11 / 90.46 / 93.55 / 97.6; tsc + eslint clean.
- [ ] Delta re-review (Codex, grok), then merge (operator OK 2026-10-16 2:28 AM EDT once reviews approve).
