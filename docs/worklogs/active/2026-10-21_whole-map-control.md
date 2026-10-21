# Whole-map control promotion (2026-10-21)

Operator decision, the operator, 2026-10-21 10:03 AM New York: "Let's make bundle plus whole map the new control. And hold out story battle heal gate." Confirmed in thread 10:20 AM ("yes").

Evidence: overnight run analysis, runs/reports/run-analysis/2026-10-21_overnight-holistic/index.html. Scored rounds went bundle 3, control 1. Rustboro by 120 min: 5/5 bundle against 1/5 control. The heal gate cost about 38 min across three runs and prevented no loss.

## Change

- **New control base** `experiments/fixed/control-bases/whole-map-bundle-fd95.json` (id `whole-map-bundle-fd95`).
  - It is the exact `evaluation.features` recorded at run_start in 2026-10-21T04-27-11_qwen36-gpu1_fd95. 2026-10-21T06-28-18_qwen36-gpu0_1331 recorded the identical list.
  - Those are the 2h bundle arm at 6fbce332: 66 bundle switches plus full-map-navigation-v1.
  - `story-battle-heal-gate-v1` is set false. Switches registered after fd95 are false.
- **`experiments/fixed/whole-map-pair-2h.json`:**
  - Base features are the new control base.
  - `story-battle-heal-gate-v1` is added to offInBoth.
  - Bundle-only switches are now the fixes registered since fd95: `menu-refusal-recovery-v1` (inert at 6fbce332), `gym-door-label-v1` and `mart-stock-readout-v1`.
  - Seed and plan are unchanged. The loop picks this up at the first round that starts after the merge.

## Checks

- [ ] Definition and control-base check (fixed-design `definitionProblems` + `controlBaseProblems`) on this branch: none
- [ ] Control arm equals fd95's recorded features except the heal gate
- [ ] `just test`, `just lint`
- [ ] `just fixed-run check whole-map-pair-2h` on main after the merge
- [ ] Claude and Grok review LGTM on the frozen packet
- [ ] Merge SHA and the loop round that first runs it
