---
name: pokebench-experiment-design
description: "Use when designing, sizing or writing up a PokeBench experiment before it is driven as a cohort, or when the operator asks how many runs or GPU-hours a question needs. Picks the tier, a checkpoint start, the outcome, a power-sized fixed N within the operator's GPU-hour budget, and writes an HTML overview."
---

# PokeBench experiment design

Turn a harness question into a design that can answer it at a known cost, and write it up as a page the operator can read at a glance. This skill owns the design. `pokebench-patch-evaluation` owns readiness and how results are reported. Fixed-run tooling executes operator-approved plans. `pokebench-review` critiques a finished design or result.

## Standing operator decisions (2026-10-15)

- **Rely on checkpoints heavily.** Start runs from a validated save just before the point where the change can act, unless the question is about the whole route from boot.
- **Fixed N, one analysis.** Run every planned trial, analyze once at the end. No interim looks, no early stops, no ejects of the experiment. Trials end only by the predeclared ways in step 7.
- **The operator sets a GPU-hour budget.** Design to it. If the budget cannot detect the effect that matters, say so and give the effect it can detect; never shrink the question silently.
- **The trial cap comes from data:** the observed times of the primary milestone in the latest comparable cohort.

## 1. Name the tier

| Tier | Question | Typical shape | What it may claim |
|---|---|---|---|
| **Correctness** | Is the readout, guard or grader wrong? | A failing test from the recorded evidence, then the fix | Bug fixed. Never a cohort. |
| **Diagnostic** | Does the change alter the decision at the moment it matters? | Decision-point probes, or a checkpoint segment of 4–8 per arm | Mechanism evidence. No promotion. |
| **Screen** | Is this worth a real test? | Eight per arm (one switch), or a factorial cohort | Nominate only. Report direction, intervals and power; never "significant". |
| **Confirm** | Does it move the primary outcome? | Two arms, power-sized fixed N, fresh trials, frozen build | The predeclared claim at the predeclared alpha. |

Rules:
- Deterministic bugs go to the correctness tier. A cohort cannot show a readout is right.
- **Decision-point probes** re-send a recorded turn's context with the switch on and off, and score the decision. They cost seconds per sample, so hundreds per switch are cheap. They only work for switches that change what the model reads, not for switches that change inputs or game state (auto-advance, routing). Treat them as their own tier: a probe shows the decision moved, not that the run gets further.
- **Two arms for power, a factorial for screening.** In a factorial, each switch's comparison splits the runs in half, and a correction across many switches cuts power further. The bundle-versus-control estimate is much noisier than a plain two-arm comparison of the same size. Use the factorial to rank candidates, and a two-arm test to confirm one. A factorial needs the operator’s approval, and every nominated switch is then confirmed alone (PB5).

## 2. State the mechanism with evidence

Write one sentence each:
- **Failure:** the recorded failure the change targets, with run id and event seq. Use `pokebench-trace-forensics` to find and classify it.
- **Change:** what the model sees or can do differently, and the switch ids.
- **Activation milestone:** the first point where the change can matter (`activationMilestone`).
- **Expected behavior:** what a trace would show if the mechanism works. This is what the diagnostic tier checks before anyone pays for the confirm tier.

If you cannot point to a recorded failure the change addresses, the design is a guess. Say so in the overview.

## 3. Choose the start: checkpoint first

Default to a checkpoint start:
- **Same save for every arm**, captured from a recorded run with `POKEBENCH_CHECKPOINT_AT=<native milestone>`, written to `runs/<id>/checkpoints/`. The capture milestone becomes `present_at_start` on reload and earns nothing, so name one strictly before the activation milestone.
- **Close before the activation milestone**, but before any decision the change affects. A save after the critical decision measures nothing.
- **Pinned by hash.** Presets take `start: {kind: "save_state", path, sha1}`, and the run refuses a save whose SHA-1 differs. Record the source run, milestone and SHA-1 in the overview.
- **Only progress after the start counts.** Milestones `present_at_start` never count toward the outcome.
- **Exposure:** checkpoints buy far more trials of the segment that matters per GPU-hour. Use them for the diagnostic, screen and confirm tiers alike when the question is about that segment.
- **Conditional claims.** A checkpoint result is conditional on reaching that state. A claim about the full run, and any promotion, still needs boot evidence (an operator-approved boot comparison). Say which claim the design supports.

Use a boot start when the question is about the whole route, when the change acts before the first stable save point, or when the change alters what the run would carry into the save.

Plumbing limits today:
- Use fixed-run definitions under `experiments/fixed/` for boot or validated checkpoint starts.
- Every trial carries `evaluation.experiment` (the driver sets `POKEBENCH_EXPERIMENT`) for durable result provenance. The viewer presents runs by model, configuration and run ID; there is no experiment selector.

Readiness changes meaning for a checkpoint start. The question is whether the save exists, sits before the activation milestone and loads reliably on the current build, not whether boot runs reach the activation milestone. Boot comparisons keep the `pokebench-patch-evaluation` readiness rule.

## 4. Fix the outcome before any run

- **Primary:** one binary outcome. Did the run reach `<native milestone>` within the cap? The decision is a two-sided exact Fisher test at 0.05. A p-value under 0.10 may be mentioned as descriptive, never as the decision.
- **Secondary**, predeclared:
  - Time to the primary milestone. Runs that never reach it are censored at the cap and rank after every run that did. Report the median as "not reached" when under half the arm reached it; never take medians over survivors only.
  - Furthest main-story milestone, ranked by depth first, then time.
  - An area-under-the-curve score only at a fixed horizon, as a secondary, never as the headline.
- **Exploratory:** anything else, labeled so. It never enters the decision.
- **No outcome switching after the data.** If the primary was wrong, the next experiment fixes it.

## 5. Set the cap from the data

- Read the times of the primary milestone in the latest comparable cohort: same model lane, same start, same build family.
- Report the largest observed time and how many runs it comes from. With k runs that reached the milestone, the chance the next reaching run lands after the largest is about 1 in k+1. If that cohort had its own cap, its largest time is censored too, so leave more headroom.
- A cap a little above the largest observed time costs little power and buys many more runs per hour. The cap applies equally to every arm, so a change that makes the model slower is fairly charged for it.
- If the operator wants to see how far a configuration goes left alone, add a separate "let it cook" set with a long cap. Label it exploratory. It never enters the p-value.

## 6. Size it with power.py, inside the budget

Inputs, each with its source:
- **Baseline rate:** the control arm's rate on the primary milestone in the latest comparable cohort, as k/n.
- **Smallest lift worth detecting:** an operator judgment. Offer two or three values.
- **Alpha and target power:** 0.05 and 80% by default, 90% for a headline claim.
- **Cap, executors and outage rate:** `--failure-rate` is the share of launches that never begin (no `run_start`), which the runner re-runs (step 7). Every trial that began is an outcome whatever ended it, crashes and gateway errors included (the operator 2026-10-27).
- **The operator's GPU-hour budget.**

```bash
python3 .claude/skills/pokebench-experiment-design/power.py plan \
  --control 0.5 --lifts 0.15,0.2,0.25,0.3 --cap-min 15 --executors 2 \
  --failure-rate 0.15 --budget-gpu-hours 48 --svg /tmp/power.svg
python3 .claude/skills/pokebench-experiment-design/power.py observed 3/8 5/8   # p and Newcombe interval
```

How `power.py` works:
- Power is exact: it is the chance that a two-sided Fisher test is significant in the variant's favor.
- Exact power saw-tooths as N grows. The tool reports the first crossing, and plans on the smallest N whose power stays at the target for 10 consecutive N.
- GPU-hours are an upper bound on trial time: every launched trial, re-runs included, runs to the cap. Boot and save-load overhead are not counted. The budget line is an expectation; outages can push spend over it.
- Wall hours divide GPU-hours by the number of executors.
- `power_test.py` cross-checks it against scipy: `uv run --with scipy --with pytest pytest .claude/skills/pokebench-experiment-design/power_test.py`.

Read the output plainly:
- What lift the budget can detect at the target power.
- What N the smallest lift worth detecting would need.
- What an 8-per-arm screen can and cannot show. At a 37.5% baseline, a real +25-point lift comes out significant about 9% of the time.

Before buying more runs, buy cheaper power:
- **Remove noise first.** Fix infrastructure failures and model errors before launch.
- **Start where the change acts.** Checkpoints spend each trial on the segment that matters.
- **Pick the outcome closest to the mechanism.** That is usually the next milestone after activation, not the furthest one.

One primary per comparison. Several variants against one control form a Holm family: name it, and size with `--comparisons m`, which plans at alpha/m (the strictest Holm step).

## 7. Run rules

Write these into the design, the driver and the overview:

- **What ends a trial.** Declare every path, and hold each equal across arms unless it is the thing tested:
  - the run's target milestone (`target`; reaching it stops the run as `milestone`);
  - the wall cap (`maxWallMs`), and `maxTurns`, which ends a run as `budget`. Set `maxTurns` high enough not to bind, or declare it;
  - the loop guard: with `deterministic-loop-guard-v1` enforced, a loop ends the run as `stuck`;
  - the stall stop (`milestone-stall-stop-v1`, which ends a run as `stalled`): off unless it is tested;
  - `crash`, `model_error` and operator stops.

  `stuck`, `stalled`, `budget`, `crash` and `model_error` count as not reached in their arm.
- **Failures are results (PB2).** Every launched trial stays in the primary analysis, and model errors and crashes count as not reached: a treatment that causes more of them is worse.
  - Only a trial that never began (no `run_start`) is re-run, at the end of the queue, and reported. A trial that began and then hit a gateway outage or crash is an outcome and is not re-run (the operator 2026-10-27); the runner backs that lane off.
  - Every launched trial counts in the primary analysis whatever ended it (the operator 2026-10-27); report failures and flagged trials per arm and check the arms for imbalance. A predeclared sensitivity analysis may set aside failures shown to be outside the arm, reported beside the primary result; only the operator excludes a run (`just exclude-run`).
- **External cohort drivers** may re-run only a trial that never began (no `run_start`); a trial that began and then hit an outage is an outcome (the operator 2026-10-27). They order arms in randomized balanced blocks so time of day and machine drift do not line up with one arm. A driver never halts silently: it writes the stop reason where the viewer shows it.
- **Target stop:** a run with `evaluation.target` must have `native-target-stop-v1` on in every arm (`patch-results.ts` requires it); it ends the trial at the verified milestone.
- **Several executors** (for example both 4090s):
  - Verify live that every executor serves the same model file, quantization and context. An alias name proves nothing.
  - Give each runner its own endpoint.
  - Have every executor run every arm equally.
  - Report the result per executor as well.
- **One frozen build for the whole experiment.** Grading and instrumentation code may not change mid-experiment. A grading change that has to land goes in first, in its own commit, and is re-measured on the incumbent.

## 8. Record the design

- **Fixed-run definition** under `experiments/fixed/<id>.json`: record the arms, validated start, phase caps, serving requirements, balanced plan and budget. Put the hypothesis, activation milestone, primary outcome and power calculation in the overview and worklog.
- **The HTML overview, required for every design** (step 9).
- **The active worklog:** record the operator's budget and any judgments, such as the smallest lift worth detecting, with dates.

The decision to launch stays with the operator (`fixed-run-launch`). This skill never launches.

## 9. Write the HTML overview

Copy `overview-template.html` to `docs/experiments/<experiment-id>.html` and add a link to it in `docs/experiments/README.md`. Fill every `{{FIELD}}` from recorded evidence, embed the SVG that `power.py plan --svg` wrote at `{{POWER_CURVE_SVG}}`, and delete the template's header comment. Follow `feature-explainer` for style only: overviews are not switch explainers and are never registered in `FEATURE_EXPLAINERS`. Keep it local, plain and diagram first. The overview has eight sections:

1. **Mechanism:** recorded failure, change, expected behavior, and what is measured.
2. **Start:** boot, the save point, the activation milestone and the primary milestone on one story strip. Place the x positions in proportion along 20–840.
3. **Arms.**
4. **Outcomes and decision rule.**
5. **Power:** the curve, the table and the exact command.
6. **Order, executors and failure handling.**
7. **Threats and limits:** threats with their controls, and what the design cannot tell us.
8. **Provenance:** build commit, save SHA-1, baseline cohort, grading code, and design review.

Checks before you report it:
- `grep -n '{{' docs/experiments/<id>.html` prints nothing.
- Render the page in a headless browser and look at the screenshot. Check that no text clips or overlaps and that the Emerald theme renders.
- Every number on the page matches the `power.py` output or a recorded cohort.

Run `just pages-theme docs/experiments/<id>.html` and `just pages-check docs/experiments/<id>.html`, then report the page as `http://127.0.0.1:8791/experiments/<id>.html` (served by `just pages`), as `CLAUDE.md` requires for HTML deliverables. Never send it as a cloud copy (`SendUserFile`, `/mnt/project-files`).

## 10. Get the design reviewed

For a confirm-tier experiment, or any design that spends more than a quarter of the operator's budget, run `pokebench-review` on the design before approval. The data scientist and evaluation integrity personas carry most of the weight. Record their verdicts in the overview's provenance section.

## Self-check

- Tier named. Correctness questions are routed to tests.
- Mechanism tied to a recorded failure, with run id and seq.
- Start state chosen, preferring a checkpoint. Save hash recorded and claim scope stated (conditional or full run).
- One primary outcome, fixed before any run. Secondaries and exploratory outcomes labeled.
- Cap derived from observed times, with the count stated.
- N from `power.py` against a stated baseline and smallest lift worth detecting, and the GPU-hours fit the operator's budget or the shortfall is stated.
- Fixed N, no early stops, every trial-ending path declared, failures kept as results, balanced order and executor parity written down.
- Build and grading frozen.
- Overview written, linked, rendered and checked.
