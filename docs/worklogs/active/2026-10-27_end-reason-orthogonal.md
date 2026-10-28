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
- [x] GREEN COMMIT: `fix(viewer): make how a run ended orthogonal to whether it counts` (d3bad2285)
- [x] Review round 1 (packet 47f0ff2d…): GPT BLOCK (run-analysis skill voids rounds by end reason; log-rank censors at cap), fallback BLOCK (aborted trials scored as misses; never-began trials fabricated as observations; replaced slots double counted), Claude BLOCK (same two + died-without-run_end runs off frontier/history; stale re-run docs; launch error over a complete run forced invalid; gateway-outage slot burn). Accepted and fixed: operator-ended censoring in fixed analysis (Fisher/M-W only once reached; log-rank censored at run_end wall_ms), never-began trials listed with no observation, unresponsive runs frontier-eligible, launcher error keeps a begun run's outcome, docs/power.py/persona wording, comments. Process note: these review-fix tests were written before the code but not committed RED separately. Open for the operator (not decided here): halt a lane after K consecutive gateway/crash outcomes; legacy valid:false rows plus their already-run replacements both count; config-mismatch runs counted under the planned arm; strict feature history needs run_end.
- [x] Review round 2 (packet 8db11e68…, merged main 36cd62ead as e9f6f5a0f): Claude LGTM, fallback LGTM, GPT BLOCK (pokebench-review skill/frontier.mjs still drop unresponsive runs; expanded legend says flagged runs never count). Fixed both, plus minors: config-mismatch + launcher error keeps its own reason; laneBackoff matches suffixed crash reasons; legacy-row test asserts the Mann-Whitney input.
- [x] Review round 3 (packet f1e688e8…): Claude LGTM, GPT BLOCK (adopted trials skip lane backoff — pre-existing, fixed with RED test; experiment-design + harness-ablation docs still allowed replacing begun outage trials — fixed), fallback BLOCK (protocol wording censored every early ending while code censors only operator stops/aborts; run-analysis provisional rule applied to crashes — both aligned to the code: only operator endings censor). Claude nit: checkpoint-frontier wording.
- [ ] Review round 4
- [ ] Land ff-only; 8790 if slot #1; live check
