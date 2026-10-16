# Run-tagged experiments in the EXPERIMENT dropdown

Branch `claude/run-tagged-experiments`.

## Problem

Operator, 2026-10-16: the stats page's EXPERIMENT dropdown keeps losing runs. `cohortMembership` in `packages/viewer/src/workbench-store.ts` rebuilds membership only from ledgers in specific folders, in several formats (navigation receipt, comparison receipts, queue `trials.jsonl`/`finals.jsonl`, fixed-run ledgers, hand-run launch receipts, archived dry runs under `runs/dryruns/`). Each new runner or folder move silently drops runs. Before this change, two tagged runs were in no cohort at all (`checkpoint-start-check` and the operator-aborted first `factorial-2x2-think-fast` trial at c1a442f).

## Decisions (operator approved 2026-10-16)

- **The run describes itself.** A run whose `run_start` carries `evaluation.experiment` joins a cohort derived from that tag. Its value is `experiment:<canonical id>@<commit12>`, one entry per experiment and build (`harness.commit`). The 48-hour bundle-v-control cohort, pinned to one commit, is one entry.
- **Canonical id.** The tag id resolves through, in order: `experiments/fixed/<id>.json`, `experiments/<id>.json`, a launch-receipt `manifest.json` whose `id` or `label` is the tag (hand drivers tag with the manifest label, so the 2×2 factorial's title-like tag resolves to `factorial-2x2-think-fast`), and dry-run ids `<id>-dryrun[-<phase>]` whose `<id>` is a definition. Dry runs keep their own id so they never merge with the measured experiment. Anything else stays the raw tag id.
- **Labels.** The definition's title (manifest `label` for hand-run cohorts), with ` — dry run, <phase>` for dry runs. An id with one build has a clean label. An id with several builds appends ` · build <commit7>, first trial <date> ET` (New York time). Legacy entries get the same lookup (`experiment:<dir>` and `:finals` included), else the raw value. Duplicate labels get the value appended. The snapshot carries `cohorts: {id, label, experiment, build, dryRun}[]`; option values stay machine-readable.
- **Ledgers add validity only for tagged runs.** Every ledger reader still runs; any reader that names a tagged run with an invalid outcome (fixed-run `valid:false`, `launcher_error`, failed comparison receipt, non-zero exit) excludes it with that reason, wherever the ledger lives. Legacy readers keep deciding membership only for untagged runs, unchanged.
- **Legacy overlap rule.** A tagged run always takes its tagged cohort, never a legacy one, so no run is under two entries. Historical provenance (`plan.json` receipts) still runs against the legacy cohort first, so tagged runs keep their receipt and serving-artifact provenance. On real data every legacy entry that contained tagged runs contained only tagged runs of exactly one tag group, so each is replaced one-for-one by a tagged entry with the same run set (table below); legacy entries of untagged runs are unchanged. A legacy value that collides with a tagged value is reported as a problem.
- **Audit.** `experimentsAudit` (and `just experiments-audit`) lists every run whose `run_start` names an experiment but that is in no dropdown cohort, and exits non-zero if any.

## Milestones

- [x] M1 RED: store, client and audit tests (5 failing + audit module missing; 63 existing pass in the touched files).
- [ ] M1 GREEN: tagged membership, labels, validity, audit CLI and recipe.
- [ ] M2 skills: fixed-run-launch, experiment-design, experiment-queue.
- [ ] Real-data before/after check (read-only on `~/dev/pokebench/runs`).
- [ ] Gates: viewer tests, coverage ≥ 90, tsc + eslint.
