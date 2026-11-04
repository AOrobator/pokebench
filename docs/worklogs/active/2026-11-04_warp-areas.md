# Warp areas readout and boot-start checkpoints

Status: in progress.

Operator request (the operator via coordinator, 2026-11-04): a switched warp readout, on in both arms, that groups each map's warps by landing area, lists reachable and unreachable pads from the player's position, who is in each area and whether the run has visited it. Per-warp facts only, never a route. Also set POKEBENCH_CHECKPOINT_FRONTIER=1 for `just fixed-run` boot starts and commit the plain-run launch.sh that already sets it. Show the operator real rendered output before landing.

## Design

- `warp-areas-v1`, server switch, needs `exit-labels-v3`. Turn 1,533 of run 274b spent 13,252 of 38,156 characters on 15 `Warp destination at` lines that repeat each area's exit facts per pad.
- ON keeps one short `Warp destination at (x,y): LABEL` line per warp, because `blocked-exit-fact`, `no-exit-here` and `low-hp-trainer-warning` read those lines. The repeated detail moves to one block per landing area.
- Visits are tiles the server saw the player on this run (`AreaVisits`), tested against the area's section, so a section label change cannot lose a visit.
- Who is there comes from the ROM object list with hide flags applied. It is shown only for areas the run has been in: the standing no-foreknowledge rule says the harness does not name what the game has not shown.
- `exit_sections` JSON is unchanged, so no event schema or viewer read change.

## Milestones

- [x] M1 RED tests
- [x] M2 GREEN: readout, switch, config, fixed-run checkpoint env. Focused: 222 env tests, agent and viewer switch tests pass. Full gate pending the CPU window.
- [x] M3 Real render shown to the operator
- [ ] M4 Explainer, review lanes, landing

## Real render

Turn 1,533 re-rendered from raw RAM with the run's own visits: 22,342 to 16,462 characters; the OFF lines equal the recorded lines; pad groups match the approved table. Rustboro at turn 173: 31,279 to 30,682. The repeated caveat sentence moved to the header, so the three sampled maps shrink.

Wiring proof: replacing the observation factory's `area_visits` with None turned `test_every_observation_of_a_run_shares_one_visit_memory` red; restored, it passes.

COMMIT: `feat(readout): group warps by landing area (warp-areas-v1)` (9d5d0129a)

COMMIT: `test(readout): prove one visit memory per run; add plain-run launch.sh` (97a95400e)

## Gates

At 97a95400e: `just test` exit 0. `just lint`: `pnpm -r lint` passes, then ruff stops on 6 errors in adjacent_tiles.py, launcher.py and map_observation.py, files this diff does not touch (already on main). Changed Python files pass ruff, format and mypy; remaining mypy errors are the same map_observation line and mgba, which this worktree has not built. `just verify-vendor` OK from the main checkout at the same pin; this worktree has no submodule and the diff has no vendor change.

## Multi-Model Review Log

Round 1, packet 163a1c36f..97a95400e. Grok out of Cursor usage until 11/17 (standing rule: Claude, GPT and one fresh read-only fallback).
- Fallback (Sonnet subagent): LGTM.
- Claude BLOCKING, accepted: adding the variable to LANE_VARIABLES stripped it from plain runs too, so launch.sh's setting never reached the child. Added to PRESERVED_PLAIN_VARIABLES with a test. Also no proof boot trials get it: the env is now a pure `trialEnv` with boot and save-state tests.
- GPT BLOCKING, accepted: two unknown landings with matching text merged (they now stay separate); launch.sh embedded a model id (`--model` now required).
- Accepted hardening: unmeasured reach no longer prints as reachable. launch.sh header corrected.
- Rebutted: entrance-activation caveat applying to same-map pads (a caution, not a fact claim); "Been there" missing a section crossed between observations (understates only, documented in the explainer as tiles the server saw).

COMMIT: `fix(readout): keep unknown landings apart and never claim unmeasured reach` (7535cc36e)

Round 2, head 7535cc36e: Claude LGTM. GPT BLOCKING on one Fix: launch.sh checked and receipted `--port` but frozenPlay keeps a lane's port out of the child, so the run took 8000 regardless. `--port` removed; the script checks 8000, the port the run really takes. Skill text updated to the five forwarded variables. Partial reach under the Surf gate alone: follow-up, not reachable with the current recipe.

COMMIT: `fix(launch): plain runs take the default port, so launch.sh stops offering another` (26f6345b9)

Round 3, delta at 26f6345b9: Claude LGTM, GPT LGTM. Fallback LGTM at round 1. Grok out until 11/17.

- [x] M4 Explainer, review lanes

Landed on main at 76765799d (ff-only). `just land-join` failed on missing arguments and the merge went ahead; the board was empty, and join/done were recorded after. Post-merge `just test` exit 0. `just viewer-main`: viewer at 76765799d, parent launchd, 2 live gameplay processes kept, run 274b untouched.

Follow-up found: the plain-run preset `current-control-24h-8k.json` mirrors the recipe by hand and lacked the switch, so the next DeepSeek run would have run with it off. Added.

The operator 2026-11-04: "lgtm as is, just lint needs to be fixed tho, go for that". Unvisited areas stay unnamed. Fixed the six ruff errors that were on main: wrapped comments and a docstring, imported `Iterable`, one `noqa: S606` on the deliberate `os.execvpe` argv-list exec. No behavior change, so no switch.

Lint review round 1 at 2f7cdfcf0: Claude LGTM. GPT BLOCKING: unquoting the annotation changed runtime `__annotations__`. Fixed: quoted annotation kept, `Iterable` imported under TYPE_CHECKING.

Lint review round 2 at 6b3f4d81f: Claude LGTM. GPT BLOCKING only on the reworded docstring; rebutted (the only `__doc__` readers in env are two argparse module docs in other files), then GPT LGTM.
