# Native Surf navigation

Status: in progress.

Operator request (the operator, 2026-11-04, in thread "Add native Surf navigation"): proper native support for surfing as a correctness fix, treated like land navigation with A*. The harness never launches Surf. Semantic navigation works while surfing. Waterfalls, currents and Dive follow the field-move pattern: the planner knows what the terrain does, only the model uses a move. On foot with a target across water, the tool walks to the best shore tile, stops facing the water and says to press A. Approved: "lgtm, continue, land your changes on main, on in both arms as a correctness fix".

Evidence: run 274b turns 1859-1867, the first crossing in 800 recorded runs. T1861 guard rejected a batch and pointed at navigate_to; T1862 navigate_to refused; 9 turns where 3 should do; T1836, T1837 and T1848 counted map rows by hand.

Working folder: a plain clone at /private/tmp/pb-surf-nav, branch claude/surf-navigation, because this session must not create a git worktree and the shared checkout has to stay on main. The branch reaches main with a fetch into the main repository, then a fast-forward merge.

## Design

Switch `surf-navigation-v1`, server switch, needs `safe-navigation-strides-v1`, default off, onInBoth, base true.

Game rules (pret/pokeemerald 731ad5b, field_player_avatar.c):
- Surfing is avatar flag bit 3. The player is at elevation 1 on water (274b seq 120397).
- CanStopSurfing: a step that would be an elevation mismatch dismounts when the tile is at elevation 3 and no object stands there at elevation 3.
- IsPlayerFacingSurfableFishableWater: launch needs player elevation 3, an elevation-mismatch step and fishable water or a current.
- A held press moves 2 tiles on water (5 of 5 at T1863-T1867), so water steps must be frame-owned strides.
- Currents 0x50-0x53 and waterfall 0x13 are forced movement (DoForcedMovement).

- [x] M1 Game server: water strides and connection water edges. Focused: 24 env tests pass.
- [x] M2 Agent: A* surf mode, walker, shore stop, semantic navigation, exit lines, prompt. 30 focused tests pass; 310 existing navigation, semantic, feature and preset tests pass. Wiring proof: removing surfNavigation from withNavigation turned "the feature set reaches the walker" red (expected 0 to be greater than 0); restored, it passes.
- [x] M3 Agent: currents and waterfalls as forced movement. Planner and gate tests only; no save reaches a current, see the rehearsal note.
- [x] M4 Config, explainer, emulator rehearsal

Rehearsal (2026-11-04 1:50 PM, port 8195, private run dir in scratch, real tools from this build): STONE_BADGE gold-run save with BADGE05 and MOVE_SURF written into RAM and the party checksum fixed, on Route 104. navigate_to (28,12) on foot stopped at (25,12) facing (26,12) after 15 actions; A opened the game's "Would you like to SURF?" prompt; A surfed. navigate_to (35,20) arrived exactly, 4 strides with surfing:true. Wild encounters stopped strides and the walk resumed. navigate_to (31,18) from water landed, surfing false. navigate_to_target NORTH from water crossed, landed and left the map to RUSTBORO CITY. No traceback in the server log. Not proven on the emulator: currents, waterfalls, water warps, a map exit from a water edge tile (no save reaches one); those have planner and fake tests only.
- [ ] M5 Gates, review, landing. First gate pass at 68e3d5a7c: lint, test (agent 2409, viewer 802, env 2762, gateway 38, floors and no-io-proof OK), verify-vendor all green. Then added the stop at a waterfall foot and second crossings; second pass at 2bb8b4544 green too.

Rehearsal note: the one-off scratch save script copied the ROM to a temp folder, against PB12. Deleted the same session; reported to the operator. The diff touches no ROM path.

Activation: on in both arms with this landing, by operator instruction. No comparison is registered. Run 274b is pinned and unaffected.

## Multi-Model Review Log

M1 RED: env/tests/env/test_surf_navigation.py fails at collection.

M2/M3 RED: packages/agent/src/surf-navigation.test.ts.

Round 1, base c9bb2a905, head b65a22f73, diff sha 1078d593: Claude BLOCKING (bridges were walls to a surfer: Fix, SURF_BRIDGES in planner, strides and server). GPT BLOCKING: launch onto a current kept a free node (Fix, the launch resumes where the push ends); "Exits you can reach from the water" overclaimed against currents (Fix, reworded to say currents and waterfalls are not counted); water_edges ON untested (Fix, test_read_topology_asks_for_the_surfing_tiles_when_on, red with the ON branch deleted, green restored; the rehearsal also read real water_edges counts: Rustboro NORTH 5 foot, 11 water). Grok lane: cursor usage limit on cursor-grok-4.5-high and grok-4.7-medium, so per the operator's standing rule Claude, GPT and one fresh read-only fallback reviewer are full approval. Claude's hardening notes (toShore facing not rechecked, closed waterfall on foot blocks a launch search riding it down) are follow-ups.

Round 2, head 2db97fc4d, diff sha 7c1bdbeb: Claude LGTM, GPT LGTM. Gates green at that head: lint, test (agent 2414, viewer 802, env 2764, gateway 38), verify-vendor. Fallback reviewer BLOCKING, accepted: water_edges listed land tiles with water beyond (Pacifidlog (0,13)) and water with elevation-5 land beyond (Route 128 (119,10)), so a surfer could be put ashore and the exit fail. Fixed with surfer_crosses. Follow-ups from review: elevation-0 water falls back to a two-tile press and stops safely (13 tiles on Routes 127, 128, 131 and Mirage Island); shore check runs before deterministicWarpPlan; A-activated moving targets keep the old refusal.

Main moved to 76ed3f753 (auto-bike, 9 commits) touching strides.py, navigation.ts, stride.ts, features, presets and the schema: overlap, so this is an integration delta, not evidence reuse. Merged; surf-navigation-v1 stays after the bike switches in every ordered list; bike-register.test pinned the list's tail and now pins the bike switches' order wherever they sit. Bike code already returns null on water (bikeTurn).
