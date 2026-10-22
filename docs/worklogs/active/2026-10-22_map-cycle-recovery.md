# Map-cycle recovery instead of a stop (map-cycle-recovery-v1)

Operator request: The operator, 2026-10-22 4:11 PM New York: "yes recovery over stopping the run". Single milestone; no review or landing in this thread (the coordinator runs review and landing).

## Problem Statement

Gym-loop run `2026-10-22T15-43-35_qwen36-gpu1_7c9f` (qwen36, gym-rustboro-torchic bundle arm) lost to ROXANNE at turn 22, whited out to PETALBURG CITY and then walked between PETALBURG CITY and its houses, Pokémon Center, mart and gym. stall-briefing-v1 saw two round trips PETALBURG CITY <-> PETALBURG CITY POKEMON CENTER 1F, so navigation-recovery-v1 opened a map-cycle episode (loop_guard warning #2840, turn 56, 3:56:16 PM New York). Every walkable exit of PETALBURG CITY led to a map already visited since the last story progress, so verified recovery needed two map changes; the model spent its 12 budgeted calls on PETALBURG CITY and the episode stopped the run (loop_guard stop #3415, turn 68, 3:59:18 PM; run_end reason stuck).

## Skills Loaded

feature-switch, agent-observability, feature-explainer, feature-worklog, experiment-queue, pokebench-game-state (game wording), close-the-loop.

## Architecture

- `loop/navigation-recovery.ts`: with `mapCycleRecovery` on, a map-cycle episode that reaches `NAVIGATION_RECOVERY_CALLS` without verified recovery, for the first time since the last native story progress, closes with a recovery briefing instead of a stop: loop_guard kind map_cycle, phase supervisor, message = the exact briefing. The briefing is shown at the next model call until a call completes. It states the current map and position, every map visited since the last story progress with its visit count, and the walkable exits of this map not taken since the last story progress (map ids; names only for maps already visited). No destination, walkthrough or unseen place name.
- The cycle window resets: the coordinator's `mapCycleWindow()` generation advances, and stall-briefing-v1 (with the switch on) clears its map-pair counts, so a second cycle needs two fresh round trips. A second cycle opens the ordinary navigation-recovery-v1 episode, whose budget ends in today's stop. Native story progress re-arms the briefing.
- Switch `map-cycle-recovery-v1`, needs `navigation-recovery-v1`, default OFF. OFF: the episode stops at its budget exactly as before.

## Invariants

- INV-1 OFF parity: the recorded 7c9f window stops at the same call with the same stop notice.
- INV-2 One briefing per story-progress window; a second cycle stops as today.
- INV-3 Briefing text uses map names only for maps the run has been on; no destination is chosen; no input is sent.
- INV-4 Recorded event message is byte-identical to what the model receives; Activity History shows it; no timeline additions.

## Milestones

**M1 — Map-cycle recovery switch**
- [x] Tests (7c9f recorded window ON/OFF, direct unit tests, second-cycle stop, story-progress re-arm, stall-briefing window reset, pinned-pi delivery, registry/preset/experiment/bundle): `packages/agent/src/map-cycle-recovery.test.ts` (fixture `test-support/map-cycle-recovery-7c9f.json.gz`) and one pinned-pi test in `harness.test.ts`. RED run: 14 failing / 3 passing (the passing ones are OFF parity on the recorded window, the wording guard and the stall refusal, which hold before and after).
- [x] COMMIT RED
- [x] Implement + registry/presets/defaults/wiring (features.ts, play-preset.ts, next-run.ts, legacy-features.ts, loop/types.ts, loop/coordinator.ts, loop-detection.ts, harness.ts attachLoopGuard, stall-briefing.ts, play-wiring.ts type). Registry-tail updates: 74 test files' SWITCHABLE_FEATURES / switchable FEATURES / normalizeFeatures / presetFeatures negative indexes shifted by one; 16 incumbent filter lists exclude the new id; guard count 61 -> 62; heal-first, story-battle-heal-gate, birch-intro-pages, open-goal-prompt (viewer) and rejected-movement-prefix-bundle (viewer) arm exclusions; withoutFrontierTreatments turns it off.
- [x] Wiring deletion goes red, restored: removing the attachLoopGuard argument gave 4 failed / 81 passed (7c9f ON, second-cycle, stall rig, pinned pi); restored 85 passed. Removing the stall-briefing pair reset gave 1 failed / 17 passed; restored 18 passed.
- [x] Explainer docs/explainers/map-cycle-recovery-v1.html (themed, pages-check clean) + README + FEATURE_EXPLAINERS + panels/server tests; pending experiment experiments/map-cycle-recovery-v1.json + readiness row; six recipes (bundle-v-control, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h, bundle-v-control-2h, gym-rustboro-torchic) base false + appended to bundle switches; glm53-flash-4h skipped (its bundle lacks navigation-recovery-v1); viewer map-cycle-recovery-bundle.test.ts.
- [x] Gates: just lint 0; just build 0; just coverage 0 — agent 4761 tests (97.3 stmts / 93.3 branches / 97.8 funcs / 99.2 lines), viewer 1798 (95.47 / 91.45 / 94.45 / 97.97), Python 4008 passed (lines 97.41 / branches 93.48 / functions 100).
- [x] COMMIT GREEN: `feat(agent): map-cycle-recovery-v1 briefs once and resets the cycle count instead of stopping the run` (a2ce05f90)
- [x] Pin the pending experiment's source.commit to the GREEN commit

## Session Log

- 2026-10-22 ~4:25 PM New York: 7c9f read (read-only). Briefing replay matches the expected text exactly; OFF replay reproduces the recorded stop notice (message, evidence [2838,3414], calls 67).

## Surprises

- 7c9f's episode could not have recovered by its own rule within 12 calls: every walkable exit of PETALBURG CITY led to a map already visited since the last story progress (ROXANNE_FIRST_INTERACTION is measurement-only, so the window starts at TOMMY defeated, turn 19).
- The 7c9f states carry no location_display, so map names come from the readout's own exit_sections.current label recorded while on each map.

- 2026-10-22 evening: merged main (frontier report fixes, turn-drought-clock-v1, healed gym definition); registry-tail tests re-shifted; switch also on in the bundle arm of gym-rustboro-torchic-healed. Gates: lint 0; agent 4843 (97.32/93.41/97.81/99.21), viewer 1804 (95.47/91.45/94.45/97.97), Python 4011 (96%). Not landed: the branch is in review (multi-model review round 1 on main 4f374fc99..2c3aabcf3).

### Review round 1 fixes (packet 4f374fc99..2c3aabcf3: Claude LGTM, fallback LGTM, GPT BLOCKING)
- [x] Exit identity: departures are recorded per exit (the warp tile, or the connection direction from an edge tile or the single border with a connection) from the last position recorded on the map left; two doors to one map are two exits; a used door whose destination was not read is no longer listed; unmatched departures are counted and stated. Tests: two doors to one map with one used, a used door absent from interaction_targets, border fallback, unmatched caveat. 7c9f still matches all 8 exits of PETALBURG CITY by identity.
- [x] OFF keeps no switch history: visits, exits, unmatched departures and labels are collected only with the switch on. Bound: one entry per map or per exit, so at most the game's map table (518 maps in 34 groups, MAP_GROUP_SIZES in env/pokebench_env/menu_prelude.py; at most 64 warps per map, MAX_WARPS in env/pokebench_env/places.py, plus four directions). No model-facing text is clipped. Test feeds 150 distinct maps twice: OFF keeps nothing, ON keeps 150 visits and 150 labels.
- [x] Test cost: harness.test.ts shares one lazily parsed and validated navigation-recovery fixture state across the three pinned-pi cases; map-cycle-recovery-bundle.test.ts parses each recipe and reads each control base once.
- [x] Gates: just lint 0; just build 0; just coverage 0 — agent 4845 (97.32/93.4/97.81/99.21), viewer 1804 (95.48/91.46/94.45/97.97), Python 4013 passed (lines 97.41 / branches 93.48 / functions 100).
- [x] COMMIT: `fix(agent): map-cycle recovery tracks the exact exit used and keeps no history when off` (3b48eb4eb); experiment source.commit repinned to it in its own commit.

## Landing

- Review round 1 (head 2c3aabcf3): Claude LGTM, fallback LGTM, GPT BLOCKING (exit identity, OFF history, test cost, pin) — fixed in 3b48eb4eb, 2784e365e.
- Review round 2 (packet 4f374fc99..2784e365e, sha256 e1943e8e…): Claude CLI LGTM, GPT (Codex CLI gpt-5.6-sol) LGTM, fallback subagent LGTM.
- Landed 5:37 PM New York via the board: `git merge --ff-only` → main 2784e365e; `pnpm -r build` then `just test` 0 (agent 4845, viewer 1804, Python 4013); `just viewer-main` → 8790 at 2784e365e, PPID 1 (launchd), 1 live gameplay process kept; explainer 200 on 8790 /explainers/, 8791 and Tailscale Reports.
