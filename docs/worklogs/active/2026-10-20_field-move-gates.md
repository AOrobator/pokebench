# field-move-gates-v1: one module for every field-move and item gate

Status: approved by the operator 7:12 PM ET 2026-10-20 ("lgtm, lets match surf v2, build it and land your changes after a review, these changes need to go in the bundle"). Branch `claude/field-move-gates`, worktree
`~/dev/pokebench/.claude/worktrees/agent-a5201c329a3a72a36` (isolated agent worktree; the coordinator lands it). Companion: the no-progress guard
`same-target-no-progress-v1` (approved 2026-10-20) is built separately on `claude/same-target-no-progress`.

## Problem Statement

Control run a8f9 (`2026-10-20T16-14-34_qwen36-gpu0_a8f9`) looped in RUSTURF TUNNEL from turn 1282
(6:42 PM) calling navigate_to (29,16), then (18,20). pokeemerald puts two BREAKABLE_ROCK objects at
(24,4) and (24,5), the only way east. The server's foot flood (exit-reachability-v1) ignores
objects, so both warps read `foot`, the untaken-exits line and stall briefings offered them, and
navigate_to said "call navigate_to again to continue". Surf already has a gate (surf-gated-exits-v1:
Balance Badge + a party Pokémon that knows SURF); Cut, Rock Smash, Strength, Waterfall, Dive and the
bikes have none. The operator (2026-10-20): treat them all the way Surf is treated, located together in code,
and fix the whole class.

## Skills Loaded

feature-worklog, feature-switch, feature-explainer, pokebench-game-state, agent-observability,
close-the-loop, execute-worklog, multi-model-review (cloud lanes: Claude, Grok, GPT/Codex).

## Source facts (pokeemerald, cited in the research notes)

| Gate | Game marks it by | Passable when | Game's text when you can't |
|---|---|---|---|
| Cut tree | object CUTTABLE_TREE, `EventScript_CutTree` | Stone Badge (FLAG_BADGE01_GET) + non-egg party mon knows CUT | "This tree looks like it can be CUT down!" |
| Rock Smash rock | object BREAKABLE_ROCK, `EventScript_RockSmash` | Dynamo Badge (03) + ROCK SMASH | "It's a rugged rock, but a POKéMON may be able to smash it." |
| Strength boulder | object PUSHABLE_BOULDER | Heat Badge (04) + STRENGTH, and the tile beyond free | "It's a big boulder, but a POKéMON may be able to push it aside." |
| Surf | water behaviors at elevation 1 | Balance Badge (05) + SURF (existing surf gate, moved here) | none (silent) |
| Waterfall | MB_WATERFALL 0x13 | Rain Badge (08) + WATERFALL, surfing north | "A wall of water is crashing down with a mighty roar." |
| Dive | deep water 0x11/0x12/0x14 + a dive connection | Mind Badge (07) + DIVE | none (silent) |
| Mach Bike | muddy slope 0xD0 (one-way down on foot), cracked floor 0xD2 (drop to floor below) | Mach Bike at full speed | none |
| Acro Bike | bumpy slope 0xD1, rails 0xD3–0xD6 (blocked on foot) | Acro Bike tricks | none |
| Go-Goggles | Route 111 desert coord triggers | GO GOGGLES in the bag | "The sandstorm is vicious. It's impossible to keep going." |
| Devon Scope | invisible Kecleon objects (Routes 119/120, Fortree) | DEVON SCOPE + the encounter | (object stays) |

Flash darkness never blocks movement. Fly, Teleport and Dig gate no tiles. Trees, rocks and boulders
use temp hide flags and come back on every map load (Rusturf's rocks are permanent); the harness reads
the live template flags, so it needs no memory of "cleared".

## Audit, Littleroot through Dewford Gym (81 maps)

- Exit-gating obstacle: only the two Rusturf rocks. They cut off (29,16) → Verdanturf, (18,20) → the
  Route 116 east pocket, and the Max Ether at (30,2).
- Cut trees (10) gate items only: Petalburg Woods (19,10)/(19,11), Route 103 (72,8), Route 116 (5),
  Route 104 (35,22).
- Rocks elsewhere: Route 115 (1) and Granite Cave B2F (7) cut off nothing on foot.
- Mach Bike terrain: Granite Cave B1F muddy slope (9,9)–(9,10) and 62 cracked-floor tiles; Route 115
  muddy slope (28,8)–(28,9). Walking onto cracked floor drops you to B2F.
- Water: already gated by Surf; a water-blind flood would join the mainland to Dewford and Slateport.
- None in the region: Strength boulders, waterfalls, dive spots, Acro rails or slopes.

## Architecture

1. **`env/pokebench_env/field_moves.py`** (new, the one place):
   - `GATES`: the table above as typed data (kind, how the game marks it, move id, badge flag, item,
     avatar state, the game's text and its pokeemerald label).
   - `capabilities(party, badges, bag, avatar_flags)`: which gates are open now, `None` where an unread
     value could change the answer (as `surf_use` does today).
   - `obstacles(read, map_id)`: obstacle objects from SaveBlock1.objectEventTemplates (loaded or not,
     hide flag live, as offscreen-objects-v1 reads them) and gated terrain tiles from the full map.
   - `reachable(...)`: today's surf_gate flood plus closed obstacles as walls, muddy slopes one-way
     south, cracked floor as a drop, rails and bumpy slopes blocked on foot.
   - `surf_gate.py` keeps its public names as thin wrappers over this, so the OFF state is unchanged.
2. **Server state:** with the switch on, `exit_reach` uses the gated flood, and each warp and
   connection whose label changed gains `blocked_by: [{kind, tiles, needs}]`. A new
   `field_obstacles` list gives each obstacle on the map with its tiles, whether it is open now, and
   the game's text. exit-labels-v2's arrival-reach flood uses the destination map's templates the same
   way.
3. **Readout:** one line per closed obstacle on the map, map facts only:
   `BREAKABLE_ROCK at (24,4) and (24,5) blocks the way to (29,16) -> VERDANTURF TOWN and (18,20) -> ROUTE116; the game says: "It's a rugged rock, but a POKéMON may be able to smash it."`
   Exits behind it already drop out of the untaken-exits line and briefings via exit-reachability-v1.
4. **Agent planners** (navigation.ts local, visited and full): closed obstacle tiles from
   `field_obstacles` count as occupied even when the object is not loaded; muddy slopes are one-way;
   cracked floor is avoided. navigate_to's "cannot be reached on foot" and refusal reasons name the
   obstacle and quote its text. `exitBlock` keeps being the one reader, so untaken exits, briefings,
   the ways-off line, unfinished-activity and harness-trust pick it up with no extra code.

## Invariants

- INV-1: switch OFF is byte-for-byte today's state JSON, readout and planner output. Test: rerender
  golden fixtures with the switch off.
- INV-2: an exit is never labelled unreachable while a walkable way exists (the flood stays a superset:
  people still ignored, an obstacle closes only when its gate is known closed, `None` keeps it open).
  Test: property test over the audit maps.
- INV-3: every obstacle text is a pokeemerald string, quoted whole. Test: table test against the
  labels.
- INV-4: no route, order or place the game has not shown. Test: readout snapshot review.

## Security Review

No new subprocesses, network or file writes; reads RAM the server already reads. ROM untouched.

## Milestones

**M1 — the gate table and capabilities (Python)**
- [x] Tests: table rows against pokeemerald labels; capability truth table (badges × party × eggs ×
      unread); a8f9 raw RAM at seq 41177 yields both Rusturf rocks closed; surf_gate wrappers unchanged.
      (env/tests/env/test_field_moves.py; fixture env/tests/env/fixtures/field-moves-a8f9.json.gz)
- [x] COMMIT RED / implement / gates / COMMIT GREEN
  RED: test_field_moves.py fails at import (no pokebench_env.field_moves).
  COMMIT: `test: field-move-gates-v1 gate table, capabilities and the a8f9 Rusturf rocks (RED)` (c886f952)
  GREEN: env/pokebench_env/field_moves.py (GATES, capabilities, read_object_obstacles, and the
  surf_use / reachable / classify / water_only flood moved from surf_gate.py, which re-exports them
  unchanged). Gates: just lint 0, just build 0, just coverage 0. Tests: env 3022 passed; agent 2977;
  viewer 1436. Coverage: env lines 97.12 / branches 92.67 / functions 100; agent 97.21 stmts /
  92.96 branches / 97.6 functions / 99.16 lines; viewer 95.09 / 91.06 / 93.85 / 97.7 (floor 90).

**M2 — gated flood, exit labels and readout (Python)**
- [ ] Tests: a8f9 seq 41177 labels (29,16) and (18,20) `none` with `blocked_by` the rocks, (4,10) foot;
      Route 115 and Granite Cave B1F muddy slopes one-way; cracked floor; exit-labels-v2 arrival reach
      uses destination templates; OFF golden.
- [ ] COMMIT RED / implement / gates / COMMIT GREEN

**M3 — planners, navigation messages, switch registration (TypeScript)**
- [ ] Tests: local and full planners route around a closed rock not yet loaded; a8f9 navigate_to
      result says (29,16) cannot be reached on foot and names the rock; untaken exits omit it.
- [ ] Register `field-move-gates-v1` (observation, bundle arm only, default off, needs
      exit-reachability-v1); feature card text.
- [ ] COMMIT RED / implement / gates / COMMIT GREEN

**M4 — audit test, explainer, review**
- [ ] Fixture of the audit's 81 maps (expected obstacles and cut-off exits) checked against the live
      server on the save states we have.
- [ ] Explainer `docs/explainers/field-move-gates-v1.html` with diagrams.
- [ ] Review loop: principles, Claude, Grok, GPT/Codex; then ask the coordinator for the merge slot.

## Deferred

- DEFERRED (outside the region through Dewford, rule rows and unit tests only): Waterfall, Dive,
  Acro Bike, Go-Goggles and Devon Scope get table rows and capability tests in M1, with no map
  fixtures until a run reaches those maps.
- DEFERRED (approximation): Strength boulders count as open when Strength is usable, without
  simulating pushes.

## Session Log

- 2026-10-20 7:25 PM ET: worktree set up (submodule from the main checkout's reference, gitignored
  .env with POKEBENCH_ROM only, mgba binding symlinked into env/.venv). Baseline env pytest: 2998
  passed.
- Fixture field-moves-a8f9.json.gz built by a scratch recorder (scratchpad fmg_fixture.py) from
  raw-ram/00022846.json.gz (sha256 063c949b…83cb): the RAM rerender reads with every server switch
  on and with the run's own, plus SaveBlock1/2, gObjectEvents, gPlayerAvatar and the party whole.
  No ROM bytes, no frames. It also keeps the recorded readout and navigate_to line.
- Verified against pokeemerald (not the notes): rocks at (24,5) FLAG_HIDE_RUSTURF_TUNNEL_ROCK_1
  (0x3A3) and (24,4) _ROCK_2 (0x3A4), elevation 3; item ids MACH_BIKE 259, ACRO_BIKE 272,
  GO_GOGGLES 279, DEVON_SCOPE 288; behaviors 0xD0-0xD6, 0x13, 0x66; the Route 111 sandstorm
  triggers are (11..14,61) down and (12,44) (13,43) (14,42) (16,40) (17,39) (18,38) left (the notes
  said x 10..14; (10,61) is the plain SandstormTrigger); the Route 120 bridge Kecleon (12,16,
  elevation 4) is removed by the Steven event, not the Devon Scope, so it is not a gate here.

## Decisions

- Readout wording matches surf-gated-exits-v2 (the operator 2026-10-20): quote the game's text and say the
  way "needs a field move you cannot use yet"; never name the badge or move.
- Lands on local main after the review loop (Claude, Grok, GPT/Codex LGTM), then joins the bundle arm.
