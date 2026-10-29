---
name: pokebench-probe-autoresearch
description: Research and hill-climb a PokeBench prompt intervention from recorded failures, using bounded exploratory batches and power-sized fresh confirmation. Use when asked to find or improve a prompt, optimize a decision, or run autonomous probe research; not a single frozen switch comparison, passive run analysis, or gameplay-cohort launch.
---

# PokeBench probe autoresearch

Turn a decision problem into the best-supported intervention found, or an honest rejection/inconclusive result. This is an **agent-led workflow using existing tools**, not an installed unattended controller or scheduler. Read [decision-probes](../pokebench-decision-probes/SKILL.md) first; it owns validity, sizing, grading, compute accounting and publication. Its [power-sizing reference](../pokebench-decision-probes/references/power-sizing.md) is required before designing confirmation or spending its reserve. This skill owns candidate research and adaptation; do not duplicate or weaken that evidence contract.

## Scope and bounded autonomy

Design/discussion requests stay offline. An explicit request to run probe research authorizes the requested probe search within the applicable limits, subject to run coordination and existing launch rules. Writing/updating this skill, reading a saved plan, an old lease or an idle GPU is not launch authorization. Do not interrupt gameplay, start new gameplay continuations, change recipes, activate a switch, land production prompt changes or reserve future compute merely because a prompt looks promising. Route any such separately authorized work through its owning skills.

Default: one aggregate GPU hour for the **whole question**, not one hour per candidate, phase, endpoint, resume or agent. Do offline research and feasibility design first. Flag an infeasible complete design before inference. Work autonomously inside a feasible authorized contract without asking after every candidate or routinely requesting a GPU budget. Coordinate each actual compute window; do not start a waiting endpoint claimant before clearance.

Before the first measured batch, choose and record a finite revision ceiling and stop conditions that fit the confirmation reserve and task. Explain these study-specific choices; they are not a universal three-round rule. Stop earlier when no useful hypothesis remains, required families are unavailable, evidence integrity fails, a resource window expires, or the next complete batch would consume the protected reserve. Do not loop indefinitely to find significance. On an ordinary resource wait, save state, release resources and yield rather than burn tokens polling. No new recurring automation is implied.

## 1. Research the bottleneck

- Inspect the actual delivered observation, screenshot, exposed reasoning, proposed action, execution result and source state at the failure. Include a successful or appropriate contrasting decision. Distinguish missing information, misleading text, a contradicted self-imposed belief, wrong timing/channel, invalid tools and a genuine strategy failure.
- Retrieve related registered studies, reports, manifests and transcript passages by task, model and mechanism. Read the full relevant successful and failed responses, not only executive summaries. Follow corrected/invalidated results and helper handbacks. Record paths, source pins and important gaps; do not claim exhaustive reading from a keyword scan. Reuse verified historical evidence instead of rescanning every transcript for every question.
- Build a compact evidence ledger: intervention, model/request conditions, endpoint measured (facts, plan, valid action or native outcome), observed effect, negative results, invalidations, exposed families and source references. Prefer primary records. Successful wording is a prior to test, not a guaranteed recipe.
- Ground proposed factual additions in observations available to the player; game source can verify truth but does not authorize leaking unobserved story information. Do not invent a previous mistaken belief in neutral controls. History subtraction is a diagnostic ablation, not an automatic production deletion policy.

State the requested outcome, its evidence level and a plausible mechanism. For multi-action strategy changes, next-call probes cannot prove sustained recovery; identify the separately authorized checkpoint test needed for that claim.

## 2. Freeze a feasible research contract

Use [research-record](references/research-record.md) for the durable minimum. Freeze development families and a cross-study-clean confirmation reserve, contrast/misfire controls, one primary outcome, baseline assumptions, minimum effect worth detecting, the complete acceptance rule, analysis, candidate limits and full-search cost. Follow the core skill's power-based sizing; 8/16 are development defaults, not a fixed confirmation ladder.

Each candidate is a versioned **prompt template + placement + eligibility predicate + persistence/consumption rule**. Save its parent, exact text/diff, observation-derived slots, evidence and predicted action change. Change one mechanism when isolating a cause; label compound candidates and avoid attributing their effect to one sentence. Keep the evaluator, game tools and sampling fixed while optimizing the intervention. Necessary tooling repairs are separate correctness work, not new prompt variants.

Use existing probe tooling and publisher where sufficient. Do not invent a `probe-autoresearch` CLI or claim an unavailable controller exists. If a custom runner is necessary and authorized, its fake-data rehearsal, immutable inputs, durable samples, budget/lease handling and review must be ready before measured calls; otherwise report the missing capability. This skill alone does not build or install it.

## 3. Qualify, then explore

Complete the core skill's delivery/fidelity checks offline before claiming readiness for compute. Prove the intended text reaches the real choice point in each changed arm; reject inert contrasts and unqualified replay dimensions. Freeze runner/build, all request inputs, sampling and grader versions. Rehearse the operational path on fake data, keep it out of the real registry, then publish/verify the authorized real study as the core skill requires.

Compare the incumbent with a few distinct hypotheses on balanced development contexts, including situations where the tempting intervention would be wrong. Start at 8 draws per arm per case unless a documented reason requires a different size. A fresh batch should sample its relevant parent/incumbent too; do not compare a new challenger only with the parent's lucky old score. Use balanced ordering across endpoints and preserve actual model groups.

Persist every response and attempt before moving on. During the frozen batch, inspect operational health/counts only; no early winner selection, arm dropping, wording edits, changing server settings or rebuilding the measured runtime. Keep treatment identity hidden from graders until grades/adjudications lock.

## 4. Diagnose, revise and retain lineage

After a complete development batch is graded, inspect full successful and failed responses plus proposed and executable actions. Separate true action gains from agreeable reasoning, facts-only improvements, indiscriminate action bias, tool restrictions and errors. Record the evidence and precise hypothesis for each revision.

Keep the strongest defensible development candidate as a **provisional** champion. Prefer new mechanisms supported by failures over many cosmetic synonyms; removing misleading text, changing timing or narrowing eligibility can be better hypotheses than adding a longer instruction. Do not blindly stack individually promising sentences. Use 8 for an uncertain new mechanism or 16 for refining/replicating a promising candidate, with a stated next decision. Pilot nonsignificance is not proof of no benefit and does not by itself justify eliminating a candidate.

Keep all candidates, nulls, harms, batch identities and costs. Reused or inspected histories remain development even with fresh seeds. Choose whether to revise, replicate, freeze a finalist or stop only between complete batches and inside the frozen search limits. Do not consume the confirmation reserve just to keep searching.

## 5. Confirm once and deliver

Freeze the finalist's entire delivery contract, scorer, planned N, analysis and negative-control limits before opening confirmation. Compare with the incumbent on the protected families using the power-sized fixed design. Apply the declared complete decision rule, not whichever metric now looks best. If confirmation fails or is inconclusive, report that; revising from it burns those families and requires a newly designed, separately feasible fresh reserve with the question's error budget preserved.

Save the exact selected template, its trigger/placement/lifetime, evidence, per-family effect and uncertainty, regressions, full search history, actual resource use and scope limits. Follow the user's active report-format/delivery preferences through the global reporting skill when available; keep personal presentation and delivery configuration outside the project. A report or probe nomination does not implement, activate or prove a gameplay improvement.

## Resume without resampling

On interruption, reconcile durable batch/job/attempt records against source samples, worker state, lease owner and actual occupancy. Keep the original question ID, pins, exposed families, spend and reserve. Unknown in-flight work remains uncertain until reconciled; do not start a duplicate to make progress. Resume only unsampled positions of the same frozen batch when authorized and sufficient budget/window remain. A finished batch with failed grading resumes from saved samples under its unchanged scoring protocol; a changed protocol gets a new version and disclosed scope. Release owned resources and record a terminal or waiting reason the operator can see.
