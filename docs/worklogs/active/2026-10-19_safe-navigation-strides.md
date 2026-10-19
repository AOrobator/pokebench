# Safe navigation strides

## Problem Statement

The operator explicitly requested fixing the navigation interruption, diagnosing zero-travel calls, and explicitly planning and validating safe long strides. Frozen last-50 audit: 4,298 calls, median sampled travel 2, 1,519 unexpected-movement stops. Latest turn135 has a viable 32-command detour but runs four tiles before the executor rejects a two-tile running input. Improvement target: median travel >=4 tiles (2x frozen baseline); this is a target, not a measured claim or authorization to approve experiments.

## Skills Loaded

feature-switch, agent-observability, pokebench-game-state, feature-explainer, experiment-queue; repository execute-worklog/close-the-loop and cloud review contract for checks. User authorization covers this concrete repair and its native engineering verification. No measured cohort, queue approval or live campaign alteration.

## Architecture

One cohesive repair milestone. A default-OFF safe-navigation-strides-v1 switch selects a bounded corridor executor. A* still chooses a route to the model-selected coordinate. Plan at most eight consecutive plain-floor tiles, with unchanged elevation and no turn, warp, object, script coordinate or unknown geometry. The native frame owner rechecks current map, position, controls and next-tile geometry before each step, releases direction while the avatar moves, and finishes only at a stationary corridor endpoint. This avoids a time-held input overrunning a bend. Unsafe/special steps use ordinary walking with running disabled and stationary preconditions; they retain existing planner rules. Every new stride has a recorded plan and terminal receipt, plus actual native input history. OFF retains incumbent bytes and behavior.

## Invariants

- INV-1: no game-memory/save/vendor writes; all movement through ordinary native inputs.
- INV-2: destination remains model-owned; no semantic retargeting or exploration policy bundled into this switch.
- INV-3: accepted movement belongs to the planned straight corridor, never past endpoint; failed validation emits no new direction and stops.
- INV-4: no direction during native in-flight movement, external UI, scripts, battle, unknown state, or changed map; bounded frame budget and explicit terminal receipt.
- INV-5: fresh per-step tile/object/warp/script/elevation validation; turn/ledge/grass/edge/transition boundaries split strides.
- INV-6: exact OFF factory/tool/readout/action invariance; default OFF; pending unapproved experiment.
- INV-7: preserve frozen raw logs and distinguish sampled travel, native correctness proof, tests, reviews, landing and measured performance.

## Security Review

Strict internal request validation, bounded path <=8, fixed native frame budget, unique IDs with bounded retained receipts, refuse concurrent queue admission. Internal marker inputs never reach emulator. Native reads fail closed. Same loopback-only server policy; no arbitrary file/memory operations.

## Milestone

- [ ] RED: planner boundaries, running two-step regression, stationary/end-point and dynamic safety tests; production factory OFF/ON and recording delivery.
- [ ] GREEN: bounded planner/native execution, default-OFF registration, pending experiment and tracked diagram explainer.
- [ ] Verify: meaningful deletion mutations; native ROM separate excluded probe; full tests, >=90% both stacks, lint, build, pristine vendor, schema and experiment validation.
- [ ] Frozen cloud Claude/Grok/GPT review; local landing only on exact reviewed/gated tree and repository rules.
- [ ] Show operator explainer and report update with zero-call taxonomy, safe stride evidence and honest 2x target status.

## Closing the Loop

Use owned separate native checkpoint probe; no measured session input/reload/restart. Record native accepted input and raw RAM, exact endpoint and turn/goal/hazard boundary checks. A recorded-route rehearsal can establish execution continuity, not model-policy benefit. Actual median improvement requires an operator-approved comparison on one build/start/budget; never claim it from deterministic tests.

## Session Log

- Worktree created from clean main 64ca188a at /Users/user/.codex/worktrees/safe-navigation-strides/pokebench; branch codex/safe-navigation-strides. Shared viewer worktree has unrelated capture work and stays untouched.
- Read-only zero-call census: 1,021 zero calls;901 refusal/blocked/no-path,61 interface/control,25 wrong-map,11 battle,11 map transitions,6 arrivals,6 errors. Raw calls remain immutable.
- Source reference pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 clean. Existing running reader and live-map decoder own verified US-ROM offsets.

- RED commit51f4d7a5: two planner tests fail because planStride does not exist; captured runs/strides/red-planner.log.

## Surprises

None yet.

## Multi-Model Review Log

Pending implementation and gates.

## Boy Scout Log

No unrelated cleanup.

## Archive Milestone

User-gated; not requested.

### Candidate integration checkpoint

- Planner/factory tests pass, including full production recorder plan and terminal-text delivery; native controller tests cover stationary motion, endpoint, changed floor/object/script/elevation/map/lock, cancellation, queue isolation and frame budget.
- Native final diagnostic completed all twelve calls (six fixed goals OFF/ON) from one owned checkpoint. Same sampled-travel calculation: OFF [2,3,3,0,2,2], median2; ON [8,25,12,0,5,1], median6.5. This is 3.25x in a deterministic engineering route matrix, NOT a model-policy result. Unreachable goal stays zero; one-tile goal does not overshoot. Logs/frames/raw RAM preserved under runs/strides; first diagnostic's post-completion script error and second diagnostic's already-acknowledged journal503 remain retained; final proof has terminal completed and no script error.
- Pre-sync gates: agent2586/viewer1265 tests pass via coverage, Python2770 pass; TS agent lines99.21 branches94.03 functions98.09, viewer lines97.60 branches90.92 functions93.68; Python lines97.01 branches92.53 functions100. Lint/build,123 experiment definitions,vendor and pages-check pass. Final small test-text lint fix follows the coverage pass; repeat affected gates after main sync.
- main advanced from64ca188a to0b5ad284 with the Wally repair/battle-refusal switch; integrate before frozen cloud review and preserve its behavior. This checkpoint is not reviewed or landed.

### Integrated gates and UI evidence

- Integrated main0b5ad284. Final coverage: agent2599 tests, viewer1267 tests, Python2784 tests; TypeScript line/branch/function thresholds and Python97.02/92.55/100 all pass >=90. Both lint stacks, build,123 experiment definitions, exact generated schema, pristine vendor and pages checks pass. Detailed logs: runs/strides/post-sync-* and *-final.log.
- Five performed delete/restore mutations (factory wiring, bend boundary, native moving release, live corridor validation, recorder plan delivery) each RED without the guard and GREEN after restoration. Receipts and source hashes: runs/strides/mutations/receipts.json. No skipped tests or weakened exclusions.
- Real browser: synthetic, explicitly labelled probe replay exposes the registered safe-strides feature card; its guide link opens the exact tracked guide. 1280/1440/375px closed/open screenshots inspected, no horizontal overflow; viewport reset. Screenshots: shared runs/mockups/safe-navigation-strides/shots. Synthetic replay is UI evidence only and is excluded from benchmark data.
- Twelve native raw archives re-parsed with current production reader and integrity checks. Six-goal native execution proof predates the final fail-closed unreadable-event-table guard and main sync; later guards have focused/full coverage. No claim that this is a model comparison or final-source native replay. Native logs retain source/dirty provenance.
- Cloud review pending. No measured cohort launched, no experiment queued/approved, no live campaign configuration changed.

### Round 1 triage and bounded fixes

- Packet base0b5ad284, head0f37e4eb, exact diffSHA256 cc3ce426c174a55394d6d84b6c00450ee51cc65c741ab4e2c6a0187c606edba1. PB1-PB13 all scored, zero FAIL. Packet/boundary/principles and full synthesis in runs/strides/review-r1.
- Claude CLI logged out; Cursor Opus4.8 and Sonnet5 both usage-limited, GPT Cursor usage-limited. Fresh no-history GPT6.1Sol equivalent reviewer and fallback Astra/Sol completed with BLOCKING. Reduced vendor diversity is explicit and cannot authorize self-merge. Grok was interrupted at306seconds with no output because consensus concrete blockers required a new packet; it is INCOMPLETE, never green. Preserve all failure receipts.
- Fix accepted: accepted stride POST response loss/JSON failure skipped cancellation. Regression tests first failed (cancel count0 vs1), then expanded the existing cancellation try/catch over submission/response/queue; same known ID cancellation now passes. Ordinary OFF behavior unchanged. No new owner/domain/config/API added.
- Evidence fixes accepted: independently schema-valid receipt ID/origin/map/path/elevation/stopped/excess/incomplete mismatches; separate missing-map/tile/collision/behavior/elevation/object/warp/event-pointer/header/table/context/script/dialogue fixtures. Twenty-two one-guard delete/fail/restore mutations now recorded under runs/strides/mutations-r2; all RED then restored GREEN with source hashes. No new runtime behavior beyond the cancellation repair.
- Fresh native matrix on clean exact0f37e4eb completed all12calls: OFF travel [2,3,3,0,2,0], median2; ON [8,25,12,0,5,1], median6.5. Final OFF one-tile request changed maps, so sampled same-map travel is zero; candidate stops exactly at the requested one tile. Twelve raw archives match production reader/map/position. This supersedes the earlier pre-sync probe for source qualification, and remains engineering-only. Logs: runs/strides/native-frozen-*.
- Final post-fix gates: agent2609, viewer1267, Python2798 tests all pass. TS agent lines99.23 branches94.07 functions98.09; viewer97.60/90.92/93.68; Python97.06/92.65/100. Lint/build/schema,123 experiments and vendor pass. An initial Python invocation omitted POKEBENCH_ROM, yielding one failure/229 skips; corrected invocation with the external ROM symlink passed2798 with no skips, preserving both logs.
- Owned8097 native server and8858 synthetic UI viewer stopped after evidence capture; live campaign servers/checkouts untouched. Public guide includes source-qualified matrix and zero-call explanation.
- Round2 will review the cumulative candidate plus fix delta. Claude cloud quota remains a main-landing blocker under execute-worklog even if fallback lanes approve. No measured launch or runtime enablement authorized/executed.
