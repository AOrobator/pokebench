# Contextual controls and interface documentation experiment

## Problem Statement

The operator authorized a new prompting experiment on 2026-10-12: explain that buttons depend on the current screen, and make existing game state/interface observations legible before adding a naming skill. Recent Qwen and Swarm recordings already include individual naming keys, yet both reasoned about phone-style letter groups. The current global START/menu statement also conflicts with naming controls. This worklog records the authorized scope before implementation.

## Skills Loaded

- PokeBench game-state reference: verify interface semantics against pinned Emerald source and existing recorded probes.
- PokeBench feature-worklog workflow: maintain preparation, checks, review, launch, and result receipts separately.
- Multi-model review: frozen source, all PB principles and nine test-quality checks, independent selected roster before landing.

## Architecture

One experiment variable: existing baseline prompt versus contextual interface documentation. Keep the baseline verbatim and select the treatment with one declared, switchable harness feature. Both arms use the same source revision, RAM observations, screenshots, tools, objective tracking, timing, sampling, context policy, fresh boot, and 30-minute cap. No new game-state fields or action tools. Changes stay in the existing live prompt assembly and its entrypoint test. Models choose every press.

The treatment documents contextual controls, authoritative selected keys/text/readiness, individual-character keyboard semantics, the visible keyboard layouts, editor completion versus final player confirmation, and conservative handling of unavailable selections. It does not supply story routes, desired names, scripted button sequences, or hidden solutions. Shared player/Pokémon naming callbacks must not be treated as player identity proof.

Next step, deferred: a naming-interface skill activated from verified naming state, not location alone. Support player naming and Pokémon nicknaming, include initialization/exit conditions, and stop active guidance after the naming interaction ends. Repository development skills currently do not load into the gameplay agent. This experiment does not implement skill routing.

## Invariants

- INV-1: baseline system prompt remains byte-for-byte preserved; prove the actual recorded run_start and loop agree for both arms.
- INV-2: treatment is declared in harness_features and can be disabled; test actual entrypoint wiring and deletion/restoration of the selector and feature.
- INV-3: only documentation changes between arms; existing observation/action/limits/objective mechanisms remain unchanged.
- INV-4: no game-memory/save writes, ROM copies, vendor edits, or measured-session interventions; every run has isolated server, normal logs/frames and terminal record.
- INV-5: failed launches/runs count. One pair per model is exploratory; improvement claims require at least three repetitions per arm from the same start. User increased the plan to three runs per arm per model: twelve total.

## Security Review

Local-only existing servers and tools; no new permissions, dependencies, endpoints, or external control surface. Keep credentials out of logs. ROM stays referenced through the existing resolver and symlink. Source-only documentation must not claim unavailable menu selection or input ownership.

## Milestones

M1 — Prepare a switchable documentation treatment.
- [x] Preserve baseline and primary-source control semantics.
- [x] Entrypoint RED/GREEN and performed operand mutations.
- [x] Required coverage/lint/build gates; principles/test-quality self-review in frozen review packet.

M2 — Review and land.
- [x] Freeze packet, selected-roster review, synthesis and accepted fixes.
- [x] Commit/land exact green source and record deployment status.

M3 — Run the experiment visibly and report.
- [x] Resolve run-count preference; discover live model identities and check owned ports/resources.
- [ ] Launch isolated baseline/treatment runs with normal viewer logs; preserve exact prompts and run receipts.
- [ ] Record naming/editor/final-confirmation timing, button calls, errors, tokens, latency, story progress, DNF and terminal reasons.
- [ ] Report observed differences and sample limitations. No naming-skill or navigation implementation bundled.

## Closing the Loop

Implementation, tests, review, landing, launches, and measured results are separate states. Worklog updates accompany commits. Keep all failed receipts, and original historical runs untouched. Do not archive this log without direct user authorization.

## Session Log

2026-10-12: direct user approved the prompt/interface-documentation experiment and ongoing worklog updates. User first selected two pairs, then explicitly increased to three runs per arm per model, twelve runs total. Models inferred from prior authorized experiments: Qwen 3.8 and Think Swarm. Use six waves with one run per endpoint: Qwen baseline/treatment/treatment/baseline/baseline/treatment, Swarm treatment/baseline/baseline/treatment/treatment/baseline. Three repeats permit median/spread/DNF comparison but do not establish statistical significance. Document endpoint load and order effects. Native naming source and existing probes will ground wording; no new observed fields are introduced.

## Surprises

None yet.

## Multi-Model Review Log

Candidate has green gates and four performed/restored mutants. Freeze source commit, full prompt and source control references for selected-roster review. No independent review or landing claimed yet. Python source is unchanged and its full suite ran from canonical main with the identical reader revision; no shared editable-venv relink was performed.

Round1 complete: fast/swarm/Grok LGTM, fresh Sol/Astra BLOCKING on the actual recorded run_start proof gap. Dedicated Claude-review namespace is logged out; alternate Cursor Claude has current quota failure, retained and replaced by the documented paired independent fallback with reduced vendor diversity. Production prompt/control semantics and baseline bytes were supported. Bounded fix is test-only: select exactly one recorded start, compare exact prompt/tools/features with the plan and loop, and hash the actual recorded baseline prompt. Two additional recorded-boundary mutants (valid wrong prompt and empty feature list in withRun) fail those exact consumer assertions and restore. Refresh TS gates and cumulative review before launch; no production scope growth.

During runs, the tracked source/worklog remains fixed and clean so every arm records the same harness commit. Ongoing live worklog updates are in `runs/launch-receipts/interface-docs-experiment/progress.md`, linked to the manifest and original run IDs; after all terminal results, reconcile the tracked worklog and findings. This prevents documentation edits from making later trials appear to use a dirty harness.

Final R2 selected roster unanimously returned literal LGTM at `398227cba7b769ec97df24f4dbe79152a67cad51`, cumulative diff SHA256 `b3c536524ca483cbbffe1d612cd93968514e2bef72fc52ca45723d9e99593e34`: fast, swarm, Grok, fresh Sol and fresh Astra. Reduced vendor diversity from the documented Claude availability fallback remains explicit. Main fast-forwarded to that exact source and rebuilt successfully. Recording-boundary proof fixes were test-only; no prompt change since R1. All877 tests and unchanged coverage/lint/type/format/build receipts retained. Final packets are in ignored `runs/launch-receipts/interface-docs-review-r1` and `interface-docs-review-r2`.

The temporary managed worktree was archived after clean landing and verified Git-bundle custody. Only canonical main remains; canonical sequencer and shared Git configuration were preserved. Live workload preparation uses discovered registered model IDs, existing local Qwen endpoint and gateway Swarm lane. Qwen's idle runtime unloads between long idle periods; the one-shot supervisor explicitly warms the registered model when needed before normal agent launch, records that preparation separately, and never changes model presets or supplies gameplay actions. Each run uses isolated port8061/Qwen or8062/Swarm; one concurrent run per model endpoint. Supervisor/manifest/progress are ignored operator receipts, not new model-visible tools. Each arm's recorded prompt and feature declaration are checked after its terminal record. No measured run or improved result is claimed at this preparation checkpoint.

## Boy Scout Log

No unrelated changes planned.

## Archive Milestone

- [ ] User authorizes archiving after experiment closeout.

Preparation: canonical branch switch was blocked by its preserved revert record; use managed isolated contextual-interface worktree and remove it after green landing. Baseline SHA25639af4e89110a2513733b420995fcff01c93b17f3e34dcffa11a7cbcc2f32d7e8 retained. Entrypoint RED two default-treatment failures; GREEN353agent tests. Python gate initial path typo exited127 before tests; corrected to canonical unchanged Python runtime, original failure retained. TS coverage/lint/build pass; Python/mutations/review pending.

M1 proof: 353 agent, 146 viewer, 378 unchanged-Python tests pass (877 total); TS and Python coverage independently retain all90floors. TS lint/build and Python ruff/format pass; mypy pending final completion. Four performed source mutants (force selector off/on, remove feature, drift baseline) failed actual-entrypoint assertions and restored four-case matrix passes. Existing current controls/naming layouts grounded in clean pret/pokeemerald731ad5 and original read-only naming/clock probes. Treatment feature contextual-interface-docs-v1 switches off with POKEBENCH_INTERFACE_DOCS=0; both recorded prompt and loop tested against exact preserved baseline hash. No observation/action changes.


### Operator stop and subsequent harness repair (2026-10-12)
User stopped this experiment through the coordinating chat before wave2. Manifest status stopped_by_operator: Qwen baseline5d0f ended model_error at478352ms/31turns after reaching the truck; Swarm treatment0893 ended operator_abort at1513605ms/167turns while naming. Ten planned trials never launched. No efficacy/arm comparison is established; M3 experiment comparison DEFERRED after operator stop, not completed or silently retried. Original logs remain immutable.

Subsequent user-approved types/errors fix landed f63d7a5, documented in docs/worklogs/active/2026-10-12_objective-types.md. Qwen's accepted started string true did not match boolean true; live input now rejects wrong types before pinned pi conversion, gives correction diagnostics, and includes completion scalars in evidence. Retry limit unchanged. No new measured runs started.
