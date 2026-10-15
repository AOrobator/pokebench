# Winner gate

## Problem Statement
Operator (2026-10-15, Experiment queue thread): "we'll need to run the winners of the current experiment from start before we run any new experiment", then: "should it actually be declared a winner before we run the full run from boot? ... maybe test the winner, and then if it's like a multivariant, then the runner-up, just to see how it actually does on the full boot, on the full run."

Today (main 46b4788):
- A finished queue experiment writes `runs/experiments/<id>/result.json` with a recommendation and nothing else (INV-Q7: no automatic promotion). The next approved experiment starts at once with the incumbent written in its own file.
- The Think Fast 2×2 (`factorial-2x2-think-fast`, `experiments/full-map-navigation.json` `externalCohort`) is a four-arm cohort run by `runs/launch-receipts/navigation-factorial-think-fast-n4/driver.py` from the CLOCK_SET checkpoint, then the unattended chain `runs/launch-receipts/factorial-chain/run-all-2.sh` (hint batch on the best arm, Qwen 3.8 2×2, Qwen hint batch). The queue never grades it.
- The queue autorun and the cohort drivers share the lease `runs/.naming-gameplay.lock`. Between two chain steps the lease is free for a few seconds, and the viewer ticks every 5 s, so today an approved experiment can start in the middle of the chain. The gate closes that gap: while a nomination is unsettled, no new experiment starts.

## Spec (operator-approved direction; open choices marked)
1. **Nominate, don't promote.** A finished experiment nominates up to three finalists (operator 2026-10-15: "I don't think it would make sense to have more than a total of three finalists"): the best arm, plus up to two runners-up when the experiment has more than two arms (the 2×2 can nominate all three non-control arms). An arm that does not beat the incumbent arm on primary-milestone reach is dropped. Nothing changes the incumbent yet. A two-arm experiment whose candidate is not preferred nominates nothing and is recorded as no change.
2. **Finals from boot.** Each finalist and the current incumbent run from boot with equal limits, alternating (ABBA for one finalist, Williams-balanced order for two or three), N runs each. N = **8** (operator 2026-10-15: four "would get less information and less certainty"). Limit: a fixed **45 minutes** wall clock per run, no target milestone (operator 2026-10-15: "there's no guarantee that it'll actually reach a particular milestone ... we'll give the full run 45 minutes"). The turn cap is raised so the wall clock is what ends a run.
3. **Declare.** A finalist passes when, on the finals, its median furthest native milestone is further than the incumbent's, or the same with a median turn count to it at least `speedMarginPercent` lower, and no earlier milestone the incumbent reached in k runs is reached in fewer than k − `completionTolerance` runs. The best passing finalist wins (best first, then runner-up). None pass: the incumbent stays, the experiment is recorded inconclusive.
4. **Only a declared winner changes anything.** Its switches become the incumbent for every queued experiment that has not started; approvals carry over. Its finals are the best recorded boot runs (input for the later checkpoint-start step, not built here). New experiments wait until the nomination is settled.

Defaults picked where the spec forks (say so in the reply):
- Finals run without a second approval: the operator asked for them as a precondition of anything new, and WITHDRAW on the finals card stops them before the next run, like an experiment.
- A queued experiment whose `changedFeature` the winner already sets becomes `superseded` (held, shown on its card) rather than silently flipping its arms.
- An experiment that has already launched trials keeps the incumbent it started with (recorded per launch), like the build commit.

## Constraints
- Own worktree `/private/tmp/pokebench-winner-gate` on `claude/winner-gate`. Local only, no push. Ask before merging; after merging run `just viewer-main` (restarts 8790 on main).
- Do not disturb the running 2×2 driver (pid 89598), the chain (pid 99469) or the frozen worktrees they use. Nothing here edits `runs/launch-receipts/**`; the gate only reads them.
- Must be merged before the chain finishes (it holds the lease until then), so the queue cannot start named-warp-destinations ahead of the 2×2 finals.
- INV-Q7 changes in a narrow, operator-requested way: promotion happens only through a declared finals win, never from a screening result.
- Behavior switch: the gate is a queue policy, not a harness switch (it changes which preset runs, not what the model sees). It ships behind `POKEBENCH_WINNER_GATE` (default on); `off` reproduces today's queue exactly, so it can be compared and rolled back.
- Reviewers: Claude CLI and Grok (Cursor), per the coordinator brief.
- Coverage floor 90% lines/branches/functions, both stacks.

## Architecture
**Records (gitignored, `runs/experiments/<id>/`):**
- `nomination.json`: `{experiment, source:"queue"|"cohort", incumbentPreset, finalists:[{arm, preset, rank, evidence}], decidedAt}` or `finalists:[]` with the reason.
- `finals.jsonl`: append-only launch/outcome/launcher_error ledger like `trials.jsonl`, arm ids `incumbent|finalist-1|finalist-2|finalist-3`.
- `finals-result.json`: per-arm furthest/turn medians, pass/fail per finalist with reasons, `winner` or `inconclusive`.
- `runs/experiments/incumbent.jsonl`: append-only promotions `{from, winnerArm, features, at, finals}`. The latest entry is the incumbent overlay.

**Code:**
- `packages/agent/src/experiment-gate.ts` (pure): `nominateFromResult`, `rankCohortArms` (port of `pick_best.py`'s predeclared ranking), `finalsOrder`, `decideFinals`, `applyIncumbent(experiment, promotion)`.
- `packages/viewer/src/experiment-store.ts`: gate state per experiment (`nominated → finals running → declared | inconclusive`), queue-level `blockedBy`, superseded state.
- `packages/viewer/src/experiment-runner.ts`: `nextExperiment` returns unsettled finals first and nothing new while a nomination is open; a finals step reuses the trial loop with boot start and the finals limits; launch entries record the promotion id.
- External cohorts: when the cohort's `queue.json` says done, the store ranks its arms from its `trials.jsonl` and presets and writes the nomination (the chain is not modified).
- `packages/viewer/src/queue-view.ts`: a GATE card at the top of the queue (finalists, pips, verdict, current incumbent and where it came from).
- Skills: experiment-queue, pokebench-patch-evaluation (INV-Q7 wording). Explainer via feature-explainer.

## Invariants
- INV-G1: No new experiment launches while any nomination is unsettled. Test: runner with an open nomination picks finals or nothing.
- INV-G2: Finals arms get identical limits and start from boot. Test: launched presets.
- INV-G3: Only `decideFinals` returning a winner appends to `incumbent.jsonl`. Test: inconclusive and empty nominations leave it untouched.
- INV-G4: Approvals of unstarted queued experiments stay valid across a promotion; started experiments keep their recorded incumbent. Test.
- INV-G5: `POKEBENCH_WINNER_GATE=off` gives today's `nextExperiment` and arms. Test.
- INV-G6: Nothing writes under `runs/launch-receipts/`. Test with a read-only fixture.

## Milestones
- [x] M0 Spec settled by the operator: 8 runs each, 45 min, up to three finalists.
- [ ] M1 Pure gate logic: nomination (queue result + cohort ranking), finals order, decision rule, incumbent overlay. RED then GREEN.
- [ ] M2 Store and runner: gate states, finals execution, blocking, promotion with approval carry-over, superseded, switch off path. RED then GREEN.
- [ ] M3 Viewer GATE card, skills, explainer.
- [ ] M4 Coverage ≥90, lint, Claude + Grok review clean; ask to merge; `just viewer-main`.

## Log
- 2026-10-15: worklog drafted; holding implementation until the two open choices are settled.
- 2026-10-15: operator set finals to a fixed 45 minutes and up to three finalists; run count still open.
- 2026-10-15: run count settled at 8; building. Worst case (three finalists) is 32 finals runs × 45 min ≈ 24 h.
