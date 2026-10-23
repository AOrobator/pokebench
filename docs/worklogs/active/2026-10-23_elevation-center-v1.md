# Elevation-aware map and screen-center player

## Problem Statement
GLM run 2026-10-22T20-40-54_glm53-mac_0d5d, Route 110, turns 1094-1106 (12:48-13:16 PM New York, seq 126445-130400), read only:
- The player stands at elevation 3 on bridge tiles (elevation 15, behavior 0x70) under the Seaside Cycling Road. The road at x=16-18, rows <=68, is elevation 4 (behaviors 0x70/0x7F). The local map draws it `.`, Next tiles says "up (17,68) clear (.)", and UP x3 returns "The readout shows nothing blocking the tile above, (17,68); what stopped you is not known." (seq 127086). pokeemerald `IsElevationMismatchAt` refuses that step. Raw archive 21953 confirms the elevations.
- The bridge metatiles (layer type NORMAL, full top layer) are drawn over the player's sprite (priority 2 at elevation 3, `sElevationToPriority`). The player is invisible in the frame (129030), and GLM took another sprite for itself (turn 1100 seq 127902, turn 1104 seq 129004).
- Same family: Granite Cave B1F muddy slope (0xD0) at (9,10): "nothing blocking" (seq 96996). field-move-gates-v1 (landed 54f195749, ON in both arms of future definitions) now draws slopes `s` and fixes exit_reach, but `blocked-batch.ts` still has no slope reason in any arm.

## Authorization
The operator via coordinator 2026-10-23 1:25 PM: fix both issues, each behind its own switch, ON in the bundle arm only (OFF = today, control unchanged), land on local main once the review gate approves. Do not touch the live GLM run. Grok lane is down: Claude + GPT + fallback cloud reviewer.

## Skills Loaded
feature-switch, feature-explainer, feature-worklog, execute-worklog, pokebench-game-state, tool-prompt-sync, close-the-loop, talk-to-codex (landing board).

## Architecture
- `elevation-aware-map-v1` (server + agent). Server: after field-move-gates' terrain view, tiles the player cannot step onto from the current elevation (collision 0, tile elevation not 0/15, player elevation not 0, different) draw `L` instead of `.`/`g`, while not surfing; a note line under the map names the player's elevation and the rule; Next tiles names an `L` tile "another level (L), elevation 4 (yours is 3), cannot be entered from here". Agent: press results for a refused direction (repeated batch, and a single press already facing that way) name an elevation mismatch, and a muddy slope pressed UP, instead of "nothing blocking".
- `screen-center-player-v1` (server + prompt). System prompt sentence: in the overworld your character is the sprite on the tile at the exact center of the screenshot (8th of 15 columns; the sprite's head reaches the tile above), except during scripted camera moves and warp fades. Server reads the metatile top layer at the player's tile and the tile above; when one is drawn over the sprite (layer NORMAL/SPLIT with a non-empty top layer, sprite priority 2 from previousElevation), the readout says so.

## Invariants
- INV-1: both switches OFF give byte-identical readout, state JSON, press results and system prompt (regression tests on recorded states).
- INV-2: `L` is drawn only where pokeemerald's IsElevationMismatchAt refuses entry for the current player elevation; never while surfing or with unknown avatar flags.
- INV-3: the cover note appears only when the RAM-read layer data say the top layer covers the sprite; never inferred from the screenshot.
- INV-4: the live GLM run, its files and shared services are untouched.

## Security Review
Read-only RAM and archive reads; no new network exposure, subprocesses or ROM copies.

## Milestones
**M1 — elevation-aware-map-v1**
- [x] RED tests (Route 110 archive state, slope, OFF invariance, factory wiring): TS 8 fail / 1 pass, Python collection error (module missing)
- COMMIT: `test(elevation-aware-map): ... (RED)` (cfe170b94)
- COMMIT: `feat(elevation-aware-map): draw other levels as L and name elevation and slope refusals` (87287d4e1)
- [x] GREEN implementation, registry, presets, bundle-arm definitions (both switches registered and added to the bundle arm of the 7 current definitions; screen-center has no behavior until M2). Agent 4062 pass, viewer 1752 pass, Python 4055 pass (worktree venv needed the main venv's mgba package copied in for test_view and mypy). Wiring deletions: removing `elevation` from toolSwitches fails 4/9 TS tests; forcing the readout gate off fails 1/5 Python tests; both restored green. Registry-position tests shifted by two.
- Not covered (sent to coordinator for Codex): navigate_to occupancy across layers (AreElevationsCompatible); state objects carry no elevation.
**M1b — cross-level occupancy (elevation-aware-map-v1)**
- COMMIT: `feat(screen-center-player): ...` (0c7235456)
- [x] RED: state 127085, goal (16,71) under the layer-4 cyclist: ON plans DOWN DOWN LEFT, OFF keeps the refusal (TS 2 fail, Python 2 fail)
- COMMIT: `test(elevation-aware-map): an object on another level blocks navigate_to (RED)` (bf148b34e)
- [x] GREEN: server object elevations (navigation_grid and map_grid, only when the switch reads them); planner uses AreElevationsCompatible at the walker's elevation before each step; unknown elevations still block. Agent 4067 (+1 known-flaky serial-comparison timing test that passes alone), viewer 1752, Python 4063 pass. schemas/events.v1.json regenerated. Deleting `actorElevation` from withNavigation fails the factory test; restored.
**M3 explainers**: docs/explainers/elevation-aware-map-v1.html and screen-center-player-v1.html (themed, pages-check clean), mapped in FEATURE_EXPLAINERS with a card-link test.
**M2 — screen-center-player-v1**
- [x] RED tests (prompt sentence, cover note from archive 21953 layer facts, OFF invariance): TS 2 fail / 1 pass (registry already in), Python collection error
- COMMIT: `test(screen-center-player): the player's screen position and hidden sprite (RED)` (3dfe06c38)
- [x] GREEN implementation: prompt section (overworld scenes only) + server cover line. Agent 4065, viewer 1752, Python 4061 pass. Wiring deletions: prompt line removed fails 2/3 TS; rerender flag forced off fails the pass-through test; restored green. Historical rerender tests list both new switches as off (recorded before them).
- Live-RAM proof: archive 21953 (seq 129029) re-rendered through `python -m pokebench_env.rerender` with the run's own switches: OFF unchanged; ON draws L over the road (x=16-18, rows 62-68, and the bridge-level tiles south of row 71), Next tiles names up (16,68) as another level, and the cover line names (16,69) and (16,68) at elevation 3.
- Scope added 2:00 PM (the operator via Codex/coordinator): navigate_to occupancy across layers goes in elevation-aware-map-v1 (M1b below).
**M3 — explainers, gates, review, landing**
- [ ] Explainers with diagrams, FEATURE_EXPLAINERS links
- [ ] `just test`, `just lint`, `just build`, `just coverage` (>=90)
- [ ] Multi-model review: Claude + GPT + fallback cloud lane, LGTM on the frozen packet
- [ ] Land via landing board, `just viewer-main`, live check

## Closing the Loop
Re-render archive 21953 (Route 110) and the Granite Cave slope archive through the production reader under both switch states; tests for agent press results; explainer pages checked with `just pages-check` and a background headless browser.

## Session Log
- Discovery: confirmed elevations and top-layer coverage from raw archives 21927/21953 with a scratch probe.

## Surprises
- Terrain-gates (Codex, 54f195749) already draws slopes; only the press-result slope reason was missing.

## Multi-Model Review Log
- Pre-review findings from Codex CYCLE (2:11 PM, relayed): (1) stacked objects collapsed to one elevation per tile in `_grid_objects`; (2) objects mid-step also occupy previousCoords (DoesObjectCollideWithObjectAt). Fixed: one grid entry per object tile (current and previous) with its own elevation; regressions for a 3/4 stack in both orders (Python serialization, TS planner) and previous coords. Objects array bound raised 16 -> 32 (each of 16 objects can hold two tiles); schema regenerated.

## Boy Scout Log

## Archive Milestone
- [ ] ASK USER: archive worklog.
