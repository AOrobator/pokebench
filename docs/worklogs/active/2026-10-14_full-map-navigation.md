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
- [ ] M1 Planner: heap open list, geometry abstraction, full-map grid decode, full-route bound (RED → GREEN).
- [ ] M2 Switch: Python full-map read/readout/state JSON, feature registry, presets, prompt/tool copy, server env (RED → GREEN), gates, review.

## Session Log
2026-10-14: worktree created from main 79e17be.

## Multi-Model Review Log
Pending.

M1 RED: navigation.test.ts adds whole-map planning (40x140 serpentine, 2868 steps), local rules on the whole map, malformed map_grid rejection, heap-vs-reference-array path equivalence on 200 seeded 15x15 grids, 80x80 timing (<25 ms/plan), full-route walking past 8 presses with per-press block stop, 512 safety bound. 5 fail / 16 pass as expected.
