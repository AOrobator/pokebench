# Route summary

## Problem Statement

Qwen spends 10-41% of its output tokens hand-tracing the ASCII map grid to plan routes, for example run 6056 turn 121, where the readout already listed `navigate_to_target {"kind":"connection","direction":"WEST"}`. About half the redraws end in `navigate_to` to a hand-picked stepping stone; others worry about trainer sight on the route or whether an exit is reachable. The pathfinder and the trainer-sight check already know these answers.

The operator approved building this through the coordinator on 2026-11-07. One behavior switch, default OFF in both arms; The operator decides when it turns on. No run is relaunched.

## Skills Loaded

execute-worklog, feature-worklog, feature-switch, tool-prompt-sync, feature-explainer, pokebench-game-state (wording), close-the-loop, talk-to-codex.

## Architecture

- `packages/agent/src/route-summary.ts`: builds the block; `withRouteSummary` wraps observe, press, navigate_to and semantic walks around `withUntakenExits` and inserts it under the Position line.
- `plannedRoute` in `semantic-navigation.ts`: the route navigate_to_target would choose, using the same approach selection and script-trigger fallback as its walk.
- Sight comes from the existing `trainerSight` port. `check_route` reports only the first seen tile per trainer, so the out-of-sight search adds each seen tile as a blocked tile and replans, up to 16 server checks per readout, sharing seen tiles across the readout's routes.
- `guideRow` in `rayquaza-guide.ts`: a second `GuidePosition` observer gives the row in force; tiles count only when the row's map is the current map.
- Part B: `ROUTE_SUMMARY_SENTENCE` is in the block header and in the system prompt section behind the same switch. Tool descriptions and the tool list do not change.

## Invariants

- INV-1: OFF is byte-identical. `withRouteSummary` returns the same tool objects; the prompt has no sentence. Test: identity, readout bytes, factory test.
- INV-2: never claim "no route" when the planner refused for another reason. A locked field gives no block. Test: recorded locked aeb8 T416 state.
- INV-3: bounded. 12 lines, whole lines, "N more left out."; 16 server checks. Test: T319, T416, T654 and the check-cap test.
- INV-4: read-only. The sight check is the existing POST; nothing is recorded or pressed.

## Security Review

No new input surface. Coordinates in guide notes are authored data; the server's trainer fields are schema-validated by the existing parser.

## Milestones

**M1: route summary**
- [x] Write tests on recorded states (6056 T120, aeb8 T319, T416, T654, locked T416)
- [x] COMMIT: `test(agent): route summary on recorded states (RED)` (87bf42a11)
- [x] Implement, register the switch, prompt, wiring, explainer
- [x] Cheap checks: agent and viewer `tsc --noEmit`, eslint on changed files, route-summary 28 tests, features, preset, frozen-switch, play-config, panels, next-run and recipe tests pass. Deleted once and watched go red, then restored: the production wiring, the locked-field check.
- [x] Full gates in the window the coordinator granted, at 84cd54e21: `just lint` and `just verify-vendor` pass; `just test`: agent 2773 tests, viewer 1235, env 3051, gateway 38, `no-io-proof` OK, floors held (agent 67.68 lines / 58.7 branches / 61.83 functions / 62.33 statements; viewer 42.35 / 44.19 / 46.91 / 41.7).
- [x] COMMIT: `feat(agent): route-summary-v1 puts computed routes in the readout` (84cd54e21)
- [ ] Review
- [ ] Land

## Before and after

Run 6056 turn 120, Route 102, (34,14). Off, the block is absent and the model reads only the Exits line and the grid. On, under the Position line, with a fake sight server saying BUG_CATCHER sees (26..28,15) and the guide row `Beat Youngster Calvin at (33,14)`:

```
Routes from where you stand, worked out by the harness from the map. navigate_to and navigate_to_target find their own path around walls, ledges and water, so give the final tile or target, not stepping stones; you do not need to trace the grid.
- guide tile (33,14): 0 steps to (34,14) beside it, out of every unbeaten trainer's sight.
- WEST edge [navigate_to_target target {"kind":"connection","direction":"WEST"}]: 46 steps, crosses the sight of object 3, sprite BUG_CATCHER at (25,15); 46 steps out of their sight.
- EAST edge [navigate_to_target target {"kind":"connection","direction":"EAST"}]: 18 steps, out of every unbeaten trainer's sight.
- object 2 at (33,14) [navigate_to_target target {"kind":"object","local_id":2}]: 0 steps, out of every unbeaten trainer's sight.
- object 3 at (25,15) [navigate_to_target target {"kind":"object","local_id":3}]: 9 steps, out of every unbeaten trainer's sight.
```

Without the guide row or sight check, aeb8 T654 (Route 110) runs to the 12-line cap and ends `28 more left out.`; that readout's block is 1,433 characters and took 37 ms to plan.

## Evaluation

Activation is the operator's call. Test by comparing grid-tracing tokens and turns per map on a fixed-run design; merging registers nothing. Readiness: Qwen reaches Route 102 reliably.

## Open

- The tools walk the direct route, so a route out of sight is reported but not walkable in one call: `navigate_to` still refuses until `confirm_trainer_sight`, and reaching the sight-free route needs a tile of it. The brief asked for the step count only; naming a tile it passes through is a follow-up for the operator.
- `exit_reach` can say foot when the planner finds no route (aeb8 T654 warp (18,16)): its flood ignores people, the planner does not. The line says "no route navigate_to_target can walk from here", which is what the tool will do.

## Closing the Loop

Offline only, on recorded states; no run launched, no request to any model server.

## Session Log

- 2026-11-07: worktree `/private/tmp/pb-route-summary`, branch `claude/route-summary`.

- 2026-11-07: fa0034143 fixed N1, but its cap test still failed on an assertion tied to one state; the next commit corrects the test. Focused tests 83/83 after it.

- 2026-11-07: merged main; `features.ts` conflict on the rq-checkpoint-recovery text resolved to main's text plus this switch's entry.

## Surprises

- The no-I/O guard forbids reading gz fixtures from a test; a JSON module import is allowed, so the fixture is trimmed JSON.
- A locked-field readout made every line say no route; INV-2 came from that.

## Multi-Model Review Log

Round 1, frozen 5ad4882bc..84cd54e21, diff sha256 77822961d8f53b7dc2d4d9d288cbb9f83d17070918fda9e9a635df783700362c.
- Claude CLI: BLOCKING, three findings, all Fix: (B1) a listed step-on pad said no route because `plannedRoute` skipped the walk's `resolve`; (B2) a guide tile in sight could report steps out of sight, because the planner stopped beside it; (B3) a player who can Surf got "no route" where the walk goes to the shore. Also fixed from its and the fallback's notes: seen tiles kept per trainer, no check spent on a route of no steps, press and navigate_to wrapping asserted.
- Fallback subagent (Sonnet, read-only): LGTM.
- Rebut or follow-up: `semantic-navigation-v2` off leaves target words in the block (the boundary froze one dependency; scope), guide tiles on another floor of a same-named map (no failing row), sentence stronger than ledge and Surf switches guarantee (false only in a config with those off; both on in current).
- GPT lane: packet queued to a Codex session; The operator is deciding through the coordinator whether to waive it. Not landed.

Round 2, fix delta 84cd54e21..4aa65cd22, diff sha256 d8b95ecd98bf4fab49d36ba32881461ebf9627fc2e3506ee80ffb8f6b8af0ee3.
- Claude CLI: B1, B2, B3 closed; BLOCKING on one new bug from the B3 fix, N1: the out-of-sight search printed a shore leg as a finished route. Fixed next commit: it now says "no walking route out of sight". The check-cap test was also made to reach both wordings. Round cap reached: asking the operator through the coordinator.

Round 3, the one extra check the coordinator asked for, fix delta 4aa65cd22..bd4bcd2c8, diff sha256 536f2841a5745e671711d89e03dd53c2311342b25433a21c0f2b6f17b1eb3a50: Claude CLI LGTM, N1 closed.
GPT lane: The operator did not waive it (2026-11-07 9:41 AM). Final-head packet (1e26fed6c..fd87c4b03, sha256 6c01887c5823e0f4a39891a01eab17baf80665d366e9d2538e8df3d229b71756) queued to Codex thread "Compare Sol and Astra pricing"; waiting.

GPT lane round 1, Codex, frozen 1e26fed6c..fd87c4b03, diff sha256 6c01887c5823e0f4a39891a01eab17baf80665d366e9d2538e8df3d229b71756: BLOCKING, one finding, Fix: a way across water said "out of every unbeaten trainer's sight" when only the walk to the shore was checked. The line now says "as far as the shore; the water was not checked".

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER
