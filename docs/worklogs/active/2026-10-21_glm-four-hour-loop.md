# GLM four-hour exploratory bundle/control loops

Operator request 2026-10-21: start four-hour GLM loops, bundle versus control, taking current main before each loop. Root coordinator owns service swap and actual launch. This branch prepares the runner and reviewed definition; no gameplay or service changes here.

## Contract

One round is one serial bundle/control pair, four hours each, on the Mac lane (8099 model / 8077 game). Each pair freezes one main commit; the next pair picks current main. Materialize exactly the current `bundle-v-control` feature recipe (control base, base feature vector, switches, shared ON/OFF flags); no GLM-specific extra switch. Keep the existing hash-pinned fast-text MAIN_MENU start: this is New Game from a common menu save, not a literal power-on boot. GLM model/serving/lane remain separate from the feature recipe. No target stop; cap 14,400,000 ms, 20,000 turns; terminal failures retained. This is open-ended exploratory cooking, no fixed-N inference, p-value, promotion or single-switch attribution. One Mac executor costs up to eight Mac-hours per pair; user authorized continuing until stopped.

The loop uses existing isolated fixed-run code and preserves ledgers, native recordings and visible experiment metadata. Stop/abort applies to the loop. No frame pruning; high disk usage holds. Keep unrelated Qwen GPU lanes and their services untouched. No service stop, launch or merge by this subagent.

## Work

- [x] RED: exact current recipe materialization and preserved GLM launch contract tests.
- [x] GREEN: optional dry-run recipe seam, four-hour definition, parameterized existing loop and GLM wrapper.
- [x] Fake-data rehearsal: serial pair, latest-main next pair, singleton, stop propagation and disk hold.
- [ ] Deterministic gates and three-lane cloud review of frozen packet.
- [ ] Coordinator integration / viewer / actual launch proof (root-owned).

## Scope

Production path set: `packages/viewer/src/fixed-cli.ts`, `scripts/whole-map-loop.sh`, new `scripts/glm-loop.sh`, new `experiments/fixed/glm53-flash-4h.json`. Tests and this worklog support those paths. No new harness feature, game observation, model tool or agent policy. Non-goals: service management, cross-model report, skill authoring, unrelated loop refactors, pruning, queue approval.

## Progress

Read live main f671f35d4342ed5b2cebcbe7179af5c3ccf65203 and source definitions. Existing GLM 2h recipe is stale relative to canonical bundle; dynamic materialization avoids copying drift. Existing dry-run path already produces one trial per arm per lane and tags the experiment for viewer discovery. Normal fixed-run approval path is unchanged.

RED receipt: two new CLI contract tests fail before implementation (ignored recipe and missing receipt); existing 22 CLI tests pass. Infrastructure rehearsal scaffolding follows implementation.

## Launch dependencies

- Land this branch's optional `fixed-run dry-run --feature-recipe` CLI seam, GLM 4h definition and detached wrapper together.
- Parent verifies GLM `/health` and `/props` against definition serving receipt (model, b11671-ba3c05f71, context 262144, one slot); lane8077 and pool8099 free. Unrelated GPU8075/8076 gameplay is permitted and untouched.
- Root serializes one `just viewer-main` restart after integration; served viewer stamp must equal or descend from launch pin, then EXPERIMENT dropdown and `just experiments-audit` proof.
- Root starts `nohup scripts/glm-loop.sh` only after reviewed integration. Stop with viewer STOP/ABORT or `runs/dryruns/glm-four-hour-loop.STOP`; pause subsequent pairs with corresponding `.PAUSE` file.
- Recipe is loaded from the detached current-main checkout once before the pair; both arms use the materialized definition/presets, and `feature-recipe.json` retains donor SHA256, pair pin and effective definition. Source/main changes cannot reach the running pair. The next pair refreshes source and recipe. Canonical and GLM sampling are medium/4096 today; GLM target, limits and sampling stay fixed. Materialized control-base compatibility is revalidated, so future incompatible recipe sampling/limit changes halt rather than silently shorten the four-hour run.
- Actual exploratory dry-run seeded order is control then bundle, serial (eight hours maximum per pair); the static cook definition plan displays bundle then control because the driver regenerates the exploratory phase as `dry-run`. No randomization or confirmatory inference is claimed. Source moves between pairs make those distinct build strata.

GREEN receipts: CLI/runner targeted72/72; full agent3322/3322, viewer1616/1616, Python3702/3702. TypeScript coverage agent97.32 lines/93.04 branches/97.80 functions; viewer95.42/91.34/94.33. Python97.29/93.05/100, floor90. Full lint passes (242 Python files,109 mypy source files), build and pinned vendor check pass. The final viewer lint/build are repeated after the option validation guards. Private copied-venv command shebangs initially pointed at canonical and caused three path assertions; corrected within the private copy. One direct Python rehearsal omitted .env and failed ROM-dependent cases; final full test and Python coverage load .env and pass with no skips. Original failure logs retained in the review evidence; no test policy changed.

Fake shell rehearsal4/4: two real-git source pins/recipe revisions, old ledger preservation, outer viewer-abort, singleton/disk hold, failed viewer restart prevents launch. Production `runFixed` fake-clock rehearsal covers the actual single-MAC plan: exactly one active trial, schema-valid run logs, two four-hour presets and canonical effective feature maps; status/ledger/cohort/audit agree. Stop-after-first variant launches only one arm and marks status stopped. This complements the shell abort fixture, which tests no next pair rather than in-flight scheduling. Evidence under `runs/reviews/glm-four-hour-loop/gates/`.

The new `--feature-recipe` is exclusive to exploratory `dry-run`; normal approval/run remains unchanged. It validates both definitions/control bases and matching ROM, materializes exact recipe features/flags once, then writes donor digest + pin + effective definition. Four-hour definition SHA2560a96a2182a2182bc9cac178622a81fd90de428448ac93feac9fd8aa3ec8e251b. Direct injected-root `check` verifies the actual save SHA1 and control-base SHA256; ordinary `just fixed-run check` deliberately resolves canonical main, so root repeats it after integration.

Exploratory design overview: user chose four hours per trial to extend the previous two-hour GLM frontier; one pair is at most eight Mac-hours, repeated until operator stop. No fixed total N, power claim, causal feature attribution, incumbent promotion or cross-build pooling. All model/crash/stall outcomes retained; failed rounds are bounded by existing MAX_FAILS6. The forthcoming Pokémon-themed cross-model report's launch-protocol section is the readable overview; this worklog is its source protocol. Root is holding main atf671f35d4 for frozen review.

COMMIT: `test: pin current-main GLM recipe materialization contract` (88d8a518). COMMIT: `feat: prepare current-main four-hour GLM bundle control loops` (11352a9a).

Test-quality operand proof: strengthened the model fixture so every donor-owned field differs, then independently replaced controlBase/base/switches/offInBoth/onInBoth copying with the target value; each of five mutations failed. Independently removed missing-recipe-id and mismatched-ROM guards; each failed. Independently bypassed singleton, viewer-failure abort and GLM two-trial success count; each shell rehearsal failed. Restored all production bytes, CLI24/24 and shell4/4 green. Detailed unique logs and summaries under the review gate directory. Rehearsal retry budget is injected0/1 so a failed synthetic pair does not wait the production five-minute retry interval.

Coordinator clarification before review: retain GLM target/limits/sampling, copy only donor base.features (plus controlBase/switch/shared flag lists), then revalidate against donor control base. Future donor sampling or turn-limit incompatibility is a visible failure, not silent alteration of trial budget. Regression fixture verifies changed donor sampling/maxTurns cannot launch. External main advanced tocb29a325d during packet preparation; the accidental live-main-to-old-head diff is retained as packet-invalid-live-base.*, never dispatched. Syncing current main before final freeze with immutable base/head.

Resolved the only sync conflict by retaining both independent appended runner tests (GLM rehearsal and upstream progress-aware-cycle registration). GLM static snapshot updated to canonical77 switches; production rehearsal materializes canonical recipe rather than requiring future feature owners to copy GLM static flags.

Synced-tree gates: agent3337/3337, viewer1619/1619, Python3702/3702 (8658 total); full build/lint/vendor clean. Coverage agent97.24 lines/93.04 branches/97.76 functions, viewer95.42/91.33/94.33, Python97.29/93.05/100. The final future-donor fixture also changes target; it proves null target,20k turns and medium4096 cannot be silently replaced. Three final independent mutations (drop donor features, copy donor whole base, bypass effective control-base compatibility) each fail; restored CLI24/24. Immutable review base iscb29a325db376c9c9e3c1bf41c26fe830d3403aa; final packet generated only from that SHA to committed candidate SHA. Current canonical recipe77-switch snapshot SHA is recomputed in the launch receipt; earlier0a96 definition digest was the pre-sync snapshot.

Round1 cloud review of4e01b63d/diff749d8d5b: Claude LGTM, Grok LGTM, independent GPT P2 BLOCKING on actual-order protocol wording only. Deterministic dryRunDefinition confirms control→bundle, despite static cook plan bundle→control. Accepted factual correction and explicit production-rehearsal exact-order assertion; no run behavior changed. r1 artifacts and synthesis retained. Syncing externalmain016a2ffa before final review; new upstream changes are definition/test/worklog only, env unchanged, so the existing3702 Python/coverage proof remains byte-applicable while affectedTSgates repeat.
