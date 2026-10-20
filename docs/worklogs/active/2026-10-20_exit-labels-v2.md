# exit-labels-v2 (M1 of heal-respawn-sight)

Status: in progress. Plan approved by the operator 3:41 PM ET 2026-10-20 (shared design
`2026-10-20_heal-respawn-sight.md`, milestone M1). Branch `claude/exit-labels-v2`, worktree
`~/dev/pokebench-worktrees/exit-labels-v2`.

## Problem

b300 (`2026-10-20T13-54-28_qwen36-gpu0_b300`) turns 581-596: the Warps line, the Warp destination
lines and the interaction candidates print bare `map 24/11` / `map 0/19`, and the model quoted
them. Every PETALBURG WOODS exit leads to ROUTE104, so a name alone cannot tell the north exit
from the south ones.

## Design

- Server switch `exit-labels-v2` (observation, needs named-warp-destinations-v1), default off,
  bundle-only. OFF is byte-for-byte today's readout and state.
- (a) Each destination map is named with its region-map section name, as the location popup
  prints it (`GetMapName(gMapHeader.regionMapSectionId)`, src/map_name_popup.c
  ShowMapNamePopUpWindow; gRegionMapEntries at 0x085A147C on the pinned US ROM), plus the map ID.
  A displayed-place-names-v1 name (houses, the lab) wins. Dynamic and unset warps keep today's
  rules.
- (b) When two or more exits of the current map lead to the same name, each such warp's Warp
  destination line adds the arrival tile and the exits reachable on foot from it on the
  destination map: the server floods the destination map's ROM layout from the arrival warp
  with surf_gate.reachable / classify (exit_reach's rules); connection edges use topology's
  crossing rule against the connected map's ROM layout.
- (c) Audit Littleroot through the Dewford Gym.

## Milestones

- [x] RED: failing tests (ROM-backed b300 raw-RAM fixtures + synthetic)
  COMMIT: `test: exit-labels-v2 popup names and arrival reach from b300 woods and Route 104 (RED)` (35c69bf8)
- [x] GREEN: server implementation, agent registry, presets, viewer defaults
  COMMIT: `feat: exit-labels-v2 names every warp as the location popup does and adds same-name arrival reach` (d6521e82)
- [x] Audit table (c) in this worklog and the explainer
- [x] Explainer + FEATURE_EXPLAINERS + pending experiment entry
- [x] Gates: just test, lint, build, coverage (90)
  Tests after GREEN: env 2925 passed; agent 2900 passed; viewer 1423 passed.
  Coverage: env lines 96.99 / branches 92.44 / functions 100.00; agent 97.19 stmts / 92.9 branches /
  97.68 functions / 99.17 lines; viewer 95.08 / 91.03 / 93.85 / 97.7. Gate PASS (floor 90).
  Wiring check: removing `exit_labels_enabled=` from rerender.read_state turned 8 of
  test_exit_labels.py red; restored, 19 green.
- [x] Sync with main (79a2fc3a), Claude + Grok review: round 1 LGTM on both lanes

## Session Log

- 2026-10-20: gRegionMapEntries found at 0x085A147C (entry 0 = 04 0B 01 01 -> "LITTLEROOT TOWN",
  entry 1 = 04 09 01 01 -> "OLDALE TOWN"). pokeemerald 731ad5bf, clean.
- ROM u16 arrays (map blocks, metatile attributes) are 2-byte aligned, not 4: interiors failed
  a 4-byte span check until relaxed.
- A doorway's adjacent warp tiles count as one exit; otherwise every two-tile house door would
  share its own name.
- Warps to the current map (PETALBURG CITY GYM room doors) read "this map"; MAPSEC_DYNAMIC maps
  (cable club UNION ROOM 25/60, TRADE CENTER 25/25) read "a map with no location name".
- Worktree setup: submodule init from the main checkout's reference; mgba binding symlinked into
  env/.venv for mypy; gitignored .env holds only POKEBENCH_ROM.

## Audit

59 maps, 134 exits (doorways grouped), Littleroot through the Dewford Gym with every interior,
read from the ROM with the switch on (player RED, male). No exit prints a bare map ID. The only
exits with no popup name were the 8 cable club doors on the four POKEMON CENTER 2F maps, now
"a map with no location name (map 25/60)". Popup names the player may not have seen still print:
TERRA CAVE (Route 116), ALTERING CAVE, ISLAND CAVE, GRANITE CAVE, VERDANTURF TOWN.

| Map (id) | Exit tiles | Destination (id, map table name) | Printed name with the switch on | Arrival reach added |
|---|---|---|---|---|
| LITTLEROOT TOWN (0/9) | (14,8) | 1/2 LITTLEROOT TOWN MAYS HOUSE 1F | PROF. BIRCH'S HOUSE 1F | no |
| LITTLEROOT TOWN (0/9) | (5,8) | 1/0 LITTLEROOT TOWN BRENDANS HOUSE 1F | RED's HOUSE 1F | no |
| LITTLEROOT TOWN (0/9) | (7,16) | 1/4 LITTLEROOT TOWN PROFESSOR BIRCHS LAB | PROF. BIRCH'S POKéMON LAB | no |
| LITTLEROOT TOWN BRENDANS HOUSE 1F (1/0) | (9,8) or (8,8) | 0/9 LITTLEROOT TOWN | LITTLEROOT TOWN | no |
| LITTLEROOT TOWN BRENDANS HOUSE 1F (1/0) | (8,2) | 1/1 LITTLEROOT TOWN BRENDANS HOUSE 2F | RED's HOUSE 2F | no |
| LITTLEROOT TOWN BRENDANS HOUSE 2F (1/1) | (7,1) | 1/0 LITTLEROOT TOWN BRENDANS HOUSE 1F | RED's HOUSE 1F | no |
| LITTLEROOT TOWN MAYS HOUSE 1F (1/2) | (1,8) or (2,8) | 0/9 LITTLEROOT TOWN | LITTLEROOT TOWN | no |
| LITTLEROOT TOWN MAYS HOUSE 1F (1/2) | (2,2) | 1/3 LITTLEROOT TOWN MAYS HOUSE 2F | PROF. BIRCH'S HOUSE 2F | no |
| LITTLEROOT TOWN MAYS HOUSE 2F (1/3) | (1,1) | 1/2 LITTLEROOT TOWN MAYS HOUSE 1F | PROF. BIRCH'S HOUSE 1F | no |
| LITTLEROOT TOWN PROFESSOR BIRCHS LAB (1/4) | (6,12) or (7,12) | 0/9 LITTLEROOT TOWN | LITTLEROOT TOWN | no |
| OLDALE TOWN (0/10) | (5,7) | 2/0 OLDALE TOWN HOUSE1 | OLDALE TOWN | yes |
| OLDALE TOWN (0/10) | (15,16) | 2/1 OLDALE TOWN HOUSE2 | OLDALE TOWN | yes |
| OLDALE TOWN (0/10) | (6,16) | 2/2 OLDALE TOWN POKEMON CENTER 1F | OLDALE TOWN | yes |
| OLDALE TOWN (0/10) | (14,6) | 2/4 OLDALE TOWN MART | OLDALE TOWN | yes |
| OLDALE TOWN HOUSE1 (2/0) | (3,8) or (4,8) | 0/10 OLDALE TOWN | OLDALE TOWN | no |
| OLDALE TOWN HOUSE2 (2/1) | (3,7) or (4,7) | 0/10 OLDALE TOWN | OLDALE TOWN | no |
| OLDALE TOWN POKEMON CENTER 1F (2/2) | (7,8) or (6,8) | 0/10 OLDALE TOWN | OLDALE TOWN | yes |
| OLDALE TOWN POKEMON CENTER 1F (2/2) | (1,6) | 2/3 OLDALE TOWN POKEMON CENTER 2F | OLDALE TOWN | yes |
| OLDALE TOWN POKEMON CENTER 2F (2/3) | (1,6) | 2/2 OLDALE TOWN POKEMON CENTER 1F | OLDALE TOWN | no |
| OLDALE TOWN POKEMON CENTER 2F (2/3) | (5,1) | 25/60 UNION ROOM | a map with no location name | no |
| OLDALE TOWN POKEMON CENTER 2F (2/3) | (9,1) | 25/25 TRADE CENTER | a map with no location name | no |
| OLDALE TOWN MART (2/4) | (3,7) or (4,7) | 0/10 OLDALE TOWN | OLDALE TOWN | no |
| ROUTE103 (0/18) | (45,6) | 24/106 ALTERING CAVE | ALTERING CAVE | no |
| PETALBURG CITY (0/0) | (10,19) | 8/2 PETALBURG CITY HOUSE1 | PETALBURG CITY | yes |
| PETALBURG CITY (0/0) | (7,5) | 8/0 PETALBURG CITY WALLYS HOUSE | PETALBURG CITY | yes |
| PETALBURG CITY (0/0) | (15,8) | 8/1 PETALBURG CITY GYM | PETALBURG CITY | yes |
| PETALBURG CITY (0/0) | (20,16) | 8/4 PETALBURG CITY POKEMON CENTER 1F | PETALBURG CITY | yes |
| PETALBURG CITY (0/0) | (20,24) | 8/3 PETALBURG CITY HOUSE2 | PETALBURG CITY | yes |
| PETALBURG CITY (0/0) | (25,12) | 8/6 PETALBURG CITY MART | PETALBURG CITY | yes |
| PETALBURG CITY WALLYS HOUSE (8/0) | (3,7) or (4,7) | 0/0 PETALBURG CITY | PETALBURG CITY | no |
| PETALBURG CITY GYM (8/1) | (4,111) or (5,111) | 0/0 PETALBURG CITY | PETALBURG CITY | no |
| PETALBURG CITY GYM (8/1) | (1,105) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,85) or (6,85) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,105) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,98) or (2,98) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,79) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,79) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,46) or (6,46) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,59) or (2,59) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,92) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,92) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,59) or (6,59) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,72) or (2,72) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,40) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,53) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,53) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,66) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,20) or (2,20) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,20) or (6,20) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,33) or (2,33) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,33) or (6,33) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,14) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,27) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (1,7) or (2,7) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY GYM (8/1) | (7,7) or (6,7) | 8/1 PETALBURG CITY GYM | this map | yes |
| PETALBURG CITY HOUSE1 (8/2) | (3,8) or (4,8) | 0/0 PETALBURG CITY | PETALBURG CITY | no |
| PETALBURG CITY HOUSE2 (8/3) | (3,7) or (4,7) | 0/0 PETALBURG CITY | PETALBURG CITY | no |
| PETALBURG CITY POKEMON CENTER 1F (8/4) | (7,8) or (6,8) | 0/0 PETALBURG CITY | PETALBURG CITY | yes |
| PETALBURG CITY POKEMON CENTER 1F (8/4) | (1,6) | 8/5 PETALBURG CITY POKEMON CENTER 2F | PETALBURG CITY | yes |
| PETALBURG CITY POKEMON CENTER 2F (8/5) | (1,6) | 8/4 PETALBURG CITY POKEMON CENTER 1F | PETALBURG CITY | no |
| PETALBURG CITY POKEMON CENTER 2F (8/5) | (5,1) | 25/60 UNION ROOM | a map with no location name | no |
| PETALBURG CITY POKEMON CENTER 2F (8/5) | (9,1) | 25/25 TRADE CENTER | a map with no location name | no |
| PETALBURG CITY MART (8/6) | (3,7) or (4,7) | 0/0 PETALBURG CITY | PETALBURG CITY | no |
| ROUTE104 (0/19) | (17,50) | 17/0 ROUTE104 MR BRINEYS HOUSE | ROUTE 104 | yes |
| ROUTE104 (0/19) | (5,18) | 17/1 ROUTE104 PRETTY PETAL FLOWER SHOP | ROUTE 104 | yes |
| ROUTE104 (0/19) | (10,30) or (11,30) | 24/11 PETALBURG WOODS | PETALBURG WOODS | yes |
| ROUTE104 (0/19) | (10,38) or (11,38) | 24/11 PETALBURG WOODS | PETALBURG WOODS | yes |
| ROUTE104 (0/19) | (32,42) or (33,42) | 24/11 PETALBURG WOODS | PETALBURG WOODS | yes |
| ROUTE104 MR BRINEYS HOUSE (17/0) | (5,8) or (6,8) | 0/19 ROUTE104 | ROUTE 104 | no |
| ROUTE104 PRETTY PETAL FLOWER SHOP (17/1) | (2,8) or (3,8) | 0/19 ROUTE104 | ROUTE 104 | no |
| PETALBURG WOODS (24/11) | (14,5) or (15,5) | 0/19 ROUTE104 | ROUTE 104 | yes |
| PETALBURG WOODS (24/11) | (16,38) or (17,38) | 0/19 ROUTE104 | ROUTE 104 | yes |
| PETALBURG WOODS (24/11) | (36,38) or (37,38) | 0/19 ROUTE104 | ROUTE 104 | yes |
| RUSTBORO CITY (0/3) | (27,19) | 11/3 RUSTBORO CITY GYM | RUSTBORO CITY | yes |
| RUSTBORO CITY (0/3) | (13,30) | 11/8 RUSTBORO CITY FLAT1 1F | RUSTBORO CITY | yes |
| RUSTBORO CITY (0/3) | (16,45) | 11/7 RUSTBORO CITY MART | RUSTBORO CITY | yes |
| RUSTBORO CITY (0/3) | (16,38) | 11/5 RUSTBORO CITY POKEMON CENTER 1F | RUSTBORO CITY | yes |
| RUSTBORO CITY (0/3) | (27,34) | 11/4 RUSTBORO CITY POKEMON SCHOOL | RUSTBORO CITY | yes |
| RUSTBORO CITY (0/3) | (11,15) or (12,15) | 11/0 RUSTBORO CITY DEVON CORP 1F | RUSTBORO CITY | yes |
| RUSTBORO CITY (0/3) | (33,19) | 11/10 RUSTBORO CITY HOUSE1 | RUSTBORO CITY | yes |
| RUSTBORO CITY (0/3) | (9,38) | 11/11 RUSTBORO CITY CUTTERS HOUSE | RUSTBORO CITY | yes |
| RUSTBORO CITY (0/3) | (30,28) | 11/12 RUSTBORO CITY HOUSE2 | RUSTBORO CITY | yes |
| RUSTBORO CITY (0/3) | (5,51) | 11/13 RUSTBORO CITY FLAT2 1F | RUSTBORO CITY | yes |
| RUSTBORO CITY (0/3) | (26,46) | 11/16 RUSTBORO CITY HOUSE3 | RUSTBORO CITY | yes |
| RUSTBORO CITY DEVON CORP 1F (11/0) | (5,8) or (6,8) | 0/3 RUSTBORO CITY | RUSTBORO CITY | yes |
| RUSTBORO CITY DEVON CORP 1F (11/0) | (14,1) | 11/1 RUSTBORO CITY DEVON CORP 2F | RUSTBORO CITY | yes |
| RUSTBORO CITY DEVON CORP 2F (11/1) | (14,1) | 11/0 RUSTBORO CITY DEVON CORP 1F | RUSTBORO CITY | yes |
| RUSTBORO CITY DEVON CORP 2F (11/1) | (2,1) | 11/2 RUSTBORO CITY DEVON CORP 3F | RUSTBORO CITY | yes |
| RUSTBORO CITY DEVON CORP 3F (11/2) | (2,1) | 11/1 RUSTBORO CITY DEVON CORP 2F | RUSTBORO CITY | no |
| RUSTBORO CITY GYM (11/3) | (5,19) or (6,19) | 0/3 RUSTBORO CITY | RUSTBORO CITY | no |
| RUSTBORO CITY POKEMON SCHOOL (11/4) | (5,10) or (6,10) | 0/3 RUSTBORO CITY | RUSTBORO CITY | no |
| RUSTBORO CITY POKEMON CENTER 1F (11/5) | (7,8) or (6,8) | 0/3 RUSTBORO CITY | RUSTBORO CITY | yes |
| RUSTBORO CITY POKEMON CENTER 1F (11/5) | (1,6) | 11/6 RUSTBORO CITY POKEMON CENTER 2F | RUSTBORO CITY | yes |
| RUSTBORO CITY POKEMON CENTER 2F (11/6) | (1,6) | 11/5 RUSTBORO CITY POKEMON CENTER 1F | RUSTBORO CITY | no |
| RUSTBORO CITY POKEMON CENTER 2F (11/6) | (5,1) | 25/60 UNION ROOM | a map with no location name | no |
| RUSTBORO CITY POKEMON CENTER 2F (11/6) | (9,1) | 25/25 TRADE CENTER | a map with no location name | no |
| RUSTBORO CITY MART (11/7) | (3,7) or (4,7) | 0/3 RUSTBORO CITY | RUSTBORO CITY | no |
| RUSTBORO CITY FLAT1 1F (11/8) | (6,7) or (7,7) | 0/3 RUSTBORO CITY | RUSTBORO CITY | yes |
| RUSTBORO CITY FLAT1 1F (11/8) | (2,1) | 11/9 RUSTBORO CITY FLAT1 2F | RUSTBORO CITY | yes |
| RUSTBORO CITY FLAT1 2F (11/9) | (2,1) | 11/8 RUSTBORO CITY FLAT1 1F | RUSTBORO CITY | no |
| RUSTBORO CITY HOUSE1 (11/10) | (5,7) or (6,7) | 0/3 RUSTBORO CITY | RUSTBORO CITY | no |
| RUSTBORO CITY CUTTERS HOUSE (11/11) | (5,8) or (6,8) | 0/3 RUSTBORO CITY | RUSTBORO CITY | no |
| RUSTBORO CITY HOUSE2 (11/12) | (5,8) or (6,8) | 0/3 RUSTBORO CITY | RUSTBORO CITY | no |
| RUSTBORO CITY FLAT2 1F (11/13) | (2,8) or (3,8) | 0/3 RUSTBORO CITY | RUSTBORO CITY | yes |
| RUSTBORO CITY FLAT2 1F (11/13) | (3,1) | 11/14 RUSTBORO CITY FLAT2 2F | RUSTBORO CITY | yes |
| RUSTBORO CITY FLAT2 2F (11/14) | (3,1) | 11/13 RUSTBORO CITY FLAT2 1F | RUSTBORO CITY | yes |
| RUSTBORO CITY FLAT2 2F (11/14) | (1,1) | 11/15 RUSTBORO CITY FLAT2 3F | RUSTBORO CITY | yes |
| RUSTBORO CITY FLAT2 3F (11/15) | (1,1) | 11/14 RUSTBORO CITY FLAT2 2F | RUSTBORO CITY | no |
| RUSTBORO CITY HOUSE3 (11/16) | (5,8) or (6,8) | 0/3 RUSTBORO CITY | RUSTBORO CITY | no |
| ROUTE116 (0/31) | (47,8) | 24/4 RUSTURF TUNNEL | RUSTURF TUNNEL | yes |
| ROUTE116 (0/31) | (38,8) | 21/0 ROUTE116 TUNNELERS REST HOUSE | ROUTE 116 | no |
| ROUTE116 (0/31) | (65,10) | 24/4 RUSTURF TUNNEL | RUSTURF TUNNEL | yes |
| ROUTE116 (0/31) | (59,13) | 24/104 TERRA CAVE ENTRANCE | TERRA CAVE | yes |
| ROUTE116 (0/31) | (79,6) | 24/104 TERRA CAVE ENTRANCE | TERRA CAVE | yes |
| ROUTE116 TUNNELERS REST HOUSE (21/0) | (4,8) or (5,8) | 0/31 ROUTE116 | ROUTE 116 | no |
| RUSTURF TUNNEL (24/4) | (4,10) | 0/31 ROUTE116 | ROUTE 116 | yes |
| RUSTURF TUNNEL (24/4) | (29,16) | 0/14 VERDANTURF TOWN | VERDANTURF TOWN | no |
| RUSTURF TUNNEL (24/4) | (18,20) | 0/31 ROUTE116 | ROUTE 116 | yes |
| ROUTE105 (0/20) | (9,20) | 24/67 ISLAND CAVE | ISLAND CAVE | no |
| ROUTE106 (0/21) | (48,16) | 24/7 GRANITE CAVE 1F | GRANITE CAVE | no |
| DEWFORD TOWN (0/11) | (3,3) | 3/4 DEWFORD TOWN HALL | DEWFORD TOWN | yes |
| DEWFORD TOWN (0/11) | (2,10) | 3/1 DEWFORD TOWN POKEMON CENTER 1F | DEWFORD TOWN | yes |
| DEWFORD TOWN (0/11) | (8,17) | 3/3 DEWFORD TOWN GYM | DEWFORD TOWN | yes |
| DEWFORD TOWN (0/11) | (17,14) | 3/0 DEWFORD TOWN HOUSE1 | DEWFORD TOWN | yes |
| DEWFORD TOWN (0/11) | (8,8) | 3/5 DEWFORD TOWN HOUSE2 | DEWFORD TOWN | yes |
| DEWFORD TOWN HOUSE1 (3/0) | (3,7) or (4,7) | 0/11 DEWFORD TOWN | DEWFORD TOWN | no |
| DEWFORD TOWN POKEMON CENTER 1F (3/1) | (7,8) or (6,8) | 0/11 DEWFORD TOWN | DEWFORD TOWN | yes |
| DEWFORD TOWN POKEMON CENTER 1F (3/1) | (1,6) | 3/2 DEWFORD TOWN POKEMON CENTER 2F | DEWFORD TOWN | yes |
| DEWFORD TOWN POKEMON CENTER 2F (3/2) | (1,6) | 3/1 DEWFORD TOWN POKEMON CENTER 1F | DEWFORD TOWN | no |
| DEWFORD TOWN POKEMON CENTER 2F (3/2) | (5,1) | 25/60 UNION ROOM | a map with no location name | no |
| DEWFORD TOWN POKEMON CENTER 2F (3/2) | (9,1) | 25/25 TRADE CENTER | a map with no location name | no |
| DEWFORD TOWN GYM (3/3) | (5,27) or (6,27) | 0/11 DEWFORD TOWN | DEWFORD TOWN | no |
| DEWFORD TOWN HALL (3/4) | (5,8) or (6,8) | 0/11 DEWFORD TOWN | DEWFORD TOWN | no |
| DEWFORD TOWN HOUSE2 (3/5) | (3,8) or (4,8) | 0/11 DEWFORD TOWN | DEWFORD TOWN | no |

## Multi-Model Review Log

Round 1, frozen packet base ee95b866 (main) .. head 79a2fc3a, `git diff --binary` SHA-256
d1dbec8402905b281c73e16347b1f422ae85d018ec83d51bae34c845504bf5df. Codex waived (coordinator).
Local inference reviewers not used.
- Grok lane: cursor-agent `cursor-grok-4.5-high`, --mode ask: VERDICT: LGTM. Non-blocking:
  test reader not cached; flood not memoised per (map, start).
- Claude lane: `claude -p` unavailable (OAuth expired, both default and ~/.claude-review);
  Cursor `claude-opus-5-thinking-high` and `claude-sonnet-5-thinking-high` hit Cursor usage
  limits; standing-authorized fallback, a fresh read-only Claude subagent on the same packet
  (HEAD/status/digest verified before and after): VERDICT: LGTM. Hardening follow-ups (not
  fixed, outside the frozen contract or no failing case): current-map ROM read even when no name
  repeats; flood rebuilt per warp; DIVE/EMERGE connections would count toward shared names (none
  Littleroot..Dewford); two warp events on one tile would print twice. Operator wording note:
  interiors have show_map_name false, so their section name is what the save/start screens show,
  not a popup on arrival. Principles PB6 evidence corrected: only RomMap reads are cached.

## Surprises

## Landing
- 2026-10-20 4:35 PM EDT: exit-labels-v2 joins the bundle arm of experiments/fixed/bundle-v-control.json and bundle-cook-1h.json (coordinator slot; control untouched; whole-map-pair definitions frozen). Naming: The operator did not object to option 1 (name every destination by its location-popup name).
