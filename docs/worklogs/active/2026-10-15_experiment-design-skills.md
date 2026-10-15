# Experiment design, trace forensics and persona review skills

Requested by the operator via Hermes (2026-10-15), after the ChatGPT review in the private notes note
`🤖 2026-10-15 PokéBench Review — Experiment Design & Statistical Power_6ad10e0c` and the Hermes
session that sized the bundle-vs-control cohort. The operator approved the scope in chat: "go ahead and
CRUD the skills". Branch `hermes/experiment-design-skills`, worktree
`/private/tmp/pokebench-experiment-design-skills`. Local only, no push. Review with Claude and Grok,
not local inference lanes. Ask before merging to main.

## Operator decisions (2026-10-15, chat)
- Experiment design is its own skill, and it writes an HTML overview of each experiment in the
  style of the explainer pages.
- Persona review: harness engineer, data scientist, machine learning engineer and a new evaluation
  integrity persona, each run as a parallel subagent so they genuinely disagree.
- Trace forensics is a separate skill that links to agent-observability.
- "we should rely on checkpoints heavily".
- From the bundle-vs-control session: fixed N, one analysis at the end, no early stops or ejects;
  a GPU-hour budget the operator sets; the trial cap comes from the observed milestone times.
- The winner gate is out of scope here (the operator is testing another experiment).

## Spec
1. New `.claude/skills/pokebench-experiment-design/`: `SKILL.md`, a stdlib-only `power.py`
   (exact Fisher p, exact power, runs-per-arm search, GPU-hours, Newcombe interval, linear-axis
   SVG power curve), `power_test.py` cross-checked against scipy, and `overview-template.html`.
   Overviews go to tracked `docs/experiments/<id>.html`, indexed in `docs/experiments/README.md`.
2. New `.claude/skills/pokebench-trace-forensics/SKILL.md`: read-only run forensics (timeline,
   observation audit, supervisor truth audit, failure taxonomy, hidden progress, paired
   comparison), linking agent-observability, game-state and story-milestones.
3. `pokebench-review`: coordinator SKILL.md plus `personas/{harness-engineer,data-scientist,
   ml-engineer,eval-integrity}.md`; the coordinator gathers one evidence packet and launches the
   four personas in parallel as independent read-only subagents.
4. `pokebench-patch-evaluation` and `experiment-queue`: checkpoint-first designs, screening
   versus power-sized confirmation, pointers to the design skill.
5. `CLAUDE.md`: one pointer each to experiment design and trace forensics.

No harness behavior change, so no feature switch or explainer. No application code, so the
coverage gate is untouched; `power.py` is a skill helper tested by its own cross-check.

## Milestones
- [x] M1 Draft the skills and helpers; run the power cross-check; render a sample overview and
  check it visually.
- [ ] M2 Claude CLI and Grok reviews; fix findings.
- [ ] M3 Ask the operator before merging to main.

## Log
- 2026-10-15 M1: wrote the experiment-design skill (SKILL.md, power.py, power_test.py, overview template), the trace-forensics skill, the review coordinator with four persona files, checkpoint-first edits to patch-evaluation and experiment-queue, CLAUDE.md pointers and docs/experiments/README.md.
  - power.py runs on system python 3.9 with the standard library only. `uv run --with scipy --with pytest pytest power_test.py` passes 12 tests: Fisher matches scipy on every table at 8/8, 5/9, 16/16 and 1/3; power matches scipy enumeration; it reproduces the recorded sizing (8/arm 37.5->62.5 at 9.5%, 64/arm 50->75 at 80%); first-crossing search; Newcombe 3/8 vs 5/8 = -20 to +59. pyright 0 errors, ruff clean.
  - Caching rejection regions per (n, alpha), and scoring each hit total's hypergeometric once, took `plan` for four lifts plus the SVG from 53 s to 2.2 s with identical output.
  - Power is direction-aware (variant ahead), so +15 pts at 80% needs 183/arm here against 184 in the either-direction sizing.
  - A sample overview rendered in headless Chrome, light and dark. Fixed the template comment, which contained the very placeholder the skill's own grep checks for. Moved the start label above the strip, because it overlapped the activation label when the points are close. Narrowed the fact tiles so six fit on one row.
- 2026-10-15 M2, one review round, which is all the operator allows before merging. The diff SHA-256 was 5a0c2489.
  - **Reviewers.** The Claude CLI was at its session limit and Cursor's Opus and Sonnet were at their usage limits, so the Claude lane ran as a Hermes subagent on Opus, which leaves less vendor diversity. Grok 4.7 high ran through Cursor. Both returned BLOCKING.
  - **Fixed:**
    - `runs_for_power` now finds the true first crossing by linear scan; it had missed 102 for 37.5 to 57.5 and the values near the ceiling. Plans now use the first N whose power stays at the target for 10 consecutive N. Tests compare against a scipy brute force (17 pass).
    - The skills now declare every way a trial ends: target, cap, `maxTurns`, loop-guard `stuck`, `milestone-stall-stop-v1`. The overviews had said only the cap ends a trial.
    - Failures are now kept as results, per PB2, replacing the rule that replaced them. Only outages outside the arm are re-run, by external drivers. The skill records what the queue runner actually does.
    - Checkpoint designs get their own READY (checkpoint) verdict.
    - `budget.maxWallMs` is the cohort budget, at least trials × cap.
    - Factorials run as external cohorts, with each switch then confirmed alone.
    - `--comparisons` sizes for Holm.
    - Censoring wording fixed; 0.05 is the only decision threshold.
    - GPU-hours are labelled an upper bound.
    - `externalCohort` is set at launch.
    - The capture milestone must come before activation.
    - Overviews are not registered in `FEATURE_EXPLAINERS`.
    - The forensics event list and the `harness-stop` class are complete; the persona brief says read-only except its own section.
