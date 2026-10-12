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
- [ ] Freeze packet, selected-roster review, synthesis and accepted fixes.
- [ ] Commit/land exact green source and record deployment status.

M3 — Run the experiment visibly and report.
- [ ] Resolve run-count preference; discover live model identities and check owned ports/resources.
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

## Boy Scout Log

No unrelated changes planned.

## Archive Milestone

- [ ] User authorizes archiving after experiment closeout.

Preparation: canonical branch switch was blocked by its preserved revert record; use managed isolated contextual-interface worktree and remove it after green landing. Baseline SHA25639af4e89110a2513733b420995fcff01c93b17f3e34dcffa11a7cbcc2f32d7e8 retained. Entrypoint RED two default-treatment failures; GREEN353agent tests. Python gate initial path typo exited127 before tests; corrected to canonical unchanged Python runtime, original failure retained. TS coverage/lint/build pass; Python/mutations/review pending.

M1 proof: 353 agent, 146 viewer, 378 unchanged-Python tests pass (877 total); TS and Python coverage independently retain all90floors. TS lint/build and Python ruff/format pass; mypy pending final completion. Four performed source mutants (force selector off/on, remove feature, drift baseline) failed actual-entrypoint assertions and restored four-case matrix passes. Existing current controls/naming layouts grounded in clean pret/pokeemerald731ad5 and original read-only naming/clock probes. Treatment feature contextual-interface-docs-v1 switches off with POKEBENCH_INTERFACE_DOCS=0; both recorded prompt and loop tested against exact preserved baseline hash. No observation/action changes.
