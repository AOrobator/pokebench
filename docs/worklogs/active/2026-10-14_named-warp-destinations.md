# Named warp destinations

Requested by the operator in the "rival house" thread (2026-10-14): "yes let's do that fix, it has potential."
Branch `claude/named-warp-destinations`, worktree `/private/tmp/pokebench-warp-names`, cut from main `224ee68`.

## Problem Statement

In the Think Fast 2x2 (`factorial-2x2-think-fast`, trials 01–09), every run restates Mom's line
"PROF. BIRCH ... lives right next door" (`pokeemerald data/maps/LittlerootTown_BrendansHouse_1F/scripts.inc:313`)
and then rewrites it as "go to Birch's lab". The readout never contradicts that, because doors are
listed only by number:

```
Warps: (14,8) -> map 1/2 [door: ...], (5,8) -> map 1/0 [...], (7,16) -> map 1/4 [...]
Warp to map 1/2 at (14,8), elevation 0; movement; ...
Mays House Sign at (12,8), elevation 3; A; conditional
```

The model guesses what "map 1/2" is: one run called it "Birch's Lab" 61 times, others "Route 101".
After walking in, three of seven entrants decided they were in the wrong building and left to keep
looking for the lab, so only 4 of 9 met May. The game already knows the destination's name; the
model only sees it after the transition (`Location: LITTLEROOT TOWN MAYS HOUSE 1F`).

Fix: name each warp's destination with the same map name the Location line uses after arrival,
for example `(14,8) -> LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2)`. No story hints, no sign-to-door
inference, no mention of Birch or May beyond the game's own map name.

## Skills Loaded

feature-switch, feature-worklog, feature-explainer, experiment-queue, pokebench-game-state,
pokebench-patch-evaluation (readiness), multi-model-review (local-inference-stack).

## Architecture

- New switch `named-warp-destinations-v1` (group: observation, needs `live-map-v1`; default OFF).
  It is server-applied, so it joins `SERVER_FEATURES` in `features.ts` and `env/pokebench_env/readout.py`
  and the Python default-off list.
- Name source: `GameState.destination_names`, which `MapNames` already builds from the game's
  `map_groups.json` and each `map.json` id. The Location line uses the same `MapNames`, so the
  name shown before a door equals the location read after it. Unknown ids (the `unknown map g/n`
  fallback) and dynamic warps (127,127) keep today's text.
- `format_readout(..., named_warps=False)` keyword, like `named_interactions`; the observation route
  passes `"named-warp-destinations-v1" not in off`, so every existing caller stays byte-identical.
- Rendering, ON only:
  - `live_map._details` Warps line: `(a,b) -> <NAME> (map g/n)`; dynamic warps unchanged.
  - The explanatory sentence becomes "Warp destinations name the map you arrive on, with its
    group/number ID in brackets; they are not warp indexes."
  - `world.py` interaction candidates: `Warp to <NAME> (map g/n) at (x,y) ...` when named
    interactions are on, and `; destination <NAME> (map g/n) warp w` either way.
  - Applies to both the 15x15 local map and the whole map (full-map-navigation-v1).
- OFF: byte-identical readout to today.

## Invariants

- INV-1 OFF is byte-identical. Test: golden readouts of recorded Littleroot and Route 101 states
  compare equal with the switch off.
- INV-2 Names come only from the game map table. Test: for every Littleroot/Oldale/Route 101–104/
  Petalburg/Rustboro warp in fixtures, the ON name equals the Location string the run later recorded
  on arrival (taken from recorded events, not hand-written).
- INV-3 Unknown or dynamic destinations never get a guessed name. Test: (127,127) and an id absent
  from the enum keep their old text.
- INV-4 The vendor stays unmodified (`just verify-vendor`).
- INV-5 Only the switch changes the readout. Factory test: preset ON reaches the server feature list;
  removing the wiring once turns it red.

## Security Review

Readout text only. No new inputs, subprocesses, network or file paths. The ROM is untouched.

## Milestones

**M1 — Switch and named destinations**
- [x] Write tests: INV-1 to INV-5, registry counts, preset normalization, legacy harness-feature lists
  (`env/tests/env/test_named_warps.py` 9 tests; features/play-preset/next-run TS tests). RED: TS 2 failed,
  Python 9 failed (1866 pass).
- [ ] COMMIT: `test(readout): warps name their destination map behind named-warp-destinations-v1 (RED)`
- [ ] Implement registry, preset, server feature, `map_name`, Warps line, interaction candidates
- [ ] Gates: `just test` (TS + Python counts), `just lint`, `just build`, `just coverage` (≥90 both stacks), `just verify-vendor`
- [ ] COMMIT: `feat(readout): warps name their destination map (GREEN)`
- [ ] Smoke: `just smoke` style session from the CLOCK_SET checkpoint, outside the house, ON vs OFF readout captured
- [ ] Multi-model review loop until clean

**M2 — Explainer and pending experiment**
- [ ] Explainer with before/after readout diagram (feature-explainer), mapped in `FEATURE_EXPLAINERS`
- [ ] `experiments/named-warp-destinations.json` as pending: incumbent with this switch flipped, activation
      milestone `MOM_RIVAL_INSTRUCTION`, graded on `RIVAL_HOUSE_ENTERED` and `RIVAL_MET`; readiness verdict in
      `docs/experiments/readiness.md` (leaving home is 8/8 in the 2x2, so readiness should pass)
- [ ] Gates and review

**M3 — Landing (ASK USER)**
- [ ] ASK USER: approve local merge into main
- [ ] Merge, rerun gates on main

## Closing the Loop

Done when the switch is on main, OFF is proven byte-identical, the explainer is linked, and the
experiment is pending (or queued if readiness passes). No measured runs start without the operator.

## Session Log

- 2026-10-14: discovery from recorded 2x2 runs and source. Worklog drafted; approved ("yes").
- 2026-10-14: found `world-destinations-v1` overlap; operator chose the inline switch anyway and asked
  that its experiment be queued ahead of the world-destinations experiment.
- Baseline in worktree at 224ee68: TS agent 1037 + viewer 573 pass; Python 1866 pass.

## Surprises

- 2026-10-14: `world-destinations-v1` already names warp destinations from the game's own
  `map_groups.json` (`game_state.py` `MapNames`), printing `Warp destination at (14,8): LITTLEROOT TOWN
  MAYS HOUSE 1F` plus map bounds and connections. It was OFF in every 2x2 arm and is registered as a
  READY pending experiment (`experiments/world-destinations.json`). Its only prior test was bundled with
  A* in a from-boot n=4 block. Paused before RED to ask the operator whether to test it as-is or
  build the inline variant.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive this worklog
