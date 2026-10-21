# GLM four-hour exploratory bundle/control loops

Operator request 2026-10-21: start four-hour GLM loops, bundle versus control, taking current main before each loop. Root coordinator owns service swap and actual launch. This branch prepares the runner and reviewed definition; no gameplay or service changes here.

## Contract

One round is one serial bundle/control pair, four hours each, on the Mac lane (8099 model / 8077 game). Each pair freezes one main commit; the next pair picks current main. Materialize exactly the current `bundle-v-control` feature recipe (control base, base, switches, shared ON/OFF flags); no GLM-specific extra switch. Keep the existing hash-pinned fast-text MAIN_MENU start: this is New Game from a common menu save, not a literal power-on boot. GLM model/serving/lane remain separate from the feature recipe. No target stop; cap 14,400,000 ms, 20,000 turns; terminal failures retained. This is open-ended exploratory cooking, no fixed-N inference, p-value, promotion or single-switch attribution. One Mac executor costs up to eight Mac-hours per pair; user authorized continuing until stopped.

The loop uses existing isolated fixed-run code and preserves ledgers, native recordings and visible experiment metadata. Stop/abort applies to the loop. No frame pruning; high disk usage holds. Keep unrelated Qwen GPU lanes and their services untouched. No service stop, launch or merge by this subagent.

## Work

- [x] RED: exact current recipe materialization and preserved GLM launch contract tests.
- [ ] GREEN: optional dry-run recipe seam, four-hour definition, parameterized existing loop and GLM wrapper.
- [ ] Fake-data rehearsal: serial pair, latest-main next pair, singleton, stop propagation and disk hold.
- [ ] Deterministic gates and three-lane cloud review of frozen packet.
- [ ] Coordinator integration / viewer / actual launch proof (root-owned).

## Scope

Production path set: `packages/viewer/src/fixed-cli.ts`, `packages/viewer/src/fixed-design.ts`, `scripts/whole-map-loop.sh`, new `scripts/glm-loop.sh`, new `experiments/fixed/glm53-flash-4h.json`. Tests and this worklog support those paths. No new harness feature, game observation, model tool or agent policy. Non-goals: service management, cross-model report, skill authoring, unrelated loop refactors, pruning, queue approval.

## Progress

Read live main f671f35d4342ed5b2cebcbe7179af5c3ccf65203 and source definitions. Existing GLM 2h recipe is stale relative to canonical bundle; dynamic materialization avoids copying drift. Existing dry-run path already produces one trial per arm per lane and tags the experiment for viewer discovery. Normal fixed-run approval path is unchanged.

RED receipt: two new CLI contract tests fail before implementation (ignored recipe and missing receipt); existing 22 CLI tests pass. Infrastructure rehearsal scaffolding follows implementation.
