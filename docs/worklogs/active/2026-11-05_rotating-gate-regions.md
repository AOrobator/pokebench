# Rotating-gate regions

**Started:** 2026-11-05
**Status:** landed on main 1a6210c16 (2026-11-05), on in both arms and the plain preset, viewer restarted. No game run has used the switch yet.
**Branch:** `claude/rotating-gate-regions` (from main `bbb0a9c85`), worktree `/private/tmp/pb-gate-regions`.
**Landing approval:** The operator, 11:12 AM New York in this thread: "continue, this needs to be landed on main".
**Approval:** The operator, 3:19 AM New York, relayed by the coordinator: "sure and afterwards u can do a 1hr launch of deepseek with that feature on if the probes look like they work". The probes answered 57/64 with region letters against 8/63 with the current map (`runs/probes/gym-map-format-20261105`).

## Problem statement

Models cannot read which tiles a gate cuts off from the map's arm marks. A grid that letters each walkable tile by the area it connects to, with the gates as they stand, answered reachability questions in the probe.

## Design

- Switch `rotating-gate-regions-v1`, server side, needs `rotating-gate-positions-v1`, registry default OFF, onInBoth base true. OFF is byte-identical.
- Block right after the map key line, only on a gate map with a full map view and every gate's arms read. Any unread gate means no block: a partial block would say two areas connect when they may not.
- Walkability is `map_sections.build_sections`, the harness's own directed sections, fed the live full map: collision, water, elevation, edge walls, warps and ledges as one-way hops. Live objects are its walls. New optional `arms` argument refuses a step across an arm.
- Same letter means each tile walks to the other. A ledge hop between areas, which the prototype drew as a wall, gets its own factual line.
- A warp tile takes the area its landing resolves to; the player standing on one is in that area.
- Facts only, no push advice. Header and gate line wording are the probe's.

## Milestones

- [x] M1: RED tests
- [x] M2: GREEN, wiring, configs, explainer
- [x] M3: gates, reviews, landing

## Log

- RED a13c04330: `test_rotating_gate_regions.py` failed to import `map_regions`; the agent and viewer tests name a switch that was not registered.
- GREEN: focused env 64 pass (regions, readouts, sections, observation consistency), agent 68 pass (regions, features, play-preset, gate navigation). Viewer panels needs the agent build, so it waits for the gate window.
- Replay of the 8 probe turns from recorded raw RAM through `rerender`, runs 5f0f and 3332: 8 of 8 give the same area partition and the same gate facts as the prototype (line order differs). The only difference is three new lines per turn for the gym's ledges (for example D to E, E to F, F to B), which the prototype drew as walls.
- Gate pass 1: lint pass; `rotating-gate-press.test.ts` pinned the last recorded switch with `.at(-1)`, now pinned by its neighbour.
- Gate pass 2: `just lint` pass, `just test` pass (agent 2475, viewer 892, env 2928 at 80.23/73.96/73.17 over floor 69, gateway 38 at floor 22 with functions 22.62), no-I/O guards OK, `just verify-vendor` pass.

## Multi-Model Review Log

Round 1, packet bbb0a9c85..d7858c0b1, diff SHA-256 af6fac89.
- Principles self-review: zero FAIL rows.
- Claude CLI (`~/.claude-review`): LGTM, replayed the 8 turns itself; hardening note on `landing`.
- Fallback reviewer (fresh read-only subagent, Sonnet): LGTM, same note on `landing`.
- GPT (Codex CLI gpt-5.6-sol): BLOCKING on two items, both accepted. B1: completeness compared gate ids, so a gate with some arms read passed; now the arm count of every gate must match its shape, and the fixtures carry real arm counts (28 on Fortree). B2: `landing` ignored arms; `Sections` now keeps them. Neither occurs on recorded data, and the replay is unchanged.
- Wiring deletions went red and were restored: readout switch, `landing` arm check, per-gate arm count.

Round 2, fix delta d7858c0b1..eea22b563, diff SHA-256 6df9a7b7045179b5d27036b2fd4553325e506d89ee09342c8ac86ce94bc02116.
- Claude CLI (`~/.claude-review`): LGTM; rendered 40 recorded gym turns on head and pre-fix, identical hashes, block on all 40.
- GPT (Codex CLI gpt-5.6-sol): LGTM, both findings verified fixed.
- Grok is out until 11/17: Claude, GPT and the fallback reviewer are full approval by the operator's standing rule.

## Landing

Fast-forward to main at 1a6210c16. Post-merge `just test` at that commit: agent 2475, viewer 892, env 2930, gateway 38, all floors met, no-I/O guards OK. `just viewer-main`: viewer at 1a6210c16, 0 live gameplay processes, explainer route 200.
