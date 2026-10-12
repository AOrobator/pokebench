# Resumed contextual-interface experiment

## Problem Statement
User said "ok lets resume the runs" after the reviewed objective type/error fix landed. Restart the approved three-per-arm/model experiment as a fresh matched cohort on current harness. The previous two launched trials remain separate: source changed and one was operator-aborted. Do not pool them into the new12-run comparison.

## Skills Loaded
Previously loaded feature-worklog and multi-model-review govern provenance and existing reviewed runtime. This resumption changes no production code or prompt.

## Architecture
Use normal agent play CLI, fresh boot,300turn/30minute cap, objectives enabled. Six paired waves; one run per endpoint. Qwen baseline/treatment/treatment/baseline/baseline/treatment; Swarm treatment/baseline/baseline/treatment/treatment/baseline. Only contextual-interface-docs-v1 differs between arms. Registered model identities discovered from existing local Qwen endpoint and gateway. One-shot supervisor and manifest are ignored operator receipts.

## Invariants
- INV-1: every trial shares one clean frozen current harness revision, budgets/tools/sampling/start. Validate actual run_start and retain prompts.
- INV-2: one active run/model endpoint, isolated game server/run folder; no gameplay intervention or silent retry.
- INV-3: every launched run visible live and retained with terminal reason, including failures; stopped prior cohort untouched and separate.
- INV-4: report N3perarm only if actually launched; median/range/DNF alongside counts, no statistical significance or inferred gym progress.

## Security Review
Normal argv launcher, configured external ROM reference and symlink only. Credentials read privately from existing endpoint config, never in argv/log. No runtime/preset/permission change or RAM writes.

## Milestones
**M1 — Resume current matched cohort**
- [x] Operator approval and worklog before launch
- [x] Current reviewed production build,897gates/selected-roster LGTM retained
- [ ] Discover endpoints, launch12normaltrials and verify viewer/live provenance
- [ ] Validate terminal logs, report observed results and reconcile worklog

## Closing the Loop
Tracked worklog and source freeze before launches. During runs update ignored runs/launch-receipts/interface-docs-resumed/progress.md and observer-notes.md so later trials stay clean and samecommit. Reconcile here after terminal outcomes. User instruction authorizes12plannedtrials under previously approved protocol. No new naming skill/navigation/retry policy.

## Session Log
2026-10-12: both requested registered models available;8061/8062free, viewer8791listening. Qwen auto-unloaded; existing supervisor warms registered model before measured start and records warmup separately. Reviewed productionf63d7a5, closeoutc4e3cdb. Newcohort required after NEW_GAME_CREATED and type/error fixes; old5d0f/0893 remain original failed/aborted observations, not current controls.

## Surprises
None in newcohort yet. Prior type trap fixed and independentlytested; resumption makes no efficacy claim.

## Multi-Model Review Log
No production/prompt changes in resumption. Reuse reviewedf63d7a5, allfive selectedLGTM with documented Claude availability fallback;897tests/gates in objective-types-review. New documentation/one-shot scheduling receipts do not add model-visible helpers.

## Boy Scout Log
No unrelated changes.

## Archive Milestone
- [ ] ASK USER: archive worklog after closeout.
