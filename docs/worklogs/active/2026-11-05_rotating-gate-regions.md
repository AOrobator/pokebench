# Rotating-gate regions

**Started:** 2026-11-05
**Status:** in progress
**Branch:** `claude/rotating-gate-regions` (from main `bbb0a9c85`), worktree `/private/tmp/pb-gate-regions`.
**Approval:** The operator, 3:19 AM New York, relayed by the coordinator: "sure and afterwards u can do a 1hr launch of deepseek with that feature on if the probes look like they work". The probes answered 57/64 with region letters against 8/63 with the current map (`runs/probes/gym-map-format-20261105`).

## Problem statement

Models cannot read which tiles a gate cuts off from the map's arm marks. A grid that letters each walkable tile by the area it connects to, with the gates as they stand, answered reachability questions in the probe.

## Design

- Switch `rotating-gate-regions-v1`, server side, needs `rotating-gate-positions-v1`, registry default OFF, onInBoth base true. OFF is byte-identical.
- Block right after the map key line, only on a gate map with a full map view and every gate's arms read. Any unread gate means no block: a partial block would say two areas connect when they may not.
- Walkability is `map_sections.build_sections`, the harness's own directed sections, fed the live full map: collision, water, elevation, edge walls, warps and ledges as one-way hops. Live objects are its walls. New optional `arms` argument refuses a step across an arm.
- Same letter means each tile walks to the other. A one-way step between areas, which the prototype could not show, gets its own factual line.
- A warp tile takes the area its landing resolves to; the player standing on one is in that area.
- Facts only, no push advice. Header and gate line wording are the probe's.

## Milestones

- [x] M1: RED tests
- [ ] M2: GREEN, wiring, configs, explainer
- [ ] M3: gates, reviews, landing

## Log

## Multi-Model Review Log
