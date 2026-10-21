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
- [x] Tests: a8f9 seq 41177 labels (29,16) and (18,20) `none` with `blocked_by` the rocks, (4,10) foot;
      Route 115 and Granite Cave B1F muddy slopes one-way; cracked floor; exit-labels-v2 arrival reach
      uses destination templates; OFF golden. (env/tests/env/test_field_move_flood.py, plus rails,
      waterfall, Route 111 sandstorm, survey/blocked_by and the superset property on random maps.)
- [x] COMMIT RED / implement / gates / COMMIT GREEN
  RED: test_field_move_flood.py fails at import (no MapGates/map_gates/survey/terrain_obstacles).
  COMMIT: `test: field-move-gates-v1 gated flood, blocked_by, field_obstacles and readout on a8f9 (RED)` (2f7c4e46)
  GREEN: field_moves gains terrain_obstacles, rom_object_obstacles, FloodRules/MapGates, survey
  (gated and open floods, what lies past each closed frontier obstacle, blocked_by per cut-off
  exit) and FieldObstacles (state JSON, readout lines, warp/connection notes). exit_reach,
  surf_gate and exit-labels-v2's arrival flood take the gates; game_state/rerender/readout wire
  field-move-gates-v1 (needs exit-reachability-v1; unreadable templates leave the flood ungated).
  Registration moved here (see deviation): Python SERVER_FEATURES + default-off list, agent
  SWITCHABLE_FEATURES/FEATURES/playHarnessFeatures/SERVER_FEATURES, presets, flagFeatures,
  LEGACY_ALL_ON, viewer DEFAULT_NEXT_RUN; 79 agent registry tests re-indexed by one (scripted:
  bump negative indices on the failing lines, append the id to the server-env strings and the
  experiment-incumbent filters; two lines with two indices fixed by hand).
  RED-test corrections made in GREEN (test bugs, not behavior): Granite Cave B1F is two rooms, so
  the ladder test starts from #1 (4,21) and checks #4-#6 none gated / foot ungated, plus the slope
  from #4; stepping up onto a slope is allowed and slides back (flood superset), so (1,2) is
  reached from (1,3); the Go-Goggles unknown case passes bag None; the OFF golden drops the four
  lines the agent adds after Position (untaken exits, people ledger x2, story characters).
  Gates: just lint 0, just build 0, just coverage 0 (one rerun: a viewer server.test.ts socket
  timing flake "received only 2 frames", passed on rerun, unrelated). Tests: env 3054 passed;
  agent 2977; viewer 1436. Coverage: env lines 97.19 / branches 92.79 / functions 100; agent
  97.21 / 92.96 / 97.6 / 99.16; viewer 95.09 / 91.06 / 93.85 / 97.7.
  Golden: the a8f9 state body re-read from RAM with the switch off equals the recorded state 41177
  byte for byte (agent fixture builder asserts it); the readout equals the recorded tool result
  minus the agent's lines.
  ON (a8f9): (4,10) foot; (29,16) and (18,20) none, blocked_by [0, 1]; readout adds
  "Field obstacles on this map (from the map's own object list and its tiles):" and "- BREAKABLE_ROCK
  at (24,4) and (24,5) close every way on foot to (29,16) -> VERDANTURF TOWN (map 0/14) and (18,20)
  -> ROUTE116 (map 0/31): it needs a field move you cannot use yet; the game says: "It's a rugged
  rock, but a POKéMON may be able to smash it.""
  Deviation (recorded before GREEN): the switch registration moves from M3 into M2 GREEN, because
  test_feature_switches.py requires the Python and TypeScript SERVER_FEATURES lists to match, and
  the Python default-off list is what keeps the switch off by default.

**M3 — planners, navigation messages, switch registration (TypeScript)**
- [x] Tests: local and full planners route around a closed rock not yet loaded; a8f9 navigate_to
      result says (29,16) cannot be reached on foot and names the rock; untaken exits omit it.
      (packages/agent/src/field-move-gates.test.ts; fixture src/fixtures/field-moves-a8f9-states.json.gz
      built by scratchpad fmg_agent_fixture.py, which asserts states.off equals the recorded state body.)
  RED: 11 of 13 fail (schema rejects field_obstacles, no gatedState/slopes/obstacles in exitBlock).
- [x] Register `field-move-gates-v1` (observation, bundle arm only, default off, needs
      exit-reachability-v1); feature card text. (Registry landed in M2 GREEN 49efe99a; pending
      experiment experiments/field-move-gates-v1.json, activation RUSTURF_TUNNEL, exit-reachability-v1 on
      in both arms, not queued; readiness row in docs/experiments/readiness.md.)
- [x] COMMIT RED / implement / gates / COMMIT GREEN
  COMMIT: `test: field-move-gates-v1 planners, navigate_to refusal and untaken exits on a8f9 (RED)` (8efbdfd0)
  GREEN: events.ts schema (field_obstacles; exit_reach blocked_by; schemas/events.v1.json via just
  schema); surf-gate.ts exitBlock gains obstacles(x,y) (closed obstacles whose beyond mask holds the
  tile or a neighbour, when the tile is off the foot area) and passesText, ReachSwitches.gates;
  navigation.ts gatedState (closed obstacle objects occupied, loaded or not), slopes (DOWN only,
  slide to the first non-slope tile below; walked/routeTiles/span follow the slide), a pre-walk
  refusal naming the obstacles, and the command-limit and person texts naming them; withNavigation
  passes fieldMoveGates; semantic-navigation plans approaches over gatedState with slopes.
  Wiring check: deleting `fieldMoveGates:features["field-move-gates-v1"]` from withNavigation turned
  4 of 13 field-move-gates tests red; restored, 13 green. Server: deleting `field_moves_enabled=`
  from rerender.read_state turned 4 of 44 (test_field_move_flood + test_rerender) red; restored, green.
  Gates: just lint 0, just coverage 0. Tests: env 3054; agent 2992 (2990 + 2 wording tests); viewer
  1436. Coverage: env lines 97.19 / branches 92.79 / functions 100; agent 97.11 / 92.87 / 97.62 /
  99.15 (navigation.ts 94.19 / 91.92 / 98.28 / 99.61; surf-gate.ts 100 / 90.36 / 100 / 100); viewer
  95.09 / 91.07 / 93.85 / 97.7.
  just experiments-check: the only problems printed are pre-existing starter-decision-salience
  trials.jsonl lines; none for this entry.

Review cadence: the worklog runs the multi-model review once, in M4, on the whole frozen packet
(M1-M3 gates are recorded per milestone).

**M4 — audit test, explainer, review**
- [x] Fixture of the audit's 81 maps (expected obstacles and cut-off exits) checked against the live
      server on the save states we have.
      COMMIT: `feat: field-move-gates-v1 ...planners...` (65d2cf0e) closed M3.
      env/tests/env/fixtures/field-moves-audit.json (from the research final.json, computed from the
      decomp's map.json/map.bin, not the server) and test_field_move_audit.py (247 cases): every map's
      size, obstacle objects, slope/cracked/water tile counts match through the server's ROM path; the
      audit's cut-offs are none (Rusturf from (4,10): (29,16),(18,20); B1F from (4,21): (8,5),(12,3),
      (29,2); Route 115 from (21,6): (36,10)); no other map has an exit an object cuts off (Rusturf from
      the east also cuts (4,10)); INV-2 from every warp of every map. No RED phase: verification of M2.
      Live server (just probe on recorded checkpoints, isolated run dirs under the scratchpad, port
      8933, 127.0.0.1, stopped after; POKEBENCH_FEATURES_OFF "" = on, "field-move-gates-v1" = off):
      PETALBURG_WOODS (petalburg2h-r1-whole-map) ON: "Field obstacles on this map (from the map's own
      object list and its tiles):" / "- CUTTABLE_TREE at (19,10) and (19,11): it needs a field move you
      cannot use yet; the game says: "This tree looks like it can be CUT down!"", all six warps foot;
      OFF: no block, no field_obstacles, same six foot labels. ROUTE_104 (petalburg-rerun-b) ON: "-
      CUTTABLE_TREE at (35,22): ...". No checkpoint exists in Rusturf; the Rusturf smoke is the
      server's rerender entrypoint (python -m pokebench_env.rerender) on a8f9 raw-ram/00022846: ON adds
      the header and "- BREAKABLE_ROCK at (24,4) and (24,5) close every way on foot to (29,16) ->
      VERDANTURF TOWN (map 0/14) and (18,20) -> ROUTE116 (map 0/31): it needs a field move you cannot
      use yet; the game says: "It's a rugged rock, but a POKéMON may be able to smash it."", the two
      warp notes and "(not reachable on foot from where you stand)" on their destination lines; OFF
      prints neither. (just probe-decision cannot read a8f9: its events.jsonl exceeds a JS string.)
- [x] Explainer `docs/explainers/field-move-gates-v1.html` with diagrams (Rusturf off/on drawn from the
      a8f9 RAM, gate decision, wiring, gate table, audit). just pages-check prints nothing; opened
      locally; README entry; FEATURE_EXPLAINERS mapping with panels.test.ts and server.test.ts cases.
      Not done: the live READ EXPLAINER click in the 8790 viewer (main build; it is not restarted from
      a branch; check after landing with just viewer-main).
  M3 follow-up in this commit: a tsc narrowing error in a test closure (field possibly undefined).
  Gates: just lint 0, just coverage 0. Tests: env 3301; agent 2992; viewer 1438. Coverage: env 97.19
  / 92.79 / 100; agent 97.11 / 92.89 / 97.62 / 99.15; viewer 95.09 / 91.07 / 93.85 / 97.7.
- [ ] Review loop: principles, Claude, Grok, GPT/Codex; then ask the coordinator for the merge slot.
  COMMIT: `test: field-move-gates-v1 audit of 81 maps; explainer linked from the feature card` (0b6826d0)
  Sync with main 563cbaad (gym-readiness-readout-v1, party-item-confirmation-v1, same-target-no-progress-v1
  landed meanwhile): field-move-gates-v1 stays last in every registry list, after main's three; the 48
  conflicted agent registry tests take main's side and are re-indexed by one (same scripted method),
  plus the Python index tests main and this branch had both bumped. Gates on the merged tip: just lint 0,
  just build 0, just coverage 0. Tests: env 3318; agent 3028; viewer 1443. Coverage: env 97.20 / 92.84 /
  100; agent 97.12 / 92.93 / 97.59 / 99.14; viewer 95.09 / 91.06 / 93.85 / 97.7.
  COMMIT: `Merge branch 'main' into claude/field-move-gates` (638e19bf)
  Second sync, main a2afc58a (story-progress-clock-v1 landed while sealing): same method, 20 conflicts.
  Gates on that tip: just lint 0, just build 0, just coverage 0, just verify-vendor OK. Tests: env 3318;
  agent 3045; viewer 1444. Coverage: env 97.20 / 92.84 / 100; agent 97.13 / 92.97 / 97.59 / 99.14;
  viewer 95.09 / 91.07 / 93.85 / 97.7.
  Principles self-review (PB1-PB13, zero FAIL): written to the review packet folder
  (scratchpad fmg-review/principles-adherence.md); frozen boundary fmg-review/frozen-boundary.md.
  COMMIT: `Merge branch 'main' into claude/field-move-gates` (8b453f9c); third sync, main 5ab3f577
  (story-progress-clock bundle config, clean merge). Gates on this tip: lint 0, coverage 0 (env 3318,
  agent 3045, viewer 1444; same percentages).

## Deferred

- DEFERRED (outside the region through Dewford, rule rows and unit tests only): Waterfall, Dive,
  Acro Bike, Go-Goggles and Devon Scope get table rows and capability tests in M1, with no map
  fixtures until a run reaches those maps.
- DEFERRED (approximation): Strength boulders count as open when Strength is usable, without
  simulating pushes.

## Multi-Model Review Log

Round 1. Frozen packet base 5ab3f5771d4562fe3a76087632fb2f4023804443 (main) .. head
b85234ba0fd459dd46a4f4e0a9c9c88edf64c099, binary diff SHA-256
c6c42945590759a5024267a54f8e1c05ff1fc57b270c8d556fc45f5a1da43649. Principles self-review PB1-PB13, zero
FAIL. Local inference reviewers not used. HEAD/status verified unchanged before and after every lane.
- Grok lane: cursor-agent `cursor-grok-4.5-high`, --mode ask: VERDICT: LGTM. Follow-ups (not fixed):
  wet `beyond` not shipped (water-only cut-offs keep the generic refusal); test caching; rom_object_obstacles
  keys raw ROM graphics (no GFX_VAR obstacle in Emerald).
- Claude lane: Claude CLI failed ("OAuth session expired and could not be refreshed"; ~/.claude-review
  loggedIn false, default login too); Cursor `claude-opus-5-thinking-high`, `claude-opus-5-5-medium` and
  `claude-sonnet-5-thinking-high` hit Cursor usage limits; per the operator's standing word
  (claude-review-lane memory, 2026-10-16) a fresh read-only Claude (opus) subagent reviewed the same
  packet and reproduced the digest: VERDICT: LGTM. Follow-ups: Kecleon named by sprite kind (operator
  wording question); forced steps assume the step succeeds (no decomp slope/waterfall case breaks it);
  the slide checks only the first slope tile and the landing; a refusal after presses lacks the
  "walked from" prefix; the experiment's source.commit is pinned at landing.
- GPT lane: Cursor `gpt-5.6-sol-xhigh` hit its usage limit; Codex's default model `gpt-6.1-sol` is refused
  for a ChatGPT account; isolated Codex with `-m gpt-5.6-sol -c model_reasoning_effort=xhigh`, read-only
  sandbox, ephemeral (standing harness switch): VERDICT: BLOCKING, four items. Triage:
  1. Test I/O and superlinear setup (MapNames loaded per call, audit floods per warp): rebut, proof
     beyond the project skills (the three suites run in 1.3 s); MapNames cached in the flood tests anyway.
  2. INV-2 tests prove gated <= ungated, not walkable <= gated: rebut. The flood without rules is
     exit-reachability-v1's accepted superset; gating removes only tiles of obstacles the audit matches
     one for one against the decomp's templates and terrain, and only when the gate is known closed
     (unknown == ungated is asserted from every warp of 81 maps). An independent walkability oracle is
     proof beyond the skills.
  3. OFF state JSON compared only on exit_reach: fix. The OFF test now compares the whole re-read state
     body with the recorded state event 41177 (the agent fixture's states.off). The OFF navigate_to line
     needs the run's eight replayed states, which no fixture holds; the OFF planner path is unchanged code
     (fieldMoveGates false) under its existing tests: rebut that half.
  4. Dive text: fix. The Dive row now quotes Text_CantDive ("The sea is deep here. A POKéMON may be able
     to go underwater."), shown with the Mind Badge and no non-egg DIVE Pokémon, checked against the
     source like the other rows. Explainer row updated.
  Kecleon sprite naming: scope expansion, left for the operator.
  Fix commit gates: just lint 0, just coverage 0 (env 3319, agent 3045, viewer 1444; same percentages).
  COMMIT: `fix: field-move-gates-v1 quotes the Dive text and the OFF golden compares the whole state body (review round 1)` (ac6ffee6)
  Fourth sync, main 9c9755bb (yes-no-answer-readout-v1, a server switch, plus lane-lease fixes): 30
  conflicts, same method; field-move-gates-v1 stays last in both SERVER_FEATURES lists and the default-off
  string. Gates on the merged tip: just lint 0, just build 0, just coverage 0, verify-vendor OK. Tests: env
  3470; agent 3046; viewer 1459. Coverage: env 97.21 / 92.86 / 100; agent 97.13 / 92.97 / 97.59 / 99.14;
  viewer 95.14 / 91.07 / 93.84 / 97.72.
  COMMIT: `Merge branch 'main' into claude/field-move-gates` (bcbb73f0); fifth sync, main 24648e12 (probes
  viewer page, clean merge). Gates on this tip: lint 0, build 0, coverage 0 (env 3470, agent 3046, viewer
  1499; viewer 95.23 / 91.05 / 94.14 / 97.8, other stacks unchanged).

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

## Landing (2026-10-20, 9:55 PM ET)

- Round 2 on packet 24648e12..85f64812 (sha256 d07e109e…): Claude (read-only subagent) LGTM, Grok LGTM, Codex BLOCKING on test-fixture I/O and flood counts only. The operator 9:42 PM ET: land it and speed up the tests in a follow-up ("yes and yes").
- Added the switch to the bundle arm of bundle-v-control, bundle-cook-1h and whole-map-cook-1h (false in base); open-goal-prompt.test.ts excludes it like the other newer bundle switches. Pending experiment source.commit pinned to 85f64812.
- Gates: lint and build clean; agent 3046/3046, viewer 1499/1499, pytest 3470; coverage agent 97.13/92.97/97.59/99.14, viewer 95.23/91.05/94.14/97.8, Python lines 97.21 branches 92.86 functions 100.
- DEFERRED (follow-up, the operator): bound the audit tests' fixture I/O and per-warp floods (Codex round 2). Open questions from review: Kecleon named by sprite kind; "every way to" wording for water-only cut-offs.
