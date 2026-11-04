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
- [ ] M2 Agent: A* surf mode, walker, shore stop, semantic navigation, exit lines, prompt
- [ ] M3 Agent: currents and waterfalls as forced movement
- [ ] M4 Config, explainer, emulator rehearsal
- [ ] M5 Gates, review, landing

Activation: on in both arms with this landing, by operator instruction. No comparison is registered. Run 274b is pinned and unaffected.

## Multi-Model Review Log

M1 RED: env/tests/env/test_surf_navigation.py fails at collection.

M2/M3 RED: packages/agent/src/surf-navigation.test.ts.
