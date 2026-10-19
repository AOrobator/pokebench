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

## Surprises

None yet.

## Multi-Model Review Log

Pending implementation and gates.

## Boy Scout Log

No unrelated cleanup.

## Archive Milestone

User-gated; not requested.
