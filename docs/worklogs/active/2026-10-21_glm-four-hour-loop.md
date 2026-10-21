# GLM four-hour exploratory bundle/control loops

Operator request 2026-10-21: start four-hour GLM loops, bundle versus control, taking current main before each loop. Root coordinator owns service swap and actual launch. This branch prepares the runner and reviewed definition; no gameplay or service changes here.

## Contract

One round is one serial bundle/control pair, four hours each, on the Mac lane (8099 model / 8077 game). Each pair freezes one main commit; the next pair picks current main. Materialize exactly the current `bundle-v-control` feature recipe (control base, base, switches, shared ON/OFF flags); no GLM-specific extra switch. Keep the existing hash-pinned fast-text MAIN_MENU start: this is New Game from a common menu save, not a literal power-on boot. GLM model/serving/lane remain separate from the feature recipe. No target stop; cap 14,400,000 ms, 20,000 turns; terminal failures retained. This is open-ended exploratory cooking, no fixed-N inference, p-value, promotion or single-switch attribution. One Mac executor costs up to eight Mac-hours per pair; user authorized continuing until stopped.

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
- Recipe is loaded from the detached current-main checkout once before the pair; both arms use the materialized definition/presets, and `feature-recipe.json` retains donor SHA256, pair pin and effective definition. Source/main changes cannot reach the running pair. The next pair refreshes source and recipe. Canonical and GLM sampling are medium/4096 today; exact recipe base sampling is copied deliberately.
- Actual seeded order is bundle then control, serial (eight hours maximum per pair). No randomization or confirmatory inference is claimed. Source moves between pairs make those distinct build strata.

GREEN receipts: CLI/runner targeted72/72; full agent3322/3322, viewer1616/1616, Python3702/3702. TypeScript coverage agent97.32 lines/93.04 branches/97.80 functions; viewer95.42/91.34/94.33. Python97.29/93.05/100, floor90. Full lint passes (242 Python files,109 mypy source files), build and pinned vendor check pass. The final viewer lint/build are repeated after the option validation guards. Private copied-venv command shebangs initially pointed at canonical and caused three path assertions; corrected within the private copy. One direct Python rehearsal omitted .env and failed ROM-dependent cases; final full test and Python coverage load .env and pass with no skips. Original failure logs retained in the review evidence; no test policy changed.

Fake shell rehearsal4/4: two real-git source pins/recipe revisions, old ledger preservation, outer viewer-abort, singleton/disk hold, failed viewer restart prevents launch. Production `runFixed` fake-clock rehearsal covers the actual single-MAC plan: exactly one active trial, schema-valid run logs, two four-hour presets and canonical effective feature maps; status/ledger/cohort/audit agree. Stop-after-first variant launches only one arm and marks status stopped. This complements the shell abort fixture, which tests no next pair rather than in-flight scheduling. Evidence under `runs/reviews/glm-four-hour-loop/gates/`.

The new `--feature-recipe` is exclusive to exploratory `dry-run`; normal approval/run remains unchanged. It validates both definitions/control bases and matching ROM, materializes exact recipe base/flags once, then writes donor digest + pin + effective definition. Four-hour definition SHA2560a96a2182a2182bc9cac178622a81fd90de428448ac93feac9fd8aa3ec8e251b. Direct injected-root `check` verifies the actual save SHA1 and control-base SHA256; ordinary `just fixed-run check` deliberately resolves canonical main, so root repeats it after integration.

Exploratory design overview: user chose four hours per trial to extend the previous two-hour GLM frontier; one pair is at most eight Mac-hours, repeated until operator stop. No fixed total N, power claim, causal feature attribution, incumbent promotion or cross-build pooling. All model/crash/stall outcomes retained; failed rounds are bounded by existing MAX_FAILS6. The forthcoming Pokémon-themed cross-model report's launch-protocol section is the readable overview; this worklog is its source protocol. Root is holding main atf671f35d4 for frozen review.

COMMIT: `test: pin current-main GLM recipe materialization contract` (88d8a518). COMMIT: `feat: prepare current-main four-hour GLM bundle control loops` (11352a9a).

Test-quality operand proof: strengthened the model fixture so every donor-owned field differs, then independently replaced controlBase/base/switches/offInBoth/onInBoth copying with the target value; each of five mutations failed. Independently removed missing-recipe-id and mismatched-ROM guards; each failed. Independently bypassed singleton, viewer-failure abort and GLM two-trial success count; each shell rehearsal failed. Restored all production bytes, CLI24/24 and shell4/4 green. Detailed unique logs and summaries under the review gate directory. Rehearsal retry budget is injected0/1 so a failed synthetic pair does not wait the production five-minute retry interval.
