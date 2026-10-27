# Aborted runs count in results

Operator rule (the operator, 2026-10-27): "aborted runs aren't automatically exclusions." An operator abort ends a run; its earned progress counts, unreached milestones are censored. A run leaves results only through an explicit operator exclusion with a reason, stored as `runs/exclusions/<run-id>.json` (never by editing the run log).

Trigger: GPT-6 Astra `2026-10-25T10-50-57_gpt-6-astra_429f` ended `operator_abort` at 11:23 PM NY 10/25 after Codex ran out of tokens; it reached PETALBURG_GYM_ENTERED with four badges.

Feature switch: not required. This changes results/reporting only (viewer, analysis, docs); nothing the model sees, its tools or execution changes (feature-switch skill: "not for pure measurement, viewer-only").

## Audit of abort exclusions (main 098c80c04)

- `history.ts` scoredRuns skipped `operator_abort` (kept `operator_stop`) → strict feature history dropped aborted runs. FIX.
- `controls.ts` ABORTED overlay said "excluded from results". FIX.
- `run-control.ts` header comment "excluded from results". FIX.
- `frontier.ts` dead "Excluded operator-aborted run" literal (setter removed in ac2701ef8). REMOVE; label "stopped early" → explicit "ended by operator abort".
- `fixed-analysis.ts` listed operator-stopped trials with infrastructure failures as excluded. FIX: own section, with progress.
- `fixed-ledger.ts` classifyTrial keeps `valid: false` for operator stop/abort: that drives runner replacement scheduling, not reporting. LEFT, flagged to operator.
- `runs.ts` aborted human sessions cannot be the human baseline: reference selection, not results. LEFT.
- workbench/frontier already keep aborted progress (ac2701ef8); cross-model extract.py treats aborted unreached milestones as U (censored) and keeps splits. OK.
- data-scientist persona "not aborted" eligibility; run-analysis skill census wording. FIX docs.

## Milestones

- [ ] M1 RED: run-exclusions, history, frontier, controls, fixed-analysis, workbench-store tests
- [ ] M1 GREEN: implementation, docs, 90% gate
- [ ] Review: Claude + GPT (Codex CLI) + fallback; Grok waived (down)
- [ ] Verify Astra 429f in workbench/frontier with headless screenshots
- [ ] Land ff-only via board; 8790 restart if slot #1; live check
