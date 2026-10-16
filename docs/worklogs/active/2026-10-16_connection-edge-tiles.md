# connection-edge-tiles-v1 (pre-launch fix F9, bundle switch)

Parent: `/private/tmp/pokebench-prelaunch/docs/worklogs/active/2026-10-16_prelaunch-fixes.md` (F9). Operator decision (the operator) 2026-10-16 12:54 AM EDT: a new bundle switch, default off, OFF reproduces today. Branch `claude/connection-edge-tiles`, worktree `/private/tmp/pokebench-m5b-edges`. Ownership moved 2026-10-16 01:15 AM EDT to the Route 101 thread, which lands it on main itself (the operator); the readiness thread wires it into bundle-v-control after the merge.

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
- [x] Implement; `just test` (agent 1277, viewer 787, env 1992 passed), `just lint`, `just build`, `just coverage` (Python lines 97.05 / branches 92.65 / functions 100; agent 97.65/94.19/97.98; viewer 95.08/90.39/93.55), `just verify-vendor` all green
- [x] Delete-the-wiring check: removing `connectionEdges` from `withNavigation` turns "the production factory threads the switch" red; removing `connection_edges_enabled` from `rerender.read_state` turns the showcase ON test red; both restored
- [x] Real-ROM probe (live servers on 8461/8462 from `runs/auto-advance-qualify/states/twin.state`, LITTLEROOT (10,2)): ON `- NORTH -> ROUTE101 (map 0/16), offset 0; walk off the map from (10,0) or (11,0): stand on one of these edge tiles and press UP`, state JSON edges [(10,0),(11,0)]; OFF `... boundary continuation: walk across the matching edge in this direction`, no `edges` key
- [x] Multi-model review round 1: all four lanes LGTM, no blockers (cloud lanes only per the 2026-10-15 operator decision)
- [x] Explainer `docs/explainers/connection-edge-tiles-v1.html`, FEATURE_EXPLAINERS mapping, README entry; pending experiment `experiments/connection-edge-tiles.json` and readiness row

## Session Log

- 2026-10-16 01:20 AM EDT: Worktree set up from main fa09dbe6. Confirmed from raw RAM `raw-ram/00001867.json.gz` (state seq 3582): backup-map row y=-1 has collision 0 only at x=10,11; rerender of seq 3583 under the run's switches is byte-equal to the recorded readout.

- 2026-10-16 01:30 AM EDT: RED written. Python `env/tests/env/test_connection_edges.py` (collection fails: no `edge_phrase`, no `edges=`); fixture `env/tests/env/fixtures/connection-edges-show-t175.json` holds only RAM windows (45,880 bytes, never ROM) of state seq 3582 and the recorded readout; the OFF rerender with the run's switches is byte-equal. TS `packages/agent/src/connection-edge-tiles.test.ts` 11/11 red; fixture `packages/agent/test-support/connection-edges-show.json` (state seq 3606, refusal seq 3607, supervisor seq 3684, replay seqs 3421–3684; replay from 3421 reproduces the recorded briefing exactly with today's code). Viewer: 3 red (explainer mapping, allowlist route, default off).

## Surprises

## Multi-Model Review Log

Deferred (post-experiment, merge rule):
- Elevation 15 edge tile treated as any height; the game keeps the walker's carried elevation (codex 1, grok 1, opus D3, fable 1). Not on CLOCK_SET → ROUTE_101.
- Ledge tiles in the padding that can be hopped across are missed (fable 2); MAPGRID_UNDEFINED compared on 10 bits (fable 3). Conservative misses only.
- Corner tile on two connections names only the first in refusals (grok 5, opus D5, fable 4).
- Experiment entry: incumbent has world-destinations-v1, navigation-refusal-reasons-v1 and loop-guard-supervisor-v1 off, so its ON arm would change only state JSON (opus D1, codex 2); the readiness thread owns the bundle definition. source.commit is repinned to the merge SHA at landing.
- `needs: null` although the readout half shows only with world-destinations-v1 and the refusal half only with navigation-refusal-reasons-v1 (grok 4, opus D2).
- Real-seam coverage is Littleroot north only; S/E/W synthetic (codex 3, grok 3).
- Explainer table wording on collision/elevation (fable 5).

- 2026-10-16 01:25 AM EDT: GREEN finished by the Route 101 thread: lint fixes in the TS test, server feature count 24→25, explainer, experiment entry, readiness row; gates green.
- 2026-10-16 01:40 AM EDT: merged main 342a2d51 (blocked-batch-result-v1 landed first): registry, presets, defaults and test positions take both switches, blocked-batch-result-v1 then connection-edge-tiles-v1. Gates after merge: agent 1337 (97.67/94.28/98.01), viewer 791 (95.09/90.42/93.56), pytest 1992 (97.05/92.65/100), lint, build, schema clean.
- Review round 1 (packet runs/reviews/connection-edge-tiles/, patch sha256 0fd7a79e…, HEAD 4ed77d9e): Codex gpt-5.6-sol LGTM; Cursor grok-4.5-high LGTM; Claude lane: Claude CLI not logged in (`claude auth status` loggedIn false), Cursor claude-opus-5 and claude-sonnet-5 at the monthly usage limit → standing subagent fallback: Opus subagent LGTM, Fable subagent LGTM (ran the ROM-backed tests, decoded pokeemerald map.bin to confirm x=10,11). Principles self-review: no FAIL rows.
- 2026-10-16 02:20 AM EDT: merged main 36e7c732 (F1–F5 bundle fixes: dialogue-context-kept-v1, displayed-place-names-v1, transition-loop-detection-v1, stall-briefing F5–F8). connection-edge-tiles-v1 stays last in every list; supervisor edge line now follows main's stall-only lines; showcase tests turn off switches registered after the run (displayed-place-names-v1 server-side; TS fixture starts unknown switches off). Gates: agent 1401 (97.75/94.52/98.08), viewer 795, pytest 2018 (97.08/92.73/100), lint, schema, vendor clean.
