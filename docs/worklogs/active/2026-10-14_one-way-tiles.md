# One-way tiles (2026-10-14)

Bug: the chair in the player's bedroom (May's house 2F, map 1/3, tile (7,4) on the vendored house2_upstairs.state) is MB_IMPASSABLE_SOUTH_AND_NORTH
(0xC0) with no collision, so the live map drew it as `.`. The game refuses every move across
its north and south edges, in both directions. Source: `runs/explainers/map-observation-audit.html`
§4 and the "One-way walls drawn as clear" finding in the main checkout.

## Game-source grounding

pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881:

- `include/constants/metatile_behaviors.h`: MB_IMPASSABLE_EAST..SOUTHWEST 0x30–0x37,
  MB_SECRET_BASE_BREAKABLE_DOOR 0xBE, MB_IMPASSABLE_SOUTH_AND_NORTH 0xC0, MB_IMPASSABLE_WEST_AND_EAST 0xC1.
- `src/metatile_behavior.c` `MetatileBehavior_Is{East,West,North,South}Blocked`: which sides each
  behavior walls.
- `src/event_object_movement.c` `GetCollisionAtCoords` → `IsMetatileDirectionallyImpassable`:
  moving in direction d is refused when the current tile walls side d
  (`gOppositeDirectionBlockedMetatileFuncs`) or the next tile walls the opposite side
  (`gDirectionBlockedMetatileFuncs`).

## Change (one switch: `one-way-tiles-v1`, guidance, needs `live-map-v1`)

- [x] Map text draws collision-free edge-wall tiles as `+`, a legend entry, and an
      `Edge walls: (x,y) north+south` list of walled sides. Off: `.`, no legend, no list.
- [x] `planNavigation` with `oneWay` admits edge-wall tiles and refuses leaving through a walled
      side of the current tile or entering through a walled side of the next. Off: walls (incumbent).
- [x] Recorded as a switchable server feature; absent from older v2 presets and v1 flag presets
      means OFF.

## Gates

- RED: `test: one-way tiles render with walled sides and navigate_to respects them` (efd1861).
  Fails on the edge-wall cases (Python 6, TS 8). Two RED expectations were corrected in GREEN:
  a Python row index (the player's row is rows[1]) and two equal-length A* tie paths.
- GREEN: `fix: draw one-way tiles with walled sides and keep navigate_to off them`.
  Agent 896/896, viewer 419/419, env 1808/1808; `just coverage` 90% floor passes; `just lint` 0.
- Merged main 9f111d1 (ledge hops landed). Conflicts resolved by taking main and re-applying
  this change on top: `LocalMap._cells` now strips ledge arrows and `+` per switch; the planner's
  edge-wall checks run after the ledge-hop branch because the game's `ShouldJumpLedge` ignores
  walled sides (new test). Guidance count 11, viewer switch count 31, server features 19.
  Agent 903/903, viewer 474/474, env 1812/1812; coverage floor passes; lint 0.

## Evidence

- Live, real ROM, vendored `tests/states/house2_upstairs.state` (LITTLEROOT TOWN MAYS HOUSE 2F,
  map 1/3; the chair is at (7,4)), run dir `runs/one-way-proof/` (gitignored). Model text shows
  `+` at (7,4) and `Edge walls: (7,4) north+south`. From (7,3) the game refuses DOWN twice
  (position unchanged); on the chair it refuses UP and DOWN. `navigate_to` (dist build, switch
  on) reaches (7,4) from (7,3) in 3 presses via the west side and from the west in 2; with the
  switch off it answers "no supported local path" for (7,4).
- Recorded probe (PB7) through `withRun`/`RunRecorder` with production press hooks at merge head
  0994cdc: `runs/one-way-proof/recorded-bedroom.mjs`, receipt `runs/one-way-proof/recorded-receipt.txt`.
  On run: 137 events parse; run_start lists one-way-tiles-v1; navigate_to (7,3)->(7,4) arrives in
  3 presses LEFT, DOWN, RIGHT; raw DOWN at (7,3) and UP/DOWN on the chair do not move. All 7 model
  tool results carry the edge-wall list. Off run: navigate_to (7,4) "no supported local path"; 0
  tool results carry the list.
- Observed, out of scope: from (1,4) navigate_to detours via row 2 because the bedroom floor
  behaviors 0x85/0x86/0xB5/0xC3 are outside `WALKING` (the walkability sibling thread's finding).

## Review round 1

Packet `git diff 9f111d1 fdabbb0` (SHA-256 53f13ffa…). Claude CLI: LGTM. Cursor Grok 4.5 high: LGTM.
Codex: default model refused for this account, re-run on `gpt-5.6-sol`.
Accepted non-blocking fixes: table-driven tests for all 11 behaviors in both stacks (a mutated
0x32 entry fails the TS table test); feature copy no longer names fences/railings; this worklog's
bug line corrected to (7,4); PB3 rescored N/A and PB13 scored after the review outcome is recorded.
Deferred: legend note that north is decreasing y (grid header already shows it); ledge landings
on `+` tiles (scope expansion).
  Gates after fixes: agent 914/914, viewer 474/474, env 1823/1823; coverage and lint pass.
- Codex (`gpt-5.6-sol`): BLOCKING, one finding: no `docs/explainers/one-way-tiles-v1.html` or README
  entry in the packet (CLAUDE.md explainer rule). Same non-blocking notes as the other lanes.
- Round-1 fix: explainer committed at `docs/explainers/one-way-tiles-v1.html` and indexed.
