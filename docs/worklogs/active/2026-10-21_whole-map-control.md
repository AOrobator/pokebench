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
  - Bundle-only switches are now the fixes registered since fd95: `menu-refusal-recovery-v1` (inert at 6fbce332), `gym-door-label-v1`, `mart-stock-readout-v1` and `caught-dex-input-v1`.
  - Seed and plan are unchanged. The loop picks this up at the first round that starts after the merge.

## Checks

- [x] Definition and control-base check (fixed-design `definitionProblems` + `controlBaseProblems`) on this branch: none
- [x] Control arm equals fd95's recorded features except the heal gate
- [x] `just test`, `just lint`: TS 3292 + 1609 passed, Python 3647 passed, lint clean (after syncing main d00cded5)
- [x] `just fixed-run check whole-map-pair-2h` on main after the merge: definition sha256 1f30902b…, control base whole-map-bundle-fd95 (c66c2eb4…) matches
- [x] Claude (subagent), Grok (cursor-grok-4.5-high) and Codex (gpt-5.6-sol) each VERDICT: LGTM on frozen packet d00cded5b..607954b29 (diff sha256 2ee1c85c…)
- [x] Landed fast-forward: main = 607954b29 (11:12 AM New York). Loop round 3 launched at 11:07 AM on d00cded5b (old definition) and runs two pairs to about 3:08 PM; round 4, about 3:08 PM, is the first on the new control.

## Rename to bundle-v-control-2h (the operator 2026-10-21 11:36 AM NY)
Whole-map is now in control, so the loop's experiment is plain bundle vs control. experiments/fixed/bundle-v-control-2h.json = main's whole-map-pair-2h.json with only id and title changed (title 'Bundle vs control (2 hour pair)'); whole-map-pair-2h.json stays as is, so past runs and labels keep their names. The viewer invariant tests now cover bundle-v-control-2h too. Launcher default (scripts/whole-map-loop.sh and Codex's latest_main_loop.py) is left to the Codex launcher hand-over on codex/latest-main-before-run, so the two branches do not collide.
- Gates: fixed-run check OK; agent 3322, viewer 1612 and pytest pass. Reviews: Claude subagent LGTM; Grok (cursor-grok-4.5-high) found no bugs in the definition, ids or dropdown labels; its one finding was a stale-base packet artifact (the diff vs a moved main showed another worklog's lines), and after rebasing the branch touches only this worklog, the new JSON and the two test lists.
- Resynced on main af70fa34 (progress-aware-cycles-v1 in the bundle): bundle-v-control-2h re-copied from whole-map-pair-2h (only id/title differ); the new progress-aware-cycles test list covers it too.
- Round 3 on 8b290e4b (packet runs/reviews/bundle-v-control-2h/r3): Claude subagent LGTM, Grok cursor-grok-4.5-high LGTM. Gates: fixed-run check OK, agent 3337, viewer 1615, pytest 3702 pass.
- LANDED on main (ff-only, landing-board turn 12:12 PM NY) after a docs-only resync onto 8e279f85.
