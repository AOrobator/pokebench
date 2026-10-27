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

- [x] M1 RED: run-exclusions, history, frontier, controls, fixed-analysis, workbench-store tests. COMMIT: `test(viewer): reproduce aborted runs dropped from results` (86ffbc2ea); 8 failing + missing module
- [x] M1 GREEN: implementation, docs. TS: agent 4540/4540, viewer 2069/2069; viewer coverage 95.8 lines / 91.63 branches / 95.29 functions; run-exclusions.ts 96.4/95.2/100. tsc+eslint+ruff clean. Python half rerun against main venv (worktree venv lacks mGBA; vendor submodule was uninitialized): see below.
- [x] GREEN COMMIT: `fix(viewer): count aborted runs in results; exclude only by operator file` (63dfa4c59)
- [ ] Review round 1 (packet sha256 25335ddd…): Claude lane (claude -p OAuth expired → Claude subagent) BLOCK, GPT (codex gpt-5.6-sol) BLOCK, fallback subagent BLOCK. Shared findings: abort_hold overlay still says EXCLUDED; feature history counts post-abort milestones as misses (must censor); fixed-cli analyze ignores runs/exclusions. All accepted. RED: `test(viewer): reproduce review findings on abort censoring and exclusions` (a0b73d379), 6 failing. GREEN: abort_hold text; ArmOutcome.stopped + eligibleRuns per-milestone denominator + note; analyze() takes exclusions, fixed-cli reads runs/exclusions. Full gate: agent 4540, viewer 2071, viewer cov 95.79/91.62/95.31; pytest 4431 passed, Python cov 97.47/93.58/100; trainer-card-check 3/3 (with POKEBENCH_CARD_ART=main runs/sprites; fresh worktree has no ROM-derived art); mypy clean with mGBA binding copied into worktree venv.
- [x] Review round 2 (packet 9fe5a2a7…): Claude subagent LGTM, fallback subagent LGTM, GPT BLOCK (analyze-receipt drops furthest; ignores exclusion problems). Accepted. Merged main c757402bd (docs-only) as e1cdfec0f. RED a-receipt test, GREEN fixed-cli; viewer 2071 passed, cov 95.8/91.64/95.31.
- [ ] Review: Claude + GPT (Codex CLI) + fallback; Grok waived (down)
- [x] Verify Astra 429f (scratch viewer :8797 on a symlink-only runs root; run dir untouched): status ended, reason operator_abort, excluded null, 133 splits, last PETALBURG_GYM_ENTERED, 4 badges, turn 2741, active 715:53.705; agent-frontier line; details + coverage notice 'Ended by operator abort (operator_abort)'. Screenshots runs/mockups/aborts-included/. Verify Astra 429f in workbench/frontier with headless screenshots
- [ ] Land ff-only via board; 8790 restart if slot #1; live check
