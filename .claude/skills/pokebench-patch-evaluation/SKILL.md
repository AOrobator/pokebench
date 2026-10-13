---
name: pokebench-patch-evaluation
description: Evaluate individual PokeBench behavioral patches against a reproducible incumbent configuration using feature-flag comparisons, four runs per arm, native milestone splits, incumbent comparisons and evidence-backed keep/discard/improve reports. Use for patch benefit claims, benchmark plans, results reporting and incumbent promotion; not passive viewer diagnostics or game-playing automation.
---

# Measure patches before calling them improvements

A patch is a change, not a proven improvement. The operator requires individual comparisons, four runs per arm per model, completion reliability before speed, incremental milestone targets, and a reproducible best-known configuration. This is prospective: the completed twelve-trial contextual-interface cohort remains three runs per arm per model; preserve its original protocol and actual counts. This skill defines evaluation; it does not authorize new runs, runtime edits, resource changes or landing. Use the active worklog and repository gates for authorized implementation. See [story milestones](../pokebench-story-milestones/SKILL.md) for native grading and [game state](../pokebench-game-state/SKILL.md) for qualified observations.

## Register one experimental difference

Before trials, record patch ID/version, hypothesized failure mechanism, target native milestone, maximum budgets, meaningful speed/regression margins, tolerated completion change, downstream check and trial order. Compare the frozen incumbent to a candidate on the same reviewed build with exactly one effective behavioral patch flag differing. Reject unexpected differences, missing dependencies or invalid flag combinations before launch. Record complete effective flags, prompt/interface-document hashes, model/artifact/endpoint and serving configuration, sampling, source/build, ROM/vendor, start state and instrumentation identity. Do not use mutable defaults as provenance.

Keep passive recording, native grading, viewer diagnostics and post-run analysis available in both arms. Prefer deriving diagnostics from existing logs; keep instrumentation version/overhead equal. Warnings, injected context, action restrictions and loop termination are interventions, even when named diagnostics. Make independent interventions independently switchable where feasible. Never ablate isolation, truthful grading, input validation or evidence integrity. If a patch unavoidably combines behavior, declare a composite rather than claim individual attribution.

For the initial reference, inventory current behavior and add retroactive behavioral flags only within authorized implementation scope. Verify that explicit settings reproduce the reference and both branches work. A preset requires a compatible executable; flipping flags cannot recover removed code. Do not pretend the configuration resolver or flags exist before implementing and validating them.

## Run short targets, then extend the frontier

Run **four trials per arm per model**, with predeclared counterbalanced order, identical starting conditions and equal maximum budgets. Terminate after the game-owned target is verified to save time; use an implemented, logged termination path, never silently truncate events or mislabel an operator abort. Retain every launched outcome, stop reason and failure. No gameplay rescue, secret reruns or mid-cohort source/policy changes. Control endpoint contention and serving configuration.

For early testing, bound the target to game creation, accepted name or another immediate native milestone, then extend toward truck exit, clock, starter and gym as supported. Resolve target IDs and predicates from the compared build’s native catalog (`packages/agent/src/milestones.ts`): current IDs include `NEW_GAME_CREATED`, `PLAYER_NAME_CONFIRMED`, `FIRST_TRUCK_EXIT`, `CLOCK_SET` and `STARTER_CHOSEN`. Verify the claimed semantics and source evidence; legacy `PLAYER_NAME_SET` is not interchangeable with accepted name, and starter ownership is distinct from later story handoff. Do not invent a target ID or assume a later branch implements a predicate or termination path. Predeclare the stages. A naming result establishes only that frontier; test downstream behavior before claiming broader improvement. Identical checkpoint starts may diagnose a segment if provenance is recorded and present-at-start milestones are excluded from earned splits; confirm the claimed frontier from a common end-to-end start. Additional exploratory or confirmation batches must be labeled, predeclared and authorized, not repeated until a favorable result appears.

## Assess reliability and time together

Report target reached/total, missing or censored outcomes, milestone elapsed times/turns/tokens, spread and relevant diagnostic episodes. Show completion counts beside median/range among completers. Missing splits are not zero. Early termination of a stalled run is a bounded failure, not a faster speedrun. State-changing actions and detector flags are proxies, not proof of useful strategy or wasted time. Separate model failures, observability gaps and infrastructure failures; retain the latter without attributing them to gameplay ability.

Compare downstream splits so an earlier gain cannot hide later degradation. Classify improve, regress or inconclusive using the predeclared criteria; four runs per arm do not automatically establish statistical confidence. If completion deteriorates beyond the agreed tolerance, do not promote merely because survivors finish faster. Keep the incumbent on regression or inconclusive evidence. Confirm apparent winners using a fresh predeclared batch before promotion to limit selection bias from repeated hill climbing. Post-run LLM annotations may explain evidence, but never override native grading or measured outcomes.

## Track and restore the incumbent

Maintain an append-only promotion/regression ledger and immutable named presets per compatible model/environment lane. Each preset records:

- Complete effective flag vector, explicit OFF values, dependencies and policy/document versions.
- Compatible source/build plus model/artifact, serving/sampling, ROM/vendor, start and measurement protocol.
- Validated milestone frontier, four-per-arm comparison receipts, confirmation evidence, completion counts and time distributions.
- Parent incumbent, candidate patch ID, decision/reason and rollback reference.

Resolve the preset into the recorded effective configuration and validate it before launch. Expose that identity in run metadata and viewer comparisons. Keep old presets and runs reproducible; do not overwrite the incumbent with the luckiest single run or average one model's regression away using another model's improvement. A diagnostics-only UI change is not a behavioral ablation; qualify it separately for correctness and overhead.


## Report results and expose harness bugs

Every completed or interrupted evaluation produces a report, even when the candidate fails or no recommendation is possible. Lead with improve/regress/inconclusive and a keep/discard/improve recommendation, qualified by model and validated milestone frontier. Distinguish a recommendation from an executed promotion or rollback. A report never promotes a preset automatically; apply any preset/ledger mutation only within the user-authorized implementation and promotion scope.

Include:

- Incumbent/candidate preset IDs, compatible build, complete effective flag difference, target/start/budgets, model/environment and actual trial counts against the planned four per arm.
- Native target completion counts, elapsed-time and turn/token distributions, relevant downstream checks, stop reasons, model errors, infrastructure failures and harness coverage gaps. Show both arms side by side, missing/censored outcomes explicitly and magnitude of change with units. Survivor medians alone cannot establish improvement.
- What worked and what did not, tied to run IDs and event/frame evidence. Separate measured facts from causal hypotheses and optional post-run LLM interpretations. State sample/coverage limitations, unverified behavior and confounding changes plainly.
- Recommendation: KEEP only the supported model/frontier after required confirmation; DISCARD the candidate from the incumbent when valid comparisons show regression or no worthwhile benefit; IMPROVE when an identified weakness suggests a specific revised patch. INCONCLUSIVE retains the incumbent and states the next predeclared test. Discarding a configuration does not delete code, flags or evidence.
- Concrete suggested next patch or diagnostic, proposed target and success/regression criterion. Link reproducible run receipts, comparison report and the append-only decision ledger. Show the incumbent before/after; do not claim it changed until the preset/ledger update actually happened.

When a harness bug is found, say **harness bug** and describe the trigger, incorrect observation/behavior/grading, model impact and supporting evidence. Do not reclassify malformed harness evidence or wrong world state as model inability. Separate an intended correction under test from an unplanned bug that invalidates measurement or comparability. Preserve affected trials and label which conclusions remain valid.

Repair authorized bugs through the repository's tests/review gates, verify the exact failure path and model-visible propagation, then rerun the affected comparison from a common qualified build with four fresh trials per arm. Freeze the revised protocol before restarting. If a common harness repair changes both arms, remeasure both; do not compare a newly repaired candidate against stale incompatible controls. If only analysis/display was wrong and immutable logs contain sufficient correct evidence, regenerate and validate the report without inventing new gameplay results; rerun when observation, gameplay, timing or grading validity cannot be recovered. Keep original and superseding cohorts separate with the reason for rerun. Never modify active measured source or silently replace failures. A repair may be necessary for correctness even before speed benefit is established; grade those claims separately.

This reporting contract does not grant unlimited reruns: apply the existing user-authorized experiment scope and predeclared stopping/budget rules, and surface repairs that require new scope rather than quietly expanding the cohort.
