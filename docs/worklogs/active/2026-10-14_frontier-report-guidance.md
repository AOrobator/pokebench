# Frontier graph reporting guidance

Andrew2026-10-14 explicitly requests preserving the successful line graphs in reporting skills: persistent human baseline and valid agent frontier, optional other runs/cohorts, clear progress over time. Also asks separate sidechat implementation and subagent stats landing check; those own UI code separately. This docs-only branch owns reporting skill/worklog and best-run/story audit report; no game/harness/UI code.

- [x] Add concise default line-chart procedure with early/full-range panels, native milestone X and cumulative active elapsed Y, human and actual best-run references always visible, optional cohorts, clear no-completion gaps and counts.
- [ ] Validate skill, inspect diff, record approval/gates appropriate to docs, coordinate landing around other agents/main sequencer.
- [ ] Report exact best-observed model/config/native/action history and source-qualified early story steps, separate observations from strategic inference.

Sidechat 00000000-0000-4000-8000-852f145f4746 owns persistent frontierUI; stats_landing_check owns existing workbench integration; navigation_evidence_experiment owns fact-ledger toggle +8serialThinkFastOFFON runs30m/1500turns/no milestone cap. Preserve current main WIP and any active sequencer.

Skill revised with explicit approved cumulative native-milestone line format, persistent human/actual-best anchors, optional cohort overlays, early/full-range panels, no horizontal scroll, reliable missing/censored labels and bounded large-log reduction. This is the operator-requested PokeBench reporting procedure, not an amendment to agent principles. Stats audit found existing workbench unmerged/unreviewed f4d75fe and64MiB raw bound that rejects241MiB human1848; sidechat notified to solve through streaming/index rather than raisingallocation. Main sequencer metadata datesOct11, no activegitoperation, many subsequentcommits; preservebackup and quit stale metadata only, never abort/reset source.

Skill quick_validate and git diff --check pass. Exact source audit correction: bestdea1 preset-astar has bounded-navigationON/world-destinationsOFF (A*-only), not combined; nav experiment and frontier sidechat corrected before freeze. Best-run serving receipt identifiesQwen3.6-35B-A3B-UD-Q4_K_M,64kcontext,medium/4096. Native/action trace audit retains source event IDs and illustrates destination/coordinate confusion rather than claiming a proven better strategy. Docs changes will join the navigation branch's frozen review packet before landing; no separate unreviewedmainmutation.
