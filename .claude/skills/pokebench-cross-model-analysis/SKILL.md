---
name: pokebench-cross-model-analysis
description: Compare recorded PokéBench model runs on story progress, turn and token efficiency, reliability, repeated mistakes, loops and recovery, and produce a reproducible Pokémon-themed local HTML report. Use for cross-model comparisons and intelligence or efficiency questions grounded in PokéBench; not for launching runs, changing the harness or promoting a bundle.
---

# Cross-model analysis

Produce an evidence report that answers: how far each model gets, how reliably, at what turn/time/token cost, and how it responds when its actions fail. A model's game performance is evidence about this configured agent, not a general intelligence score.

This skill is read-only with respect to gameplay, inference, services, harness code and experiments. Write analysis artifacts only. A separate explicit user instruction can authorize operational work, but it is not implied by asking for a report. Never call models under benchmark to judge their own runs.

## Freeze the comparison

- Declare the time window or named cohorts and the rule for including every run before inspecting winners. Retain failures, aborts, infrastructure errors and censored live runs with distinct labels. Separate exploratory moving-main rounds from frozen confirmatory cohorts.
- Snapshot the running viewer's `/api/workbench` read-only and record its New York timestamp and served build. Use the viewer's kept, native/derived splits and its `FRONTIER_MILESTONES` order for frontier/ranking. Raw milestone rows are an audit trail, not a second grader; exclude `present_at_start` and screenshot-only claims from earned native progress. If the viewer is unavailable, preserve the raw inventory and report that validated ranking is unavailable; do not silently restart it.
- Preserve each run's model artifact/quantization, endpoint, serving build/context/slots, sampling, clean/dirty harness pin, start/save hash, effective flags, arm, limits and stop reason. Unknown is not OFF. Keep boot, shared fast-text MAIN_MENU, checkpoint and other-save starts separate. The bundled extractor currently accepts only boot and verified unstarted MAIN_MENU recordings, and refuses checkpoint/other saves or any present-at-start facts rather than inventing inherited milestone denominators. Treat checkpoint extraction as unavailable until an explicit eligibility implementation exists. A MAIN_MENU save starts a new game but is not a power-on boot.
- Compare like conditions first: same start, harness/flag vector, serving/sampling and budget. Where this is impossible, stratify by model × arm × pin/start era, disclose differences, and call cross-era rankings descriptive. Never infer a model or individual-switch effect from a composite bundle's result.

## Measure and explain

Use the bundled extractor with an explicit `--repo`, saved `--workbench`, declared `--manifest`, `--frontier-source` matching the served build, and `--output` directory. Then run the bundled recovery script against that same repo/output. See [report inputs](references/report-inputs.md) for the manifest and reproducible commands. These tools do not fetch services, build source or launch anything.

Read [metric definitions](references/metrics.md) before extracting data. Stream `events.jsonl`; retain source hashes and per-claim run/turn/seq receipts. Freeze each live log's observed prefix and report later observations separately.

Report all requested metrics, with an explicit measured / proxy / unavailable status. The minimum set is milestone reach at common turn budgets, turns/time/tokens to milestones, frontier and longest frontier drought, repeated negative-feedback attempts, recovery latency and recurrence, assistance, loop-type recovery/safety/relapse versus the run's base rate, and infrastructure/harness confounds. Do not invent a number for unavailable evidence.

For loop outcomes use the repository's `recoveryCollector` in `packages/agent/src/loop-recovery.ts` through an existing compatible build. Preserve its 30-turn, loop-type-specific results and own-run base rates. Add boundary censoring: a fire with fewer than 30 observed following turns has incomplete follow-up; do not count its absent recovery as failure. Detector clearance, a new tile, or a menu closing is local recovery; separately show later verified story progress. This is descriptive association, not causal benefit of a warning.

Review concrete episodes for each model: an effective recovery, a persistent failure, and contrary evidence. Follow the repository's `pokebench-trace-forensics` evidence method for delivered observations, actual actions, paired frames and state. Existing source/RAM audits may be cited as prior evidence, clearly labelled. Suspected bugs without a new archive/source check remain suspected. Do not use private reasoning as causal evidence, or label every repeated action a mistake: battles, travel chunks and preparation can require repetition.

## Write the report

Author a normalized `report-input.json` from the extracted metrics and reviewed evidence, following the schema below. Use `scripts/render_report.py --metrics <report-input.json> --evidence <evidence.json> --output <index.html>` for the supported normalized input. Read [report inputs](references/report-inputs.md) for the schema. If the extractor differs, adapt the input explicitly rather than guessing fields. Keep the data sidecars, extraction command, source hashes, inclusion/exclusion ledger and report together under the canonical `runs/reports/run-analysis/<YYYY-MM-DD_slug>/` so the viewer REPORTS page discovers it.

The report leads with the supported conclusion and uncertainty, then shows cohort membership/provenance, denominators and common-budget reach, cumulative turn/time curves with per-point reach counts and spread, costs, droughts, loop/recovery metrics, evidence-backed episodes, missing measurements, and a qualified ranking. Include a human reference, best valid actual agent run and prior baseline where available; otherwise state why each is unavailable or incompatible. Never splice a best-of-each-milestone envelope into one run. A median curve can combine different completers: label it and show each denominator.

Keep mechanics and conclusions distinct. Explain what each metric measures, its formula, its failure modes and what would change the conclusion. An optional composite score needs declared weights and sensitivity analysis; default to a small dashboard of independent measures.

Apply the repo's current Emerald PokéNav theme after every regeneration (`just pages-theme <index.html>`), then `just pages-check <index.html>` (silent success). Inline all scripts, CSS and SVG; no load-time network requests. Serve from the existing local pages server at 8791; check HTTP 200 and verify real-browser screenshots at 1280×900, 1440×900 and 375×812 with details closed and open. Check every interactive control and page overflow. Preserve browser receipts and inspect the actual screenshots before claiming proof. Coordinate any server action with its owner.

The chat summary is self-contained: conclusion, key measured values and denominators, important confounds, unavailable metrics, and one working local report link. Give the absolute local-file fallback. A report never launches, promotes or changes anything by itself.
