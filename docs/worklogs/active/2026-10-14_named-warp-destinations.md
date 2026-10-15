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

- INV-1 OFF is byte-identical. Test: OFF readouts (local and whole map) equal goldens rendered by
  env/pokebench_env at 224ee68 from the same memory fixture (`fixtures/named-warps-off-*-224ee68.txt`).
- INV-2 Names come only from the game map table. Test: with the vendored map table, the warp's ON
  name equals the readout's own Location line for that map; Littleroot door ids 1/0, 1/2, 1/4 resolve
  to the names the 2x2 runs recorded on arrival.
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
- [x] COMMIT: `test(readout): warps name their destination map behind named-warp-destinations-v1 (RED)` (ff9b891)
- [x] Implement registry, preset, server feature, Warps line, interaction candidates, guidance sentence
- [x] Gates: `just test` TS agent 1039, viewer 573, Python 1875 all pass; `just lint` clean; `just build` ok;
  `just coverage` agent 97.4/93.9/98.0/98.9, viewer 94.9/90.5/93.7/97.7, Python lines 96.72 branches 91.93
  functions 100 (touched files: world 100, live_map 99, readout 98 with pre-existing gaps only);
  `just verify-vendor` OK.
- [x] Guard check: deleting `named_warps=` in observation.py turned `test_observation_route_applies_the_switch_from_env`
  red; removing the id from TS `SERVER_FEATURES` turned the registry and Python list-match tests red. Both restored.
- [x] COMMIT: `feat(readout): warps name their destination map (GREEN)` (c08c0c6)
- [x] Smoke: launcher from CLOCK_SET.state on 127.0.0.1:8197 with the switch on, walked 2F → 1F → Littleroot.
  Outside: `(14,8) -> LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2)`, `(7,16) -> LITTLEROOT TOWN PROFESSOR BIRCHS LAB
  (map 1/4)`, candidates `Warp to LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2) at (14,8)`. Capture in
  `runs/named-warps-smoke-on2/littleroot-on.txt`. OFF bytes are covered by unit tests.
- [ ] Multi-model review loop until clean

**M2 — Explainer and pending experiment**
- [x] Explainer `docs/explainers/named-warp-destinations-v1.html` (Littleroot door diagram, exact OFF/ON
      readout from the live smoke, map-table grounding, wiring, overlap with world-destinations), README entry,
      `FEATURE_EXPLAINERS` mapping, panels/server tests (viewer 574 pass)
- [x] `experiments/named-warp-destinations.json` with `queuePosition` 4, ahead of the unpositioned
      world-destinations entry (operator). Activation `FIRST_TRUCK_EXIT`: the truck's warps are dynamic
      (pokeemerald InsideOfTruck/map.json `MAP_DYNAMIC`) and stay unnamed. Graded on `RIVAL_HOUSE_ENTERED`.
      Incumbent copied from fresh-retry plus this switch OFF. Readiness READY in `docs/experiments/readiness.md`.
      The queue CLI reads main's checkout, so the entry appears in `just experiments` only after landing;
      loaded from the worktree it validates with no problems.
- [x] COMMIT: `docs(explainers): named warp destinations explainer and queued experiment` (5d42f8b)
- [ ] Live viewer click-through of READ EXPLAINER (after landing; the shared viewer serves main)
- [ ] Gates and review (round 2 covers 5ae6acb and this commit)

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

- The worktree venv lacked the mGBA binding, so mypy failed on `mgba._pylib`; copied the read-only
  binding from main's venv as other worktrees do. Port [local inference port] was already taken; smoke used 8197.

- 2026-10-14: `world-destinations-v1` already names warp destinations from the game's own
  `map_groups.json` (`game_state.py` `MapNames`), printing `Warp destination at (14,8): LITTLEROOT TOWN
  MAYS HOUSE 1F` plus map bounds and connections. It was OFF in every 2x2 arm and is registered as a
  READY pending experiment (`experiments/world-destinations.json`). Its only prior test was bundled with
  A* in a from-boot n=4 block. Paused before RED to ask the operator whether to test it as-is or
  build the inline variant.

## Multi-Model Review Log

**M1 round 1** (packet `git diff --binary 224ee68 c08c0c6`, SHA-256 7639bdfc…d9677; boundary and principles
in `runs/named-warps-review/`). Principles self-review: no FAIL rows.
- Lane availability: Claude CLI reviewer profile `~/.claude-review` not logged in; Cursor
  `claude-opus-5-thinking-high` and `gpt-5.6-sol-xhigh` hit Cursor usage limits (reset 10/17); Codex
  `gpt-5.6-sol` usage limit (reset 10/20), other Codex models unsupported on this account. Standing
  subagent fallback used for the Claude and GPT lanes: Opus and Sonnet read-only subagents. Reduced
  vendor diversity: Grok is the only non-Claude lane.
- `think_fast` / `think_swarm` endpoint lanes deferred: think-fast is the model under measurement in the
  running factorial chain, and review traffic would perturb measured trials. Run them when the chain is idle.
- Cursor `cursor-grok-4.5-high`: VERDICT: LGTM (hardening: stronger INV-2, dynamic Warps-line case, wording).
- Opus subagent: VERDICT: BLOCKING — B1 OFF guidance sentence not pinned to pre-patch bytes; the OFF test
  compared new code to itself. Independently confirmed 18 OFF renders equal 224ee68 out of tree.
- Sonnet subagent: VERDICT: BLOCKING — same gap; a mutated OFF sentence survived the suite.
- Accepted fixes (test-only plus wording): OFF goldens from 224ee68 for local and whole map, exact OFF/ON
  guidance lines, exact changed-line pairs, unknown-name candidate label, INV-2 via the readout's Location
  line, "brackets" → "parentheses" in the ON sentence. Mutating the OFF sentence now fails 2 tests; restored.

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive this worklog
