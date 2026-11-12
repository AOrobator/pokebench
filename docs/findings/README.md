# findings

This folder holds findings: written evidence about how Pokémon Emerald and the harness actually behave, kept so a later change can rely on it instead of re-deriving it.

A finding is usually written while building or auditing one part of the harness. Most of them pin their reference, the [pret/pokeemerald](https://github.com/pret/pokeemerald) decompilation at a fixed revision and the US Emerald ROM by SHA-1, then name the game source that owns a piece of state, the PokeBench code that reads it, and what was proved (against the ROM, recorded runs or synthetic tests) and what was not. Others report on recorded runs or on reviews of a combined change.

Files with a date prefix (`YYYY-MM-DD_`) record one piece of work at that date. Undated files cover a topic and were extended as it grew. They describe what was true when written; run IDs and `runs/` paths in them refer to local recordings that are not in this repository.

## Game memory, menus and battles

How a readout is built from the game's own memory, checked against the game source:

- [2026-10-14_pokemon-decoding.md](2026-10-14_pokemon-decoding.md), [2026-10-14_battle-state.md](2026-10-14_battle-state.md), [battle-choices.md](battle-choices.md), [2026-10-15_battle-details-v2.md](2026-10-15_battle-details-v2.md), [2026-10-16_battle-text.md](2026-10-16_battle-text.md)
- Menu and input owners: [2026-10-14_menu-owner-coverage.md](2026-10-14_menu-owner-coverage.md), [2026-10-14_rare-menu-owners.md](2026-10-14_rare-menu-owners.md), [2026-10-14_legacy-menu-owners.md](2026-10-14_legacy-menu-owners.md), [2026-10-14_decoration-hof-owners.md](2026-10-14_decoration-hof-owners.md), [2026-10-14_pokemon-lifecycle-and-field-npc-owners.md](2026-10-14_pokemon-lifecycle-and-field-npc-owners.md), [2026-10-14_frontier-and-battle-controller-coverage.md](2026-10-14_frontier-and-battle-controller-coverage.md)
- [2026-10-14_running-permission.md](2026-10-14_running-permission.md): when the game allows running.
- [game-state.md](game-state.md) and [continual-harness.md](continual-harness.md): errors in the vendored game server's readout and the PokeBench-owned workarounds.

## Timing

When an observation is safe to take after a press, a screen fade or a warp:

- [2026-10-15_fade-settle.md](2026-10-15_fade-settle.md), [2026-10-16_warp-arrival-settle.md](2026-10-16_warp-arrival-settle.md), [2026-10-16_battle-text-proof.md](2026-10-16_battle-text-proof.md) (real-ROM receipts for battle-text auto-advance)

## Story milestones and objectives

Which game flags, variables and scripts mark story progress, and how progress is ranked:

- [story-milestones.md](story-milestones.md) (through Rustboro Gym), [all-gym-story-milestones.md](all-gym-story-milestones.md), [campaign-milestones.md](campaign-milestones.md), [roxanne-first-interaction.md](roxanne-first-interaction.md), [whole-game-story-checkpoints.md](whole-game-story-checkpoints.md)
- [objectives.md](objectives.md): evidence for the objective-tracking tools.
- [objective-graph-rescore.md](objective-graph-rescore.md): every recorded run re-scored with the objective graph from [../designs/objective-graph-v1.md](../designs/objective-graph-v1.md). Generated; re-run its script rather than editing it.

## World observation

- [world-observability.md](world-observability.md): evidence for the player position, the local map grid, interaction targets and checking what a press actually did.
- [terrain-audit-2026-10-23.html](terrain-audit-2026-10-23.html) and its data [terrain-audit-2026-10-23.json](terrain-audit-2026-10-23.json): an inventory of tile behaviors across the 518 default map headers in the ROM. Not proof of reachability.

## Runs and the human baseline

- [2026-10-12-run-report.md](2026-10-12-run-report.md) and [2026-10-12_resumed-interface-experiment.md](2026-10-12_resumed-interface-experiment.md): early model runs and a small prompting comparison. No run reached the first gym.
- [2026-10-14_human-first-gym-strategy.md](2026-10-14_human-first-gym-strategy.md) and [2026-10-14_human-run-harness-audit.md](2026-10-14_human-run-harness-audit.md): the operator's recorded first-gym run, the strategy behind it, and the harness gaps it exposed.

## Integration reviews

- [all-work-integration-review.md](all-work-integration-review.md) and [story-observations-review.md](story-observations-review.md): reviews of combined feature sets before they landed, with their frozen source identity.

## Guard deletion logs

The project requires that every guard a test claims to protect is deleted once to watch the test fail. These two folders keep the logs of those deletions, one file per deleted piece of wiring:

- [2026-10-16_blocked-exit-and-loss-wiring/](2026-10-16_blocked-exit-and-loss-wiring/) (10 logs)
- [2026-10-16_people-id-cards-guards/](2026-10-16_people-id-cards-guards/) (4 logs)
