# Running the starter decision diagnostic

This is a prompt-only diagnostic, separate from starter-selection tooling. The fixed definition is `experiments/fixed/starter-decision-salience.json`. The diagnostic is run only through its operator-approved fixed definition.

## Prepared design

- Same first-arrival Route101 checkpoint and broad play goal in every trial.
- Eight control and eight reminder trials; each GPU lane executes four of each in the frozen order.
- One difference: `starter-decision-salience-v1`. No comparative Pokémon facts, recommendation or new action tool.
- Maximum 300 seconds per trial; stop on verified `STARTER_CHOSEN`. Zero replacement reserve. Keep model errors, crashes and incomplete choices visible.
- Primary mechanism annotation: a truthful, concrete goal-related consequence supporting the final choice. Native completion and species are separate fields. Use the adjacent rubric and sixteen-row annotation CSV after all trials finish.

## Before measured execution

The implementation must be reviewed and landed on local main. The operator explicitly waived the Claude review lane on 2026-10-19; Grok and independent GPT/Codex review and deterministic gates still apply. Rebuild/restart the main viewer before launching a newer source pin; keep current campaigns undisturbed. The decision to launch belongs to the operator, not the preparation agent.

When ready to launch, follow `.claude/skills/fixed-run-launch/SKILL.md`: check clean main and source dependencies, lane availability, live serving fingerprint, ROM and checkpoint hash, then run:

```sh
just fixed-run check starter-decision-salience
```

This command checks only the definition, frozen order, control-base bytes and save hash. It does not launch anything. A serving mismatch must be resolved before launch; model path, build, context and slot count are pinned in the definition. Changing the definition requires a fresh check and the operator's go-ahead.

The operator then says to start the runs, and the launch follows the normal fixed-run workflow (`just fixed-run run starter-decision-salience`; there is no approve step since 2026-10-28). Do not run `dry-run` as a preparation shortcut: it makes real model calls and requires launch authorization too. The sixteen-slot rehearsal in unit tests uses fake data and no inference.

## Evidence after execution

Require all sixteen planned slots to have terminal outcomes. Match each neutral code T01–T16 to its frozen plan slot and actual run id; preserve the arm key separately during annotation when feasible. Read the full pre-commit thinking, paired observations and native acquisition evidence. Report all opportunity, failure, missing-reason and unsupported-claim cases alongside supported reasoning.

The runner's generic milestone summary is technical completion only. This diagnostic has no primary confirmatory phase and must not be represented as an automatically powered judgment score, a gym comparison or a winner. Review all claimed strategic successes and intention/execution discrepancies independently.

## Preparation evidence

Two isolated manual zero-inference reloads exercised the production tools with the switch OFF and ON. Both began at native map [0,16], position (11,19), with an empty party; both reached the Torchic-default menu, moved to Treecko, opened and declined confirmation, moved to Mudkip, and acquired Mudkip. This deliberate manual choice only verifies control execution.

For both recordings the observed `STARTER_CHOSEN` milestone is seq170, supported by native state169. The reminder appears only on ready selection observations in the ON recording and disappears during confirmation and after acquisition. Native frames and raw RAM remain under the isolated worktree's `runs/starter-decision-probe/qualification/`; receipt `qualification-receipt.json` names the two manual runs. These are qualification probes, excluded from autonomous outcomes, and do not establish treatment benefit.
