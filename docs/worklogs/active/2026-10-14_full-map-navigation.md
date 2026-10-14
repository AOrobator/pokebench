# Full-map navigation experiment

## Problem Statement
Operator chose the full-map arm (2026-10-14, via the project coordinator). Add a feature switch `full-map-navigation-v1` that shows the model the whole current map (PokeAgent style) and lets `navigate_to` walk the full route instead of the 15x15 window and the 8-press cap. Keep per-press checks (stop and report on block, unexpected movement, map change, lock) and keep "warps are only goals". In the same change, switch `planNavigation`'s open list from a re-sorted array to a binary heap. Evidence: of 116 recent `navigate_to` calls, 37 ended "no supported local path" and 4 hit the cap; open-list benchmark 108-371 ms/plan (array) vs 1.4-3.9 ms (heap) on Routes 119/124 (`runs/explainers/navigation-followups.md`).

## Constraints
- Default OFF everywhere (incumbent presets, viewer next-run, server default). OFF reproduces today's readout, state JSON, tools and prompt byte for byte.
- No measured benchmark runs until the separate ledge-fix thread lands on main.
- No local-model reviewers. Ask before pushing, merging or landing. Everything local. Own worktree `/private/tmp/pokebench-full-map-nav` on `claude/full-map-navigation`.

## Architecture
- Python: `read_full_map` reads the whole current map from the live backup map (same layout/attribute decoding as `read_local_map`, one memory read per row), all map warps and live objects on the map. `GameState.full_map` is read only when the switch is on. Readout replaces the 15x15 grid with a compact one-character-per-tile full map labelled with world coordinates. State JSON gains `map_grid` (compact: one 4-hex-digit cell per tile, `collision<<12 | elevation<<8 | behavior`) only when on; `navigation_grid` stays the local window, so measurement JSON is unchanged when off and logs stay small when on.
- TS: `planNavigation` runs on either geometry through one tile lookup. Open list is a binary heap keyed by (f, insertion order), which reproduces the old stable-sort pop order exactly. Paths are rebuilt from parent links. With the switch on, `navigate_to` plans over `map_grid` and walks until arrival or a stop, bounded by a safety cap of 512 presses; per-press revalidation and stop rules are unchanged; warps remain goal-only.

## Milestones
- [x] M1 Planner: heap open list, geometry abstraction, full-map grid decode, full-route bound (RED → GREEN).
- [x] M2 Switch: Python full-map read/readout/state JSON, feature registry, presets, prompt/tool copy, server env (RED → GREEN), gates, review.

## Session Log
2026-10-14: worktree created from main 79e17be.

## Multi-Model Review Log
Pending.

M1 RED: navigation.test.ts adds whole-map planning (40x140 serpentine, 2868 steps), local rules on the whole map, malformed map_grid rejection, heap-vs-reference-array path equivalence on 200 seeded 15x15 grids, 80x80 timing (<25 ms/plan), full-route walking past 8 presses with per-press block stop, 512 safety bound. 5 fail / 16 pass as expected.

M1 GREEN: planner runs on local or whole-map geometry through one tile lookup; binary-heap open list keyed (estimate, insertion order); routes rebuilt from parent links; navigationTool fullMap mode (whole-map description, 512 bound, mode-aware readiness/status). map_grid added to StateBodySchema. navigation + caller tests 24/24, agent lint clean.

M1 GREEN commit: cf2857b. M2 RED: Python read_full_map (rows, objects/warps beyond window, one-row reads, labels, packed JSON, unready layouts), observation switch adds map_grid/whole-map text only when on, default-off server list (18 features); TS registry/preset defaults/prompt/factory tests. All new tests fail at collection or assertion.

M2 RED commit: 0eadff1.
M2 GREEN: live_map shares layout/object/warp/symbol/detail helpers between read_local_map (output unchanged) and new read_full_map (one row read per map row, all warps, all live objects on the map). GameState.full_map read only with full_map_enabled; readout shows the whole map in place of the local grid; state_json adds map_grid only when present (measurement-identity test now pops map_grid explicitly as the single declared exception). Registry: full-map-navigation-v1 (guidance, needs bounded-navigation-v1), server feature, recorded last in harness_features; presets/viewer next-run/flagFeatures/human host env default OFF; prompt line and tool description swap only when on; withNavigation passes fullMap. Schema regenerated.
Gates: agent 875/875 (97.06 lines, 93.08 branches, 97.77 funcs), viewer 417/417 (95.54/90.47/95.12), Python 1813 passed (96.71/91.89/100, floor 90). tsc/eslint/ruff/format clean; mypy clean with the mGBA-equipped venv (this worktree's venv lacks the native binding, so its mypy reports only the missing mgba._pylib import). Native qualification on the real ROM not run: no game servers until the ledge-fix thread lands and the measurement lease is free.

M2 GREEN commit: 46859dc. Independent Claude CLI review (runs/full-map-review/claude.md): LGTM, 8 minor. Follow-up RED: size guard (1..256) for read_full_map, shared Python/TS map_grid fixture, no-progress stop after 16 presses, heap-equivalence trials with objects/warps/frontier fallback (400 trials), timing bound loosened to <250 ms, "none on this map" wording. Bundling decision (PB5): operator chose one arm combining whole-map readout, whole-map planning and full-route walking; readout-only and planner-only are possible follow-up arms. PB6: record per-turn context size for ON runs in evaluation.

Follow-up GREEN: read_full_map rejects maps outside 1..256 per side; whole-map walks stop as "route not converging" after 16 presses with no shorter route (tool, prompt and registry copy say so); full-map lists say "none on this map"; shared fixture packages/agent/src/fixtures/full-map-grid.json checked by both stacks. Gates: agent 877 (97.07/93.13/97.77), viewer 417, Python 1818 (96.71/91.89/100); lint/types clean. Review findings 1,2,3,4,5,8 fixed; 6,7 recorded above as evaluation notes.
