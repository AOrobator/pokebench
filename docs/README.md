# docs

This folder holds PokeBench's written documentation: how to run it, what it has measured, how the harness reads the game, and the records of how each part was built.

## Read first

- [connect-a-model.md](connect-a-model.md): how a run finds its model endpoint (local server or gateway) and learns the model's limits. PokeBench has no built-in model.
- [results.md](results.md): the results ledger. Each row is read from a run's own recording, with its harness commit, preset and evidence.
- [features.md](features.md): every harness feature switch, its default and whether it was on in run 67d7. Generated from the agent source.
- [explainers/README.md](explainers/README.md): the index of explainers, one per feature switch, as Markdown twins of the HTML pages.

## Other top-level files

- [raw-ram.md](raw-ram.md): the full-memory archive written on every observation, its format and what it contains.
- [human-play.md](human-play.md): starting an isolated, recorded server for a human player.
- [agent-principles.md](agent-principles.md): the principles the project's change reviews are scored against.
- [current-run-snapshots-operations.md](current-run-snapshots-operations.md): operating the derived store the viewer reads for current run state.

## Folders

- [benchmarking/](benchmarking/): the evaluation rubric (version 0.1), the grading protocol and the history of the decisions behind them. A specification, not an implemented grader.
- [curriculum/](curriculum/): game-knowledge material for the heavily assisted Rayquaza lane, including guides, deviation audits and notes on a human speedrun route. Start at [curriculum/README.md](curriculum/README.md).
- [explainers/](explainers/): one self-contained HTML page per feature switch, with a Markdown twin and SVG diagrams under `md/`.
- [experiments/](experiments/): HTML overviews of designed experiments (arms, start, outcome, power, run rules), plus a few result and rubric files. See [experiments/README.md](experiments/README.md).
- [findings/](findings/): evidence records about the game and the harness, mostly how a readout was verified against the game source and ROM. See [findings/README.md](findings/README.md).
- [designs/](designs/): design documents for measurement and comparison contracts. See [designs/README.md](designs/README.md).
- [design/](design/): visual design: the shared stylesheet for HTML pages, the approved trainer-card reference, and the signed-off viewer design.
- [worklogs/](worklogs/): the milestone-by-milestone record of every feature built. See [worklogs/README.md](worklogs/README.md).
- [reports/](reports/): one-off audit reports.
- [data/](data/): run 67d7's recorded feature settings and preset, as JSON.
- [images/](images/): the README charts, and under `images/charts/` their input data and an account of where each dollar figure comes from ([COSTS.md](images/charts/COSTS.md)).

Many documents record what was true when they were written. Older ones can describe workflows the project has since retired; the worklogs and the root [CLAUDE.md](../CLAUDE.md) describe the current process.
