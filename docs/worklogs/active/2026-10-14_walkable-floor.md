# Walkable floor in navigate_to (2026-10-14)

Bug: `navigate_to`'s planner (`packages/agent/src/navigation.ts:13`) only admitted behaviors 0, 2, 3
and warp/door tiles. Sand, cave floor, mountain top, puddles, shallow water and bridges were walls
while the map text draws them as `.`. Source: `runs/explainers/map-observation-audit.html` §7 in the
main checkout.

## Game-source grounding

pret/pokeemerald 731ad5b:

- `src/event_object_movement.c` `GetCollisionAtCoords`: a move is refused for the collision bit, map
  border, `IsMetatileDirectionallyImpassable`, camera bounds, `IsElevationMismatchAt` or an object.
  Behavior is not otherwise consulted.
- `src/field_player_avatar.c` `CheckForObjectEventCollision`: ledges, boulders, rotating gates and
  `CheckAcroBikeCollision` (bumpy slope, rails) on top.
- Stepping effects the planner cannot predict as one tile of movement: forced movement
  (`MetatileBehavior_IsForcedMovementTile`, thin/cracked ice), holes and step warps.
- Surfable water (`sTileBitAttributes` TILE_FLAG_SURFABLE) is never walked on foot.

## Change (behind walkable-floor-v1; kept small for sibling threads in navigation.ts)

- [x] With walkable-floor-v1 on, `FLOOR` (0x00–0xEF except UNWALKABLE) replaces `LEGACY_WALKING`: surfable, forced movement, ice, holes and
      step warps, directional one-way tiles (0x30–0x37, 0xC0, 0xC1; chair thread owns those), ledges
      (ledge thread owns those), Acro Bike tiles. Collision, elevation, door and warp rules unchanged.
- [x] Scan of every pokeemerald layout (maps.json from the audit): planner rejected 38,662 `.` tiles,
      now 8,030 (surfable water drawn as `.`, ice, directional tiles, holes). 30,647 tiles opened
      (cave 15,997, mountain top 4,110, shallow water 3,116, sand 2,221, indoor encounter 2,043 …).
      Only change in the other direction: water door 0x6C/0x6D (15 surfable tiles) no longer walkable.

## Gates

- RED: `test: navigate_to walks sand, cave and mountain-top floor` (a7a32d3). 3 navigation tests fail
  (walkable floor, Route 104 beach, water door 0x6C/0x6D still admitted).
- GREEN: `fix: navigate_to walks every floor the game lets the player walk`. agent 893/893,
  viewer 419/419; agent coverage 97.1/93.16/97.86 (navigation.ts 91.71 stmts / 91.83 branches /
  100 funcs); `pnpm -r lint` clean. Python untouched.
- Evidence (real RAM grids): replayed the human run `runs/human/2026-10-13T23-50-13_human_1848`
  (3,226 sampled field states with non-legacy floor). Of 12,515 `.` targets, the old rule reached
  5,092 and the new one 7,280: 2,188 newly reachable (Route 104 1,750, Rusturf Tunnel 161,
  Route 116 51, Route 115 71, house rugs 155), 0 newly unreachable.
- Merged main 986b386 (ledge hops landed in navigation.ts). Conflict at the WALKING/LEDGES
  constants resolved by keeping both; ledge landings now accept sand etc. via WALKING (test
  "hops a ledge down onto sand"). agent 900/900, viewer 419/419, lint clean, navigation.ts
  93.71/93.29/100/100.
- Review round 1 (packet c3917dc, sha beb09a5b…): Claude CLI BLOCKING. B1: jump/spin mats are
  MB_SECRET_BASE_JUMP_MAT 0xBB / SPIN_MAT 0xBC, not 0xBD/0xBE (sound mat, breakable door); 0xC4 is
  MB_SECRET_BASE_TV_SHIELD, not a hole (MB_SECRET_BASE_HOLE 0xC2 is decoration-only). Accepted.
  Codex gpt-6.1-sol default rejected for ChatGPT accounts; rerun with gpt-5.6-sol.
- Round-1 fix: `fix: refuse the real jump and spin mat behaviors`. UNWALKABLE grouped with MB_*
  names per value, checked by script against metatile_behaviors.h. Tests: mats 0xBB/0xBC refused;
  0xB5, 0xBD, 0xBE, 0xC2, 0xC4 walkable when collision-free. agent 900/900, viewer 419/419, lint clean.
  Static scan unchanged (no mats in layout data).
- Round 1 Codex gpt-5.6-sol: BLOCKING, same B1 (already fixed) plus B2: bytes 0xF0–0xFF (outside
  NUM_METATILE_BEHAVIORS; 0xFF is MB_INVALID) were admitted. Accepted. Also asked for full replay
  output with provenance. Grok lane still running at round-1 close.
- Round-1b fix: `fix: refuse behavior bytes outside the game's enum`. WALKING built from 0x00–0xEF.
  Tests: 0xF0, 0xFE, 0xFF refused. agent 900/900, viewer 419/419, lint clean. Replay re-run on the
  rebuilt dist with hashes: same numbers (2,188 newly reachable, 0 lost).
- Grok round 1 (cursor-grok-4.5-high) produced no output after ~18 min; stopped and folded into round 2.
- Merged main 9f111d1 (no conflicts). Explainer now tracked at docs/explainers/walkable-floor.html
  and listed in docs/explainers/README.md (per the updated feature-explainer skill).
  agent 900/900, viewer 474/474, lint clean, agent coverage 97.21/93.27/97.86, viewer 95.65/90.58/95.2.
- Review round 2 (packet 337a058, sha 99b4f707…): Claude LGTM, Grok (cursor-grok-4.5-high) LGTM,
  Codex gpt-5.6-sol BLOCKING: MB_SECRET_BASE_BREAKABLE_DOOR 0xBE is in IsEastBlocked/IsWestBlocked,
  so it is a one-way tile, not floor. Accepted. Note: the Grok lane (cursor-agent --mode ask) left
  scratch files (.zshrc, .zshenv, scripts/ls, hash helpers) in the worktree; moved out, none committed.
- Round-2 fix: `fix: treat the secret-base breakable door as one-way`. 0xBE joins the one-way group.
  New check: scratchpad derive.py rebuilds the refused set from the game's predicates
  (TILE_FLAG_SURFABLE, IsForcedMovementTile + thin/cracked ice, Is*Blocked, Acro Bike predicates,
  MB_JUMP_*, named holes/step warps) and diffs it against UNWALKABLE: missing [] extra [].
  Static scan rerun with the same classifier and input hash: unchanged. agent 900/900, viewer 474/474.
  Two rounds had new blockers, so round 3 waits for operator scope confirmation.
- Merged main 3e8a13c (full-map navigation, one-way tiles v1, elevation fixes landed). Conflicts in
  navigation.test.ts and docs/explainers/README.md resolved by keeping both sides; navigation.ts
  auto-merged: one-way-tiles' EDGE_WALLS (incl. 0xBE) admits one-way tiles only with its option on,
  consistent with UNWALKABLE. Added full-map test (sand and cave walkable, current 0x51 refused).
  agent 939/939, viewer 493/493, lint clean, navigation.ts 94.56/93.68/100/100, derive.py diff empty.
  Replay on the merged head: 12,515 targets, reachable 5,206 → 7,508, 2,302 newly reachable, 0 lost.
- Explainer refreshed with merged-head numbers.
- Operator rule relayed 2026-10-14 20:19Z: every behavior change gets its own switch. Adding walkable-floor-v1
  (needs null, see GREEN entry; agent-only, frozen presets OFF, drafts ON). RED: tests for option, tool
  wiring, registry and preset defaults.
- GREEN: `feat(features): put walkable floor behind walkable-floor-v1`. planNavigation option `floor`
  (FLOOR set) else LEGACY_WALKING (exact old list); NavigationPorts.floor; tool description adds
  "walks sand, cave and other floor the game allows" when on. Registry: guidance, needs null (only
  matters with bounded-navigation-v1; a bounded-navigation dependency would force the default draft,
  which has navigation off, to turn it off). Agent-only (not a server feature); recorded in
  harness_features after counter-talk-v1. Presets: absent → OFF, v1 flags OFF, drafts ALL_ON → ON.
  Viewer: feature card links docs/explainers/walkable-floor-v1.html (renamed to the switch id).
  agent 948/948, viewer 493/493, lint clean; agent coverage 97.2/93.4/97.92, viewer 95.67/90.53/95.34.
- Review round 3 (operator-approved; packet f1a2b19, sha 01f63039…): Claude LGTM; Grok produced no
  output (empty log, rc 0); Codex BLOCKING: explainer link lacked card/serve tests and a real-viewer
  click-through (feature-explainer skill). Accepted; stale "no switch" heading renamed.
- Round-3 fix: `test(viewer): walkable floor card links and serves its explainer`. panels.test asserts
  the walkable-floor-v1 card links /explainers/walkable-floor-v1.html; server.test serves it (200) and
  404s the old name. Real viewer click-through on an isolated candidate viewer (port 8799): HARNESS
  CONFIG -> WALKABLE FLOOR card -> READ EXPLAINER opened /explainers/walkable-floor-v1.html
  (receipt + screenshots in the session scratchpad review/e2e-*). agent 948/948, viewer 493/493, lint clean.
- Merged main a3c343b (grass-cost-navigation-v1 landed in navigation.ts, features, presets, panels).
  Conflicts resolved by keeping both switches (options grassCost + floor; both preset defaults OFF;
  both explainer mappings). Counts: guidance 15, switchboard rows 35. agent 954/954, viewer 493/493,
  lint clean, navigation.ts 95.09/94.37/100/100, viewer 95.67/90.53/95.34; derive.py diff empty;
  replay unchanged (2,302 newly reachable, 0 lost).
- Review round 3b (packet 8a60a98, sha 0de8a582…): Claude LGTM, Grok (cursor-grok-4.5-high) LGTM,
  Codex gpt-5.6-sol LGTM. All lanes LGTM on the same frozen packet. Hardening follow-ups noted:
  exact-head click-through (done below), keep derive.py-style drift check, worklog wording (fixed).
- Exact-head browser rerun at 8a60a98 (built dist, isolated viewer :8799): HARNESS CONFIG ->
  "Read explainer: WALKABLE FLOOR" (href /explainers/walkable-floor-v1.html) -> opened the
  explainer (title "Walkable Floor"). Viewer stopped.
- Waiting for operator approval to merge into main.
