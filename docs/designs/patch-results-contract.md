# Passive patch-results contract

`packages/agent/src/patch-results.ts` exports `comparePatchResults` and `renderPatchResults`. They perform no I/O, model/game requests, mutation, promotion or rollback. Caller reads immutable logs through the existing `readRun`/`parseEvent` path. This module does not define the evolving runner/registry/viewer schema or modify their code.

## Inputs

`PatchComparison`: patch ID, native target milestone ID, changed feature ID, stage (`screening` or `confirmation`), predeclared speed margin percent (>0 through100) and completion tolerance (0through4). Incumbent/candidate each supply an immutable preset ID, explicit featureID→boolean vector and recorded trials. Keys represent declared `run_start.harness_features`; enabled membership must match the supplied vector, including explicit OFF. Exactly one key/value differs and both arms declare all keys. Flag absence does not resolve mutable defaults. Future registry adapters must map their IDs to this explicit recorded-feature contract or revise it openly.

Each trial supplies validated `RunEvent[]`, an immutable external environment fingerprint (SHA256-format) plus receipt reference, and optional evidence-linked issue annotations classified `harness_bug` or `infrastructure`, with explicit comparison validity. Current run_start omits ROM/serving identity, so the audited manifest must supply it. The function validates receipt presence/matching fingerprints, not the receipt's content or hardware. Do not fabricate environment identity from a model name or directory. Target grading uses this reporter build's native MILESTONES predicates; caller records reporter artifact/source identity alongside results, especially for historical replay.

## Qualification

Four actual trials per arm, no duplicate trial IDs, one valid ordered run-start/terminal chain, same clean source/model/sampling/tool/start/budget/vendor/pi identities and common feature set, fixed prompt within each arm, consistent external environment. Checkpoint identity is content SHA1; per-run checkpoint filenames need not match. Model-specific lane comparisons only. Run isolation identity must match the event envelope. Probes cannot qualify.

Native target requires recognized story/navigation predicate, `origin=observed`, matching kind and evidence references to earlier same-run state events. Last proof state must be the most recent state before the milestone and at least one proof state must satisfy the native predicate. FIRST_TRUCK_EXIT additionally requires actual truck evidence. Legacy/unqualified claims do not earn splits; target present_at_start cannot earn elapsed traversal. Entirely unsupported target state makes the comparison unqualified rather than a valid model failure. A positive native state without any target event is explicitly reported as a harness grading/recording bug.

## Output and interpretation

Structured `PatchResult` includes preset IDs/flag vectors, launched/reached/incomplete counts, stop reasons, target-time/target-turn median/min/max/namongcompleters, percent time change, exact per-run status/evidence/coverage, total run tokens/turns, issues, comparison problems/limitations and recommendation. Token/turn totals are whole-run cost; target turns are separately labeled. This version does not compute per-target token segments or strategic usefulness. Native timing is recorded milestone elapsedtime, not serverclock or model narrative.

Completion-first deterministic policy: excessive completion loss→regress; higher completion→improve; equal completion permits speed comparison at predeclaredmargin; within-tolerance completionloss remainsinconclusive, never promoted by survivortiming. Missing/incomplete/invalid/incompatible evidence→ineligible/inconclusive. Improve during screening→confirm; improve during confirmation→keep; regress→discard; inconclusive→retain. Invalidating harness bug→repair_and_rerun. These are policy recommendations, not statistical significance or executed promotion. Downstream frontier checks and genuinelyfresh confirmation receipts are caller responsibilities and must accompany any broader promotion.

Markdown renderer keeps denominators, featurevectors, event evidence, stop reasons, coverage, harness attribution and limitations visible. It does not execute recommendation or add modelcontext. All eight trials remain in the report even when ineligible; historical three-per-arm data remains correctly labeled and cannot fulfillfour-per-armprotocol.
