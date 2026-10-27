# End reason is orthogonal to inclusion

Operator rule (the operator, 2026-10-27 7:05 PM NY): "whether a trial has been aborted should be completely orthogonal from if it is included in a particular run. I want exclusions to be very purposeful and intentional. I don't want you just excluding random shit for made-up reasons."
Follows docs/worklogs/active/2026-10-27_aborts-included.md (landed 377890434), which made `just exclude-run` the only explicit exclusion.

Feature switch: not required (results/reporting and experiment bookkeeping; nothing the model sees or does changes).

## Automatic exclusions found on main 1b7ae8b96 and the decision

| Site | Keyed on | Before | After |
| --- | --- | --- | --- |
| fixed-ledger classifyTrial | operator_stop / operator_abort | invalid, replaced, excluded from analysis + workbench | valid outcome, no replacement, no lane pause |
| fixed-ledger classifyTrial | crash, gateway model_error, died without run_end | invalid, replaced | valid outcome, no replacement; lane backs off (operations only) |
| fixed-ledger classifyTrial | no run_start / plan mismatch / launch failure | invalid, replaced, excluded | still invalid for scheduling (replacement); included in analysis and workbench, listed as flagged for the operator |
| fixed-analysis analyze | valid flag | invalid trials dropped from every test | every launched trial counted; flagged list |
| workbench-store | ledger/receipt failures: Infrastructure outcome, Launcher outcome, Invalid fixed-run trial, Unverified ledger | run.excluded (off frontier) | run.flag (included, dotted, labelled) |
| frontier invalidTrial | those labels | dotted overlay, never frontier | dotted overlay, still frontier-eligible |
| runs.ts baselineOf | human operator_abort | refused as human baseline | allowed |
| trace-forensics skill | infrastructure class | "exclude from behavior conclusions" | keep counted, label as infrastructure |
| run-analysis / experiment-design / fixed-run-launch / close-the-loop skills, grading-protocol | invalid/replace wording | updated |

Kept and listed for the operator (not end-reason): probe sessions (recorded `probe` feature), runs with an unreadable/invalid event log (`problem`), unfinished human sessions as baseline, fixed-run-launch tainted-cohort procedure moving runs to runs/aborted.

## Milestones

- [x] RED: `test(viewer): reproduce end-reason exclusions in fixed runs, frontier and baselines` (aa5408b8a), 27 failing in 7 suites
- [x] GREEN, docs, gate: agent 4570/4570 (3 5s-timeouts under load avg 55 on one pass; pass in isolation, no agent diff), viewer 2085/2085 cov 95.81/91.69/95.31, pytest 4431 passed cov 97.47/93.58/100, trainer-card 3/3, lint clean (tsc, eslint, ruff, mypy)
- [ ] Review: Claude + GPT + fallback (Grok waived)
- [ ] Land ff-only; 8790 if slot #1; live check
