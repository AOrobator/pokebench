# Size the decision, not a rung

Probe research defaults approved in the October 29, 2026 discussion: **90% target power**, **two-sided alpha .01 for the final comparison family within a research question**, and **one aggregate GPU hour for the entire question**. These are probe-research defaults, not new general gameplay-cohort policy or inference authorization. When an explicitly authorized research contract includes native checkpoint validation, carry its declared claim, power and error-control requirements into that handoff; do not silently substitute the cohort skill's general .05/80% defaults. A later explicit operator instruction can change the study's contract; preserve that provenance.

## Freeze a design before confirmation

Record these inputs, their sources and uncertainty:

- One primary task outcome and the estimand: intervention at this decision, rather than a retroactive rewrite of every earlier observation. Separate stated intent, factual accuracy, proposed valid actions, native execution and downstream progress.
- Baseline rate from comparable development cases or prior valid studies; smallest effect worth detecting, in absolute percentage points; target power and alpha. Infer a reasonable effect from the requested decision and state it; ask only if an unresolved utility choice changes the question materially. Never ask routinely for GPU hours: the default cap is already defined.
- Independent source families, contexts within each family, draws per context, endpoint blocks and fixed weights. Related turns, forks and reconstructed histories from one source run stay in one family. Check cross-study exposure before reserving confirmation families.
- The actual decision rule: benefit test, practical acceptance margin if any, regression/non-inferiority limits, multiplicity adjustment, missing/error outcomes and the terminal claim. Give effect estimates and matching uncertainty intervals, not only p-values.
- One frozen final candidate against the incumbent, planned N, analysis, and protected confirmation reserve. If more final candidates or repeated final looks are planned, control the combined error budget at .01; do not reset it by renaming a study. This is a per-question threshold, not a guarantee across unlimited autonomous questions.

The smallest effect worth detecting is a **planning alternative**, not automatically the pass threshold. If acceptance requires the effect's lower confidence bound to exceed a positive practical margin, size that rule, not a test against zero. Likewise, power for a benefit test alone does not establish power for benefit plus all regression checks. Report both when the full decision's power cannot be established.

## Use an analysis matching the units

`../pokebench-experiment-design/power.py` (relative to the decision-probes skill directory) computes exact power for an independent binary two-arm Fisher comparison. Use it as an independent-draw reference or for a design that actually meets that assumption. Its CLI accepts `--alpha` and `--power`; inspect `plan --help` before invocation. Save the exact command, inputs and output. It does **not** calculate transfer power for many draws clustered within historical contexts.

For a transfer claim, choose the family-aware analysis first and size its family count and within-family draws using development variation and a reproducible calculation or simulation of that analysis. Preserve code, seed, baseline/heterogeneity assumptions, null calibration and sensitivity to plausible variation. Balanced family-level contrasts or a justified hierarchical/clustered method can fit this purpose; pooled Fisher over repeated draws cannot replace them. Too few independent families or unavailable variance information leaves sizing provisional: obtain permitted development information, narrow the explicitly stated estimand, or report the design as insufficient. Do not claim nominal power from a model whose assumptions are unsupported.

Do not substitute repeated draws for unseen situations. Synthetic contexts and other-model source histories have their own scope; label them. Metadata-only qualification of a protected family may check availability and integrity, but must not expose its decision text or outcomes to the prompt designer. If content must be inspected or a rubric revised from it, mark that family development and obtain a fresh reserve before another confirmation claim.

Independent-draw reference examples, not universal minimum sizes (baseline .50, alpha .01, two-sided Fisher):

| True candidate rate | Draws per arm | Reference power |
|---|---:|---:|
| .80 (+30 points) | 96 | 95.8% |
| .70 (+20 points) | 192 | 91.4% |
| .60 (+10 points) | 768 | 90.4% |

These are benefit-test calculations only. Different baselines, family variation, adverse controls and practical margins change the required design. Historical large effects are selected successes, not a prior that every new prompt gains 40–90 points.

## Conditional reliability and native handoff

Fresh final draws on previously inspected fixed contexts or saves can evaluate a finalist under a predeclared conditional-reliability claim. Preserve the exploratory lineage and use independent final trials and a frozen analysis; do not call the situations unseen or transfer-held-out. Repeated restores of one save do not increase the number of independent source families. A native game save also does not restore agent history, task memory or planner lifecycle state: qualify that continuation or explicitly specify a state-only restart.

If the campaign makes multiple final probe/native claims, predeclare a valid combined error-control procedure, such as a justified fixed-sequence gatekeeping design or allocated alpha across claims. Merely calling the phases sequential does not establish error control or joint power. Estimate native baseline and runtime from comparable native evidence, not replay intent scores; native calibration/pilots consume budget and exposure too. Protect final/native resources before exploration. A clean replicated action-level result may justify an authorized native experiment under its frozen escalation rule; it is not already native benefit or production promotion.

## Fit the whole search inside the cap

State both units: **draws per arm per case** and **total draws per arm**. Calls for a stage equal the sum over cases of arms times draws per cell. Exploration normally begins at 8 per arm per case; promising development revisions may use 16. Confirmation is power-sized, not automatically 32, 64, 128 or 256. A different development size needs a concrete reason. Small pilot nonsignificance is not evidence of no effect.

Cost the planned exploration, revisions, confirmation, calibration, failed calls and any GPU grading. Count stage attempts, not only logical trials: independent planner plus executor calls, including invalid-plan failures, may have different latency/output ceilings. Honor operator development minimums. Use comparable observed mixed-workload call latencies plus conservative allowance for long contexts, endpoint overhead and teardown; label extrapolations. Charge physical GPU occupancy from study acquisition until verified release, including idle time while holding its lease. Sum across GPUs; two GPUs held for 30 minutes consume the hour. Deduplicate overlapping occupancy intervals on the same physical GPU rather than counting one device twice. Keep CPU-only design and grading on other resources separate. Release scarce GPUs before offline grading when possible.

Before each frozen batch, reserve enough remaining study budget and coordinated window for its bounded worst-case calls and release. A deadline can end a batch as incomplete; it cannot turn favorable partial results into a completed comparison. Preserve all attempts, unresolved occupancy and the incomplete status. Reconcile uncertain work before resuming; completed calls are never silently repeated.

If the complete design cannot meet the evidence standard within the authorized cap (one hour by default), **flag after design and before launching**: required families/draws, estimated cost, limiting assumptions, and what an explicitly narrower study within that cap could establish. Do not silently reduce N, spend the confirmation reserve on exploration, relax alpha/power, or extend the cap. An exception or changed question requires the operator's instruction. Record whether a grant expands an active cap, replaces it or starts a new campaign allowance. Closed/expired allocations do not carry forward without explicit authorization; unused prior allowance is not silently added again. Balance arms across comparable devices and independently seed trials; dedicating a strategy to one GPU confounds the comparison.

## Lock analysis and report the decision

Finish a frozen batch before inspecting outcomes. Development batches may inform the next candidate; their selected results never enter the protected final test. Freeze scorer/analysis versions before confirmation. If a scorer bug is discovered, preserve original grades and consistently regrade saved responses under a new version; inspected confirmation becomes development evidence for any subsequent adaptive search. Never resample merely to replace inconvenient outcomes.

Preserve every attempted call and distinguish invalid input/replay, provider failure, treatment-induced failure and valid model decisions. Predeclare how each enters the denominator and sensitivity analyses; never present model errors as successful decisions or quietly drop one arm's failures. A wholly invalid treatment/input comparison is an invalid study, not a measured prompt failure. Unresolved grading/delivery integrity blocks nomination.

Use **supported improvement**, **reject under the declared rule**, or **inconclusive**, with effect intervals and per-family results. Lack of significance is not equivalence. Regression limits need explicit margins and appropriate simultaneous uncertainty bounds, not simply non-significant harm tests. For example, zero harms in 64 independent trials still gives a one-sided exact 99% upper harm bound of about 6.9%. A large primary effect does not waive controls. Probe support nominates a candidate; production-path validation, checkpoint continuation and broader gameplay benefit remain distinct evidence.
