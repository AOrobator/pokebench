# Refused navigation says why; the delivered state keeps its walkability; cut-off notices count themselves

## Problem Statement

The live bundle run `2026-11-02T02-55-21_hyperqwen-gpu0_07a7` spent turns 254–290 at `(39,62)` on ROUTE104 asking `navigate_to_target` for the PETALBURG WOODS door at `(32,42)` and was told, six times, only `Semantic navigation: no supported route to a valid approach`, while the doors at `(10,38)`/`(11,38)` and the house at `(17,50)` — all reachable on foot — were never tried. The same run also hit the 8,192-token cap thirteen times without a tool call, six of them on that same target. Three separate defects produce that shape:

1. **The delivered state carried no walkability, so the readout could not mark the door.** `read_game_state` computes `exit_reach`, `surf_gate` and `field_obstacles` on every read, and then `player_map_visibility.MapMemory.project` → `_filter` assigned `None` to all three, next to the place labels it drops on purpose. Every `state` event in the run (28,000+) therefore reached the agent without a reachability verdict, and "Exits here you have not taken" could not say an exit was not walkable. Replaying that run's own `raw-ram` snapshots through `read_flood_inputs`/`read_full_map`/`MapMemory.project` (`~/.hermes/cache/scratch/flood_live2.py`) reproduces it: the flood is computed correctly and then thrown away by the projection. The flood was never the problem.
2. **A refused `navigate_to_target` named no cause and offered no alternative**, while `navigate_to` for the same map names the reason and lists walkable exits. The refusal path in `semantic-navigation.ts` (`choice === undefined`) built its sentence from `base` only.
3. **The cut-off notice repeated one sentence.** `cut-off-reply-feedback-v1` said the same thing on the fifth cut-off as on the first, so nothing distinguished the second attempt in a row from the first.

## Skills Loaded

- `pokebench-agent-workflow` (worktrees, gate ladder, landing order, live-run rules)
- `.claude/skills/feature-worklog` (this layout)
- `.claude/skills/feature-switch` (switch checklist)
- `.claude/skills/pokebench-trace-forensics` (read-only forensics on `07a7` that produced the numbers above)

## Architecture

**Env (`env/pokebench_env`) — both arms, no switch**

- `player_map_visibility.py::_filter` keeps `exit_reach`, `surf_gate` and `field_obstacles` on the projected state. All three are derived from `map_grid`/`topology`, which the projection already delivers, so nothing new is disclosed; the *place labels* (`exit_labels`, `exit_sections`) stay dropped. No new switch: a state that says an exit cannot be walked is the truthful state, and the missing field is what let the agent walk at a sealed wall for thirty turns.

**Agent (`packages/agent/src`) — new switch `semantic-refusal-reasons-v1`, ON in both arms**

- `semantic-navigation.ts` — `refusalDetail(state, target, options, features)` builds `{cause, alternatives}`: the cause is the flood's verdict for the requested point (`cannot be walked to from (x,y) on foot or across water…`, or `no walkable way on this map leads from (x,y) to the NORTH edge` for a connection); the alternatives are up to three warps on the current map with `exitReach === "foot"`, ordered by `planNavigation` steps, each rendered `(x,y) (N steps) into map M/D`. With none, the sentence says so. The `choice === undefined` branch appends `: ${cause}` and the alternatives clause; `withStatus` carries `refused:true, refusal:{cause, alternatives}` on `details.semantic_navigation`. The warp alternative filter is `cutOf(x,y) === null` — a warp that needs Surf is not offered as walkable.
- `events.ts` / `recorder.ts` / `schemas/events.v1.json` — `SemanticReceiptSchema` (closed) gains optional `refused` and `refusal`, and `semanticReceipt()` forwards them only when `refused === true`. Optional, so every recorded run still validates. Not `is_error`: that flag means tool-layer failure and eleven ledgers gate on `!is_error` — `refusal-ledger.ts` (the "returned this reason N times" line), `disproved-beliefs.ts` (the refusal *is* the disproof) and `fixed-point-breaker.ts` all read refusals as data, and `trace.ts`/`request-metrics.ts` would paint them as failures.
- Provisioned in `features.ts` (last in `SWITCHABLE_FEATURES`, so no predecessor index moves), `play-preset.ts` (v2 schema key, default false, excluded from the v1-flag contract), `viewer/src/next-run.ts` (default false in a fresh draft) and `experiments/feature-configs/current.json` (`onInBoth` + `features` true). Registry dependency is `null`: the reasons fall back to a cause-only sentence when the flood is absent, so presets that turn `exit-reachability-v1` off still parse and still refuse honestly.

**Agent — `cut-off-reply-feedback-v1` escalation (no new switch, no model change)**

- `cut-off-reply.ts` gains `repeats`; the second and later notices in a row add `This is reply N in a row that reached the limit without a tool call…`, drop the invitation to plan, and ask for exactly one tool call (from the third, `observe` by name when the model cannot choose).
- `harness.ts` counts the streak (`cutOffStreak`, reset by any reply that calls a tool), and `cutOffNotice` becomes `string | ((repeats:number)=>string)`.
- `live.ts` passes a rule rather than a string.
- `decision-probe.ts` reproduces the streak when it rebuilds a conversation, so recorded and replayed contexts stay byte-identical; the recorded-notice prefix keeps using the run's own features.

**Cut-off recovery, second half — already there.** `fresh-retry-v1` (ON in both arms since 2026-11-01) already removes every reply that made no tool call from the next request, so the truncated text is not re-fed; the retry is a fresh sample plus the notice. No code change; pinned by a test so it cannot regress silently.

**Non-goals.** No thinking/reasoning-budget change, no raise of the 8,192-token cap, no harness-side `explore_map`, no agent-side reachability fallback, no change to lane A or the live run. `onInBoth` for the new switch, not a switch.

## Invariants

| ID | Invariant | Rationale | Test strategy |
| --- | --- | --- | --- |
| INV-1 | The projected state carries exactly the reachability the raw state computed | The nulled flood is the whole stall | `test_exit_reach.py::test_projection_keeps_the_flood_verdict_for_the_delivered_state` over the recorded ROUTE104 snapshots |
| INV-2 | Place labels stay dropped while the verdict is kept | Disclosure | `test_player_map_visibility.py` (41 tests) unchanged and green |
| INV-3 | OFF reproduces today's refusal sentence byte for byte, and carries no receipt fields | Switch contract | `semantic-refusal-reasons.test.ts` OFF case |
| INV-4 | Every offered alternative is walkable on foot and is never the refused point | An alternative you cannot walk to is worse than none | Fixture `0e05:22544`: `(17,50)` (18 steps) first, `(32,42)` absent |
| INV-5 | The receipt fields are optional, so pre-existing ledgers still validate | Replay compatibility | `events.v1.json` regenerated; 5,380 agent tests green |
| INV-6 | The notice counts the streak and resets on a tool call | Repeating one sentence did not stop the repeats | `cut-off-reply.test.ts` Governor walk 1 → 2 → reset |
| INV-7 | A truncated reply is never re-fed on the retry | Fresh retry | `withoutTextOnlyReplies` dropped for a `length` stop |

## Security Review

- No credentials added or read; `.env` and provider keys untouched and not committed.
- ROM, saves and save states stay out of git; the new fixtures are the recorded JSON already in the tree (`fixtures/exit-reach-states.json.gz`).
- No new network calls, no shell strings, no subprocesses.
- No story conditions, flags, destination names or walkthrough hints are added to model-facing text (INV-4 is the guard): alternatives name coordinates the exits line already advertises, plus the map id and the step count.

## Milestones

**M1 — Delivered state keeps its walkability (env)**
- [x] Replay the live run's snapshots to separate "flood wrong" from "projection discards it" (`flood_live2.py`): the flood is computed, `_filter` nulls it
- [x] Test: projection keeps `exit_reach`/`surf_gate`/`field_obstacles` for the delivered state
- [x] Fix `player_map_visibility.py::_filter`
- [x] RED verified by restoring the three `None` assignments (test fails), then GREEN
- [x] `pytest tests/env/test_exit_reach.py tests/env/test_player_map_visibility.py` → 57 passed in 0.62 s

**M2 — Refusals carry a cause and walkable alternatives (agent, both arms)**
- [x] Tests: OFF byte-identical; ON cause + nearest-first alternatives; connection edge cause; no-alternative sentence; registry
- [x] RED verified by suppressing `refusalDetail` (3 of 5 tests fail), then GREEN
- [x] `semantic-navigation.ts`, `events.ts`, `recorder.ts`, `schemas/events.v1.json`
- [x] `features.ts`, `play-preset.ts`, `viewer/src/next-run.ts`, `experiments/feature-configs/current.json`

**M3 — Cut-off recovery without touching the model**
- [x] `cut-off-reply.ts` escalation, `harness.ts` streak, `live.ts` rule, `decision-probe.ts` replay parity
- [x] Tests: pure notice (1/2/3), Governor walk and reset, truncated reply not re-fed

## Gate figures

Recorded on `claude/refusal-reasons-and-reachability` at the commit below, after `pnpm -r build` and `node packages/agent/dist/schema.js`.

- `packages/agent` vitest: **5,380 passed (5,380)**
- `packages/viewer` vitest: **2,407 passed of 2,425**; `src/panels.test.ts` aborts its worker (`SIGABRT`) after 216 of 234 tests **and does the same on clean `main` at `8aad2e998`** — pre-existing, reproduced in `/Users/user/dev/pokebench/packages/viewer`
- `env` pytest: `test_exit_reach.py` + `test_player_map_visibility.py` → **57 passed in 0.62 s**
- `pnpm -r build`: exit 0; `schemas/events.v1.json` regenerated (25 added lines)
- `just test` / `just lint` / `just coverage` were **not** run: the live run `2026-11-02T02-55-21_hyperqwen-gpu0_07a7` is still executing from the main checkout (agent PID 48581, game server on 8075), so `dist` must not be rebuilt there. Landing is src-only; the post-merge full gate is deferred and must be run when the run ends.

## Session Log

- Base: `main` @ `8aad2e998`. Worktree `/private/tmp/pb-refusal-reach`, branch `claude/refusal-reasons-and-reachability`.
- Forensics on `07a7` (read-only, run untouched): 28,000+ `state` events without `exit_reach`; `"exit_reach"`/`"not reachable on foot"` 0 hits in the log; six identical refusals on `(32,42)`; thirteen `max_tokens` retries.
- Falsified first hypotheses: `surf_gate.py:95`, `map_observability`, `_layout` buffer size (`test_exit_reach.py` 14/14 green with the ROM); `is_error=true` for refusals (11+ ledgers gate on `!is_error`).
- B's feature was first written as `navigation-refusal-reasons-v4`, which the versioned-stack test read as superseding v3; renamed `semantic-refusal-reasons-v1` because it is a different lineage (both arms, no `exit-reachability-v1` dependency).
- Registry pins touched by the new switch: `features.ts` (`SWITCHABLE_FEATURES` tail, `FEATURES` tail, `playHarnessFeatures` tail), `play-preset.ts` (v2 schema, v1-flag exclusion, `legacyFlagFeatures`), `viewer/src/next-run.ts` (fresh-draft default), `warp-target-navigation.test.ts` (`length-1` → `length-2`). Inserting the id anywhere but the tail moved other features' pinned indices; the tail is the only position that keeps them.
- `decision-probe.ts` needed two notice resolvers — the probed features and the run's recorded features — because a probe flips `cut-off-reply-feedback-v1` to check both answers while the supervisor-replay prefix must stay what the run actually sent.

## Surprises

- The flood was never wrong. Every earlier read of the run pointed at reachability computation; replaying the run's own snapshots showed the computation is correct and the *projection* discards it. The regression is a `None` assignment in a visibility filter, not in `surf_gate.py`.
- `is_error=true` looked like the obvious way to mark a refusal. It is not: three ledgers treat a refusal as data, and two viewer surfaces would call it a tool failure.
- `fresh-retry-v1` already implements the "stop re-feeding the truncated reply" half of cut-off recovery; only the notice was missing.
- The viewer's `panels.test.ts` worker crash (`SIGABRT` at 216/234) predates this branch and reproduces on clean `main`; it is not attributable to the recipe key added here.
