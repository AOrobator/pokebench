# Run-tagged experiments in the EXPERIMENT dropdown

Branch `claude/run-tagged-experiments`.

## Problem

Operator, 2026-10-16: the stats page's EXPERIMENT dropdown keeps losing runs. `cohortMembership` in `packages/viewer/src/workbench-store.ts` rebuilds membership only from ledgers in specific folders, in several formats (navigation receipt, comparison receipts, queue `trials.jsonl`/`finals.jsonl`, fixed-run ledgers, hand-run launch receipts, archived dry runs under `runs/dryruns/`). Each new runner or folder move silently drops runs. Before this change, two tagged runs were in no cohort at all (`checkpoint-start-check` and the operator-aborted first `factorial-2x2-think-fast` trial at c1a442f).

## Decisions (operator approved 2026-10-16)

- **The run describes itself.** A run whose `run_start` carries `evaluation.experiment` joins a cohort derived from that tag. Its value is `experiment:<canonical id>@<commit12>`, one entry per experiment and build (`harness.commit`). The 48-hour bundle-v-control cohort, pinned to one commit, is one entry.
- **Canonical id.** The tag id resolves through, in order: `experiments/fixed/<id>.json`, `experiments/<id>.json`, a launch-receipt `manifest.json` whose `id` or `label` is the tag (hand drivers tag with the manifest label, so the 2×2 factorial's title-like tag resolves to `factorial-2x2-think-fast`), and dry-run ids `<id>-dryrun[-<phase>]` whose `<id>` is a definition. Dry runs keep their own id so they never merge with the measured experiment. Anything else stays the raw tag id.
- **Labels.** The definition's title (manifest `label` for hand-run cohorts), with ` (dry run, <phase>)` for dry runs (` — finals` for a legacy finals cohort). An id with one build has a clean label. An id with several builds appends ` · build <commit7>, first trial <date> ET` (New York time). Legacy entries get the same lookup (`experiment:<dir>` and `:finals` included), else the raw value. Duplicate labels get the value appended. The snapshot carries `cohorts: {id, label, experiment, build, dryRun}[]`; option values stay machine-readable.
- **Ledgers add validity only for tagged runs.** Every ledger reader still runs; any reader that names a tagged run with an invalid outcome (fixed-run `valid:false`, `launcher_error`, failed comparison receipt, non-zero exit) excludes it with that reason, wherever the ledger lives. Legacy readers keep deciding membership only for untagged runs, unchanged.
- **Legacy overlap rule.** A tagged run always takes its tagged cohort, never a legacy one, so no run is under two entries. Historical provenance (`plan.json` receipts) still runs against the legacy cohort first, so tagged runs keep their receipt and serving-artifact provenance. On real data every legacy entry that contained tagged runs contained only tagged runs of exactly one tag group, so each is replaced one-for-one by a tagged entry with the same run set (table below); legacy entries of untagged runs are unchanged. A legacy value that collides with a tagged value is reported as a problem.
- **Validity scan is separate from legacy membership (review 1).** `receiptValidity` reads every launch-receipt directory no verified receipt reader claimed, including `plan.json` provenance cohorts and directories whose cohort name the hand-run reader refuses, and records each row's non-zero exit, signal or launcher_error for tagged runs.
- **Unreadable ledgers (review 1, safest rule).** A ledger that fails its all-or-nothing parse (queue, fixed, archived dry run, hand-run, comparison receipt) cannot vouch for any trial it names: every run id its text mentions (`run`, `run_id`, `runId`) that is run-tagged is excluded as `Unverified: ledger <path> is unreadable, so this trial's validity is unknown`. The run stays in its tagged entry, so it is visible and counted as excluded, and the ledger's parse problem is listed. Explicit failures take precedence over this note. Untagged runs keep the legacy behavior.
- **Option order.** Newest experiment first, by each entry's first trial; undated entries last.
- **Audit.** `experimentsAudit` (and `just experiments-audit`) lists every run whose `run_start` names an experiment but that is in no dropdown cohort, and exits non-zero if any. It uses `cohortIndex`, which shares `startOf` and `taggedCohorts` with the snapshot but loads no recordings (a tagged run's cohort is exactly the snapshot's; untagged runs skip plan.json provenance), reads each first line through one reused 64 KiB buffer, and defaults to the main checkout's `runs/` (`mainCheckout`).

## Milestones

- [x] M1 RED (010bdcee): store, client and audit tests (5 failing + audit module missing; 63 existing pass in the touched files).
- [x] M1 GREEN (e7e3d601): tagged membership, labels, validity, audit CLI and recipe (`experiment-cohorts.ts`, `experiments-audit.ts`, `just experiments-audit`). Viewer 830 tests (62 files); coverage 95.30 / 90.79 / 93.67 / 97.69; tsc + eslint clean.
- [x] M2 skills: fixed-run-launch (dropdown check names `experiment:<id>@<commit12>`, adds `just experiments-audit`, explains tag membership and that dry-run ledgers can be archived anywhere), experiment-design and experiment-queue (drivers must set `POKEBENCH_EXPERIMENT`). Follow-up, not in this branch: the queue runner and finals do not tag their trials yet; they still reach the dropdown through their ledgers.
- [x] Real-data before/after check (read-only `workbenchSnapshot` on `~/dev/pokebench/runs` from a scratch script, base f46346a3 vs e7e3d601). Before 19 entries / 147 runs, after 21 entries / 149 runs; no run left a cohort, no exclusion changed, problems 0 both times. `node packages/viewer/dist/experiments-audit.js ~/dev/pokebench/runs` printed nothing, exit 0.
- [x] Gates: viewer 830 tests; coverage 95.30 / 90.79 / 93.67 / 97.69; `pnpm -r lint` (tsc + eslint, agent and viewer) clean.
- [x] Review 1: grok LGTM; Codex BLOCKING. Blocker: `handRunCohorts` skips provenance-shaped `plan.json` dirs (and verified-name dirs) before `rowFailure`, so a tagged run in a plan-based cohort with a non-zero exit, signal or launcher_error stayed valid. Nits: (a) `distinctLabels` could create a second collision; (b) the audit allocated 8 MiB per run and ran the full snapshot (>2 min CPU); (c) the audit's default runs root was the worktree's; (d) a ledger that fails its all-or-nothing parse contributed no failures, so a tagged invalid trial in it looked valid; (e) options were ordered by first-seen run, not first trial.
- [x] RED 2: tagged plan-receipt and verified-name receipt failures, unreadable ledgers of every kind (queue, fixed, archived dry run, hand-run, comparison), unique labels under repeated collisions, fast cohort index agreeing with the full snapshot (long first line, identity mismatch, symlinked log), options ordered by first trial newest first. 5 failing.
- [x] GREEN 2: `receiptValidity`, unreadable-ledger exclusion, unique `distinctLabels`, `cohortIndex` fast audit with chunked first-line reads and main-checkout default root, options newest first. Viewer 834 tests (62 files); coverage 95.39 / 90.89 / 93.70 / 97.74; `pnpm -r lint` clean. `just experiments-audit` equivalent on the real store: 0.33 s wall, no output, exit 0 (was minutes).
- [x] Real-data recheck after GREEN 2 (read-only; before = main's viewer dist, same store logic as base; after = 2b7a5615). The store had grown: the cook dry run was rerun at da8993a and its first ledger archived to `runs/dryruns/bundle-v-control-dryrun-cook-20261016T034929`. Before 20 entries / 149 runs, after 22 / 151; no run left a cohort, no exclusion changed, problems 0. Cook now shows as two builds: `…-cook@be38752ffa58` (2, first trial Oct 15, 11:47 PM ET, formerly the archived dir) and `…-cook@da8993aa08e3` (2, Oct 16, 3:50 AM ET, formerly `experiment:bundle-v-control-dryrun-cook`). Every other row as in the table below; all 13 legacy entries of untagged runs unchanged.
- [ ] Delta re-review (Codex, grok), then local merge on operator OK.

### Before → after (runs, excluded)

| Before value | After value | After label | Runs |
|---|---|---|---|
| `experiment:bundle-v-control-dryrun-20261015-3bab974` | `experiment:bundle-v-control-dryrun@3bab97465ea8` | Harness-fixes bundle vs fixed control (CLOCK_SET → RIVAL_MET) (dry run) · build 3bab974, first trial Oct 15, 7:42 PM ET | 4 |
| `experiment:bundle-v-control-dryrun-20261016-ca37a39` | `experiment:bundle-v-control-dryrun@ca37a3925021` | … (dry run) · build ca37a39, first trial Oct 15, 10:33 PM ET | 4 |
| `experiment:bundle-v-control-dryrun-confirmatory` | `experiment:bundle-v-control-dryrun-confirmatory@c5b7a84b6488` | … (dry run, confirmatory) | 4 |
| `experiment:bundle-v-control-dryrun-cook` | `experiment:bundle-v-control-dryrun-cook@be38752ffa58` | … (dry run, cook) | 2 |
| `factorial-2x2-think-fast` | `experiment:factorial-2x2-think-fast@014f18531cbb` | Whole-map navigation × navigation memory (Think Fast) · build 014f185, first trial Oct 14, 6:29 PM ET | 32 |
| (none: lost) | `experiment:factorial-2x2-think-fast@c1a442ff3598` | … · build c1a442f, first trial Oct 14, 5:56 PM ET | 1 (1 excluded, operator abort) |
| `hint-on-best-think-fast` | `experiment:hint-on-best-think-fast@42a76aa75898` | Next-milestone hint on the best 2×2 arm (Think Fast) | 4 |
| (none: lost) | `experiment:checkpoint-start-check@c1a442ff3598` | checkpoint-start-check | 1 |
| `experiment:full-map-navigation:finals` | unchanged | Whole-map navigation — finals | 7 (2) |

Unchanged legacy entries (same value and run count): bundle-showcase 2, dialogue-information-think-fast-n4 12, interface-docs-experiment 2 (1), interface-docs-resumed 12, loop-guard-name-main-n4 20 (1), loop-guard-name-n4 2 (1), loop-guard-name-n4-corrected 5 (1), named-interactions-think-fast-clock-n4 3 (1), named-interactions-think-fast-full-n4 8, navigation-memory-think-fast-n4 6 (1), navigation-topology-astar-think-fast-n4 16, think-fast-objectives-off-30m 2 (1).
- [x] Delta re-review of 71dd44dc..HEAD: Codex `VERDICT: LGTM`, grok `VERDICT: LGTM`. Merging to main 2026-10-16 4:25 AM EDT (operator OK; timed after overnight round 1 with the coordinator).

## Archived

2026-10-17, 8:40 PM EDT, on the operator's request to archive worklogs whose implementation is already on main (308ddd3e Merge branch 'claude/run-tagged-experiments'). Unchecked boxes left above are bookkeeping from before that landing.
