# adjacent-tiles-v1: the readout names the four neighbouring tiles in words

Asked by the operator 2026-10-16 01:58 AM EDT ("N2") after forensics of `2026-10-16T00-34-26_qwen36-gpu1_show`. The model misread the 15x15 ASCII grid's columns at Route 101's ledges: T447 claimed "(10,13) is `g`" where the row shows `v`; T459 "The map shows (8,6) as `.`" where it is `v`. It pressed UP into one-way ledges about 40 times (T447–498, 5.7 min) and again from T802. At T814/T826 it began writing a neighbour list for itself.

Branch `claude/adjacent-tiles` in `/private/tmp/pokebench-adjacent-tiles`. Default-off bundle switch; the bundle definition is owned by the Dual GPU experiment readiness thread. Merge only after the operator types "merge it".

## Design

- ON: one line under the local map, from the same tiles the map draws: `Next tiles: up (8,6) ledge, hops down only, cannot be entered from here; down (8,8) clear; left (7,7) clear; right (9,7) clear`. Each name follows the switch that draws its glyph (ledge-hops-v1, one-way-tiles-v1, counter-talk-v1, warps, objects), so the line never says more than the map shows. Objects and warps are described, never called blockers; the map edge names the connection only when topology is shown.
- OFF: readout byte-identical.
- Where it is built: the local map is drawn by the game server (`env/pokebench_env/live_map.py`), so the line is built there too, in `env/pokebench_env/adjacent_tiles.py`, from the map's own drawn cells (`_cells` with the same ledge/edge-wall/counter switches) and its own `MapTile`s. The glyph decides the name, so the line can never name a tile the map draws differently. Tile rules come from the existing owners in `live_map.py` (`LEDGES`, `EDGE_WALLS`, `_warp_trigger`); nothing is re-derived.
- Placement: directly under the grid's last row, above the legend. It decodes the grid, so it sits next to it; it is in words with the glyph in brackets, so it needs no legend before it, and the legend that follows still explains every glyph. With full-map-navigation-v1 the line sits under the whole-map grid instead, from that map's tiles.
- Claims, each grounded in pokeemerald 731ad5b `GetCollisionAtCoords` / `CheckForObjectEventCollision`: "cannot be entered from here" only for a collision tile (not a ledge hopped this way), a ledge with collision pressed from another side, an edge wall on the entered side or on the player's own tile, and a map edge with no connection on that side (`GetMapBorderIdAt` == CONNECTION_INVALID) when world-destinations-v1 shows topology. A ledge pressed its own way is the hop. Water is "not walkable on foot" only when the avatar flags say on foot and not surfing. Objects (N, with the listed ids) and warps (W, with the activation the Warps line gives) are described only. Elevation is never named. Coordinates only when live-player-position-v1 is on.

## Milestones

**M1 — switch, RED, GREEN**
- [ ] Switch registered (observation, needs live-map-v1, default OFF), server feature in features.ts and readout.py, presets, DEFAULT_NEXT_RUN
- [ ] RED: OFF readout byte-identical; ON line for the showcase ledge pocket (seq of T457: up ledge, cannot enter), grass, collision, water, edge walls, warps, objects, map edge; glyph-switch parity; factory/wiring test; wiring-removal check
- [ ] GREEN, gates (test, lint, build, coverage ≥90, verify-vendor)

**M2 — explainer and review**
- [ ] Real-ROM readout from a Route 101 save
- [ ] Explainer, FEATURE_EXPLAINERS mapping, pending `experiments/adjacent-tiles.json`
- [ ] Review: Claude CLI, Codex (gpt-5.6-sol), Grok (cursor-grok-4.5-high) until LGTM
- [ ] ASK USER: "merge it"

## Session Log

- 2026-10-16 02:00 AM EDT: worklog drafted, awaiting the operator's OK.
- 2026-10-16 02:12 AM EDT: approved by the parent session (the operator's ask relayed). RED: `env/tests/env/test_adjacent_tiles.py` (showcase pocket fixture `fixtures/route101-ledge-pocket-t457.json` from events seq 13496 `navigation_grid`; reproduces the recorded local map byte for byte), OFF goldens `adjacent-tiles-off-t457-ead18377.txt` (default switches) and `adjacent-tiles-off-all-on-t457-ead18377.txt` (every server switch on) rendered by main ead18377, and `packages/agent/src/adjacent-tiles.test.ts` (registry, server env, preset defaults). Both fail: no `pokebench_env.adjacent_tiles`, no registry entry.
