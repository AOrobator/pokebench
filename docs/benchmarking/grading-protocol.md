# Grading protocol

Version 0.1, 2026-10-25. Companion to [the rubric](rubric.md). This records the intended procedure; it does not claim a new executable grader exists.

## Freeze identity and evaluation scope

Record model/artifact/quantization, wrapper, serving build, context/sampling, harness commit and dirty status, exact effective features, tool contracts, ROM/vendor identity, start/save hash, seed where available, budget and objective definitions. Freeze the observed prefix of live runs and record its cutoff. Later evidence is a later snapshot.

Keep boot, unstarted main-menu, checkpoint and other-save starts separate. Inherited objectives receive no newly-earned credit. Segment comparisons disclose initial party, inventory, learned facts and history. Record extensions and administrative intervention; an adaptively extended showcase is not a fixed-budget confirmatory trial. Retain results at the original horizon alongside continuation results.

## Reconstruct each scored episode

Use exact run/turn/sequence/time references, preceding observations, actual submitted request, tool arguments, applied native input, resulting state, paired frames and eventual outcome. Validate raw-RAM archives and ROM identity when needed. Establish world truth, information actually available to the model and correctness of its interpretation separately.

Do not infer execution from intent or causality from narrated reasoning. Seek contrary evidence. An assistant summary is a discovery lead, not a substitute for the original evidence. Preserve source records and revisions rather than rewriting history.

Each annotation records category, opportunity, proposed grade, reason, supporting/counterevidence, outcome, confidence, missing evidence, reviewer and rubric version. Preserve ambiguous cases and multiple defensible actions.

## Objective qualification

Badge receipt, trainer victory and entering a gym are distinct. Qualify each objective against matching game source/native evidence and the deployed reader, not a model statement or display label.

For League completion, retain per-member Elite Four outcomes, Champion victory and Hall of Fame completion as separately qualified facts. Require correct episode/attempt identity. The exact detector predicates remain implementation work if unsupported.

For Mission Ray-Ray, distinguish encounter/seen, battle result, successful capture, and owned Rayquaza. Corroborate capture with validated native outcome/dialogue and same-identity ownership in party or PC. Party absence after a full-party capture does not establish failure; inspect PC evidence. A seen/owned Pokédex bit alone does not prove this run captured it. A preloaded owned Rayquaza is present at start, not newly earned. Keep visual reconstruction explicitly distinct from native automatic evidence. Proposed tests must cover encounter, faint, failed ball, successful capture into party/PC, inherited ownership and unavailable state. No such tests or detector are implemented by these documents.

## Run inclusion

Operator rule, the operator 2026-10-27: how a run ended is orthogonal to whether it is included. "I want exclusions to be very purposeful and intentional." No end reason (`budget`, `milestone`, `stuck`, `stalled`, `model_error`, `crash`, `operator_stop`, `operator_abort`, a process that died without `run_end`) and no heuristic removes a run. A run that ends early stays in results: its verified progress before the stop counts (furthest milestone, splits, badges, turns, time, tokens), and objectives it had not reached are censored at the stop, never counted as failures. The viewer marks it "Ended by operator abort (operator_abort)" or "Ended by operator stop (operator_stop)".

A run leaves results only through an explicit operator exclusion with a reason: `just exclude-run <run-id> <operator> <reason…>` writes `runs/exclusions/<run-id>.json` (`version`, `run`, `reason`, `by`, `at`). The run's own log is never edited or pruned. A malformed exclusion file excludes nothing and is listed as a problem. The workbench, frontier, strict feature history and `just fixed-run analyze` all honor it; the cross-model and run-analysis skills read the workbench's `excluded` field, so they honor it too. Reach rates censor the same way: an operator-ended run counts toward a milestone's denominator only if it reached that milestone. Ledger and receipt notes (infrastructure outcome, launcher outcome, invalid fixed-run trial, unreadable ledger) are flags: the viewer draws a flagged run dotted and labels it, but it still counts everywhere, frontier included. The aborted human session may be the human reference like any other finished session.

Fixed-N runs: every trial that started and ran the plan is a valid outcome whatever ended it, and is never replaced. After a crash, gateway error or a play process that died, the runner only backs that lane off before the next trial. A trial that never began (no `run_start`) or ran another configuration is still marked invalid so the runner can schedule a replacement within the reserve, but `fixed-run analyze` keeps it in every comparison and lists it under "Flagged trials" for the operator to decide.

Not end reasons, listed for the operator rather than changed: probe sessions (recorded `probe` feature) stay out of benchmark results; a run whose event log cannot be validated (`problem`) cannot be graded; an unfinished human session cannot be the human reference; a tainted fixed-run cohort is moved to `runs/aborted/` by the operator's launch procedure.

## Aggregate fairly

- Treat independent launched runs as the experimental unit, not individual actions or several samples from one episode.
- For each named objective/common budget, retain reached, behavioral noncompletion, incomplete follow-up, infrastructure interruption and ineligible counts. Earlier verified success survives a later interruption.
- Report reached/eligible with survivor turn/time/token distributions; missing completion is never zero, an invented completion time, or a silently discarded run.
- Show cumulative and between-badge results. Interpret conditional segment performance alongside end-to-end reach reliability.
- Report uncertainty and small-N limitations. Separate exploratory selection from fresh frozen confirmation; predeclare sampling and stopping. Do not repeatedly inspect significance and stop opportunistically.
- Preserve model × harness × start × runtime differences. A composite bundle does not identify an individual switch effect.
- Distinguish known failure, unknown follow-up and unsupported measurement. Timing-invalid evidence may still establish progress; do not invalidate unrelated facts automatically.

## Review judgment-heavy dimensions

Use blinded independent review where possible and calibrate graders against the operator-adjudicated examples before large-scale grading. Record disagreement and adjudication, including ambiguous/no-opportunity cases. The player/model under evaluation does not grade itself. Deterministic checks establish native facts; contextual reviewers assess tradeoffs and chains of behavior. They do not override game truth.

Grade all relevant opportunities or use a declared sampling rule including failures, ordinary cases and contrary evidence. Avoid cherry-picking brilliant moves. Keep repeated battles/navigation distinct from repeated inappropriate failed actions. Training can be useful without an immediate story milestone.

Separate local UI recovery from resumed task progress, and detector-trigger association from causal assistance benefit. Recovery episodes need boundaries and non-overlapping cost accounting; unresolved episodes remain censored. Report episode frequency, recovery duration, recurrence and aggregate observed episode cost without pretending every intervening second was avoidable.

## Measurement availability

Mark each field measured, proxy, projected or unavailable. Input/output/reasoning/cache counts remain separate, with tokenization limitations disclosed. Dollar/energy numbers require actual measurements or explicit estimates. Account for asynchronous overlaps when decomposing wall time. The Codex file bridge's waiting latency is not pure API inference latency and its zero usage counters are unavailable usage.

Maintain an implementation/coverage map before publishing grades. This specification does not make unsupported metrics, historical raw memory or badge/capture predicates exist.
