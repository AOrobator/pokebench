# Read-only current-run harness configuration

The operator requested a read-only harness configuration page in PokéNav for the current run. Show the selected live/replayed run’s recorded run_start, distinct from editable next-run defaults. Include source/preset/start, model/sampling/budgets/tools, explicit recorded switch values and enabled features. Never infer historical OFF values or serving settings from current defaults. No writes, gameplay or benchmark configuration changes. Existing ignored/active worktrees and frozen navigation cohort remain untouched.

Validation plan: mounted viewer regression for selected-run identity/read-only behavior, missing metadata and HTML escaping; viewer coverage/lint/build and independent review. Deploy frontend assets only without restarting the running game/driver. Add tracked local explainer and exact served/browser proof.
