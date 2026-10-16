# connection-edge-tiles-v1 (pre-launch fix F9, bundle switch)

Parent: `/private/tmp/pokebench-prelaunch/docs/worklogs/active/2026-10-16_prelaunch-fixes.md` (F9). Operator decision (the operator) 2026-10-16 12:54 AM EDT: a new bundle switch, default off, OFF reproduces today. Branch `claude/connection-edge-tiles`, worktree `/private/tmp/pokebench-m5b-edges`. Leave unmerged; the integrator wires it into bundle-v-control.

## Problem

Showcase bundle run `2026-10-16T00-34-26_qwen36-gpu1_show`, seq 3580–3745: after BIRCH_RESCUE_REQUESTED (turn 174, TWIN at (10,1)) the model stood at (10,2) for turns 175–188 calling navigate_to (9,1), (8,1), (7,1), (8,0)×4, (9,0)×5. Littleroot's north exit is x=10..11 at y=0 (open path (11,2)→(11,1)→(11,0)). The readout said only `NORTH -> ROUTE101 (map 0/16), offset 0; boundary continuation: walk across the matching edge in this direction`. Nine refusals said the nearest reachable tile was (10,0); it never tried it. The turn-187 supervisor (seq 3684) listed failed targets but no exit tiles. It crossed at turn 212 (~37 turns lost).

## Design (switch ON)

1. Readout (server, `env/pokebench_env/topology.py`): each N/S/E/W connection lists the exact edge tiles you can walk off, read from live RAM: the edge tile and the tile one step out in the backup map (`gBackupMapLayout`, which `FillNorthConnection` etc. fill with the connected map's blocks) both collision 0 and not MAPGRID_UNDEFINED, neither surfable water, no edge wall on the crossed side, no elevation mismatch; restricted to the connected map's span `0 <= x - offset < destWidth` (pokeemerald `IsPosInConnectingMap`), destWidth read from `gMapGroups` (0x08486578) → MapHeader → MapLayout. Example: `- NORTH -> ROUTE101 (map 0/16), offset 0; walk off the map from (10,0) or (11,0): stand on one of these edge tiles and press UP`. State JSON gains `edges` per connection only when ON.
2. Bearings (`loop-supervisor.ts`, shared by the loop supervisor and stall briefing): one added line with the edge tiles of the current map's connections, only when the switch is ON (control output unchanged).
3. navigate_to refusal (`navigation.ts`): when the nearest reachable tile is a listed edge tile, say which map it leads to and which button crosses.

## Invariants

- OFF: readout bytes, state JSON, refusal text and supervisor text identical to today (tests against the recorded showcase readout seq 3583, refusal seq 3607 and supervisor seq 3684).
- Edge tiles come only from game RAM/ROM; none guessed. Unknown → no list.
- No truncation of model-facing text.

## Milestones

**M1 — RED**
- [x] Python: synthetic-memory edge rules; real showcase RAM fixture (ROM-gated) OFF = recorded readout, ON lists (10,0),(11,0); server feature registration
- [x] TS: refusal from the recorded seq 3606 state; supervisor replay of seq ≤3684 OFF = recorded, ON adds the line; registry/preset/defaults/explainer mapping

**M2 — GREEN, gates, review**
- [ ] Implement; `just test`, `just lint`, `just build`, `just coverage`, `just verify-vendor`
- [ ] Delete-the-wiring check
- [ ] Real-ROM probe from CLOCK_SET.state walking to Littleroot; quote readout ON/OFF
- [ ] Codex + grok review
- [ ] Explainer `docs/explainers/connection-edge-tiles-v1.html`, FEATURE_EXPLAINERS mapping

## Session Log

- 2026-10-16 01:20 AM EDT: Worktree set up from main fa09dbe6. Confirmed from raw RAM `raw-ram/00001867.json.gz` (state seq 3582): backup-map row y=-1 has collision 0 only at x=10,11; rerender of seq 3583 under the run's switches is byte-equal to the recorded readout.

- 2026-10-16 01:30 AM EDT: RED written. Python `env/tests/env/test_connection_edges.py` (collection fails: no `edge_phrase`, no `edges=`); fixture `env/tests/env/fixtures/connection-edges-show-t175.json` holds only RAM windows (45,880 bytes, never ROM) of state seq 3582 and the recorded readout; the OFF rerender with the run's switches is byte-equal. TS `packages/agent/src/connection-edge-tiles.test.ts` 11/11 red; fixture `packages/agent/test-support/connection-edges-show.json` (state seq 3606, refusal seq 3607, supervisor seq 3684, replay seqs 3421–3684; replay from 3421 reproduces the recorded briefing exactly with today's code). Viewer: 3 red (explainer mapping, allowlist route, default off).

## Surprises

## Multi-Model Review Log
