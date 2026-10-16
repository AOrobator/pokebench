# story-destinations-v1: resolve the latest story line's destination into a target

## Problem Statement

Approved by the operator 2026-10-16 (relayed by the coordinator): "I like the idea of resolving story destinations into targets. Let's put that into the bundle." Evidence: run-analysis report `runs/reports/run-analysis/2026-10-16_overnight/index.html` ("Resolve story destinations into targets", the most common mistake, 7 runs) and run `2026-10-16T12-42-29_qwen36-gpu0_4caa`: at T272 MAY says "Well, it's time to head back to the LAB."; at T273 the model reasons "head back to the LAB (Rustboro City)" and walks south; back in town it took its own house door for the lab (T469–T504). In `2026-10-16T02-23-17_qwen36-gpu1_sh02` T74 MOM says "PROF. BIRCH is his name. He lives right next door"; at T75 the model heads for "Professor Birch's Lab". PROF. BIRCH on Route 101 says "come by my POKéMON LAB later, okay?" in every run.

Branch `claude/story-destination-targets`, isolated worktree. Default-off switch for the bundle arm; the bundle definition (`experiments/fixed/bundle-v-control.json`) is owned elsewhere and is not edited here. Landing: report a reviewed head SHA; the coordinator lands it `--ff-only`.

## Skills Loaded

feature-switch, feature-explainer, agent-observability, pokebench-game-state (pokeemerald 731ad5bf), experiment-queue, close-the-loop, execute-worklog, multi-model-review (cloud lanes only: Claude, Grok cursor-grok-4.5-high, Codex gpt-5.6-sol).

## Architecture

- **Server (Python, read-only, no switch):** `env/pokebench_env/places.py` reads the game's own map table from the ROM: for every map in gMapGroups (pokeemerald `data/maps/groups`, `MAP_GROUPS` 0x08486578 as `topology.py`), its MapHeader events (`warps`, 8-byte WarpEvent) and connections (12-byte MapConnection). Each map is named exactly as the readout names it: `displayed_names.place_name` when displayed-place-names-v1 is on, else the map table name. `GET /pokebench/places` returns that directory. It changes nothing the model sees.
- **Agent (TS, the switch):** `packages/agent/src/story-destinations.ts` follows recorded `dialogue_auto_advance` pages. A story line is a field page spoken by a story character (character-presence's table: a `NAME:` prefix or a faced sprite whose graphics is that character on that map). The latest story line that names a place or a story character is kept. Place phrases are runs of capitalised words whose last word is the last word of some map name in the directory ("LAB", "POKéMON LAB", "ROUTE 103", "PETALBURG GYM"); a phrase resolves when exactly one entrance-level map's name contains all its words. "He/She/NAME lives" resolves to `NAME'S HOUSE` when exactly one story character is named before it in that conversation. A resolved place is shown with its doors (warps into it from other maps, with coordinates) and the map edges that lead to it. Ambiguous or unmatched phrases are reported as not resolved, with the count. Every story character the line names (and its speaker) is listed with where the readout's character-presence line places them: on this map at x,y, out of view, or not on this map.
- **Delivery:** a block inserted right after the readout's `Story:` line (after Location/Position when there is no Story line) in observe, press and navigate_to results, in the overworld only. OFF: tools untouched, readout bytes identical.
- `needs: dialogue-auto-advance-v1` (story lines come from its page records).

## Invariants

- INV-1: OFF reproduces today's tools and readout bytes. Test: factory OFF identity.
- INV-2: resolution only from game data (ROM map table, warp/connection records, displayed names, character-presence line); no hand-written route or story table. Test: directory fixture generated from the ROM; Python reader tests on synthetic ROM + real ROM.
- INV-3: ambiguous or unmatched names are never guessed. Tests: "HOUSE", "POKéMON CENTER", "He lives" with two candidates.
- INV-4: model-facing text is never clipped; the story line is shown whole.

## Security Review

Read-only GET on the loopback game server; reads ROM and the save block under the memory lock; no writes, no subprocesses, no paths from input.

## Milestones

**M1 — RED, GREEN, gates.** **M2 — explainer, pending experiment, measurement, review until LGTM, sync with main.**

### M1
- [x] RED: TS tests from recorded events (4caa T272/T273, sh02 T74, Birch "come by my POKéMON LAB later"), OFF identity, factory, registry; Python places reader tests. Both suites fail at import (no `story-destinations.ts`, no `pokebench_env.places`).
  COMMIT: `test: RED story-destinations-v1 resolves the latest story line's place into a target from the game's map table` (8da6cd03)
- [x] GREEN: `env/pokebench_env/places.py` (ROM map table: gMapGroups → MapHeader events/connections, readout names) + `GET /pokebench/places` in `install_observation` (read-only, under the memory lock); `MapNames.ids()`; `packages/agent/src/story-destinations.ts`; `StateSource.places?` + `StateWatcher.places()`; registry (`SWITCHABLE_FEATURES` last, `FEATURES` observation entry with `needs: dialogue-auto-advance-v1`, `...when()` last); presets (optional, default false; `flagFeatures`); `DEFAULT_NEXT_RUN` false; `FEATURE_EXPLAINERS`; `playGameTools` wraps the game tools in `withStoryDestinations` inside navigate-first (its anchor is the Story line, which no other wrapper touches); `presence()` exported from people-ledger for reuse.
- [x] Test adjustments after RED (all in the same suite, none weakening a RED assertion on recorded data): rule fixture "Thanks, MAY!" → "Thanks, honey!" (a MOM line naming MAY rightly becomes the latest line); "WALLY lives" turned out to resolve (PETALBURG CITY WALLYS HOUSE, map 8/0, door (7,5)) so the no-house case uses ROXANNE and WALLY became a positive test; the T107 sprite test passes the map table's name endings and the player name (with neither, "RAED" alone would count as a place phrase); synthetic tool_result events need `frames`; reader tests for `StateWatcher.places()` and a malformed table.
- [x] Registry shifts (mechanical, as people-ledger did): end-relative `.at(-N)`/`.slice` on `SWITCHABLE_FEATURES`, `playHarnessFeatures(ALL_ON|ON)` and the switchable `FEATURES` +1 in adjacent-tiles, battle-message-waiting, battle-observation-loop, battle-text-auto-advance (incl. key-order slices and `flagFeatures` index), battle-triage, blocked-batch-result, connection-edge-tiles, dialogue-auto-advance, dialogue-context-kept, disproved-beliefs, explorer-guidance, features, levelup-box, people-ledger, pushback-loop-detection, pushback-press-result, readout-rules, readout-truth, same-plan, script-line-presence, transition-coherence, transition-loop-detection; `"story-destinations-v1"` added to the default-off `off(...)` lists in features.test and to the explicit-false fixtures in experiment-gate, play-preset, state-runtime, untaken-exits and viewer next-run; observation count 36; viewer controls rows 89.
- [x] Wiring-removal check: `playGameTools` passing `{...features,"story-destinations-v1":false}` to `withStoryDestinations` → "the production factory honors the switch" FAILED (`expected '|pressed A, A\nPress result: A: inter…' to contain 'Latest story line naming a place or p…'`), 1 failed / 17 passed; restored → 18 passed.
- [x] Gates (ROM via `--dotenv-path ~/dev/pokebench/.env`; worktree venv got the built mgba package copied from the main venv): `just coverage` agent 1900 tests, 98.00 st / 94.47 br / 98.46 fn / 99.15 ln (story-destinations.ts full); viewer 972 (974 with the explainer route/card tests), 95.41 / 91.17 / 93.79 / 97.67; pytest 2485 passed, 0 skipped, lines 97.54 / branches 93.59 / functions 100 (places.py 100 after the unnamed-map test); `just lint` tsc + eslint clean, ruff clean, mypy clean (86 files); `just build` ok; `just verify-vendor` OK (submodule initialised at the pin bbab97ad).

### M2
- [x] Explainer `docs/explainers/story-destinations-v1.html` (`just pages-check` silent), README, `FEATURE_EXPLAINERS`; panels card test and server allowlist test
- [x] Pending `experiments/story-destinations.json` (finals incumbent + `dialogue-auto-advance-v1` ON, activation `FIRST_TRUCK_EXIT`, primary `RIVAL_HOUSE_ENTERED`, provisional `source.commit` = RED 8da6cd03); parses with `parseExperiment`, `experimentArms` candidate differs only in `story-destinations-v1`; readiness row in `docs/experiments/readiness.md`
- [x] Precision measurement (`packages/agent/test-support/measure-story-destinations.ts`, replay against the ROM map table dumped for a male player, house name rewritten per run): 13 runs of 2026-10-16; 6 control-arm runs have no dialogue pages (dialogue auto-advance off), so the block never shows there. 7 bundle runs (sh02, 230d, 7ccf, a3c9, 4caa, 8b01, d32e): block on 3,052 of 3,142 overworld results (97%), first at T48–T72; 56 distinct story lines; 26 place resolutions (LITTLEROOT TOWN 7, "He lives" → PROF. BIRCH'S HOUSE 1F 7, "POKéMON LAB" 7, "LAB" 4, "ROUTE 103" 1), 0 wrong (each checked against pokeemerald map data), 0 ambiguous or unmatched; people lines 5,164 (not on this map 4,190; at x,y 338; out of view at x,y 234; template tile 250; out of view, tile not read 152).
- [ ] Principles self-review; cloud review (Claude, Grok, Codex) until LGTM; sync with main before the final round

## Closing the Loop
- Tests: recorded-event replays (4caa T138/T272/T273/T107, sh02 T74/T75), rules, OFF identity, factory, wiring-removal (red then green), registry, reader; Python reader on synthetic ROM and the operator's ROM (every warp of all 518 maps checked against the map data).
- Live, real game server (worktree build, real ROM, copied save state `battle-text-qualify/states/town-before-rival-door.state`, scratch port 18931 and scratch run dir, stopped and deleted afterwards), 2026-10-16 ~3:20 PM EDT: `StateWatcher.places()` read 518 maps; `withStoryDestinations` on a real /pokebench/observation with a MAY LAB line printed, with the server's default switches, `- "LAB" = LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4). Way in: door on this map at (7,16).` and `MAY (spoke the line): the readout does not say where.` (displayed names and character presence off, so the names and presence follow the readout); with the server switches on, `- "LAB" = PROF. BIRCH'S POKéMON LAB (map 1/4). Way in: door on this map at (7,16).` and `MAY (spoke the line): not on this map.` Script: `packages/agent/test-support/live-story-destinations.ts`.
- Explainer: `just pages-check` silent; opened at 1280, 1440 and 375 in the browser pane; figures scroll on the phone instead of shrinking.
- Not proven: a model run with the switch on (needs operator approval); the viewer surfaces (the block is tool-result text, shown where every tool result is shown; no new event type, nothing on the TIMELINE); `just viewer-main` not run (coordinator's instruction).

## Session Log
- 2026-10-16 ~2:50 PM EDT: worklog drafted from the operator's go-ahead (relayed by the coordinator).
- 2026-10-16 ~3:00 PM EDT: RED committed (8da6cd03).
- 2026-10-16 ~3:15 PM EDT: GREEN, explainer, pending experiment, measurement, gates.
  COMMIT: `feat: story-destinations-v1 resolves the latest story line's place from the game's map table into a door or edge, and places the people it names` (e1640dd0)
- 2026-10-16 ~3:25 PM EDT: live game-server check; explainer figures scroll on phones.

## Surprises
- The vendor's porymap copy of the map data disagrees with the ROM (and pret 731ad5b) on LavaridgeTown_Gym_1F/B1F warps; the ROM is the source, the test records the two exceptions.
- "WALLY lives" resolves: PETALBURG CITY WALLYS HOUSE is a map of its own.
- 6 of the 13 recent runs are control-arm runs without dialogue auto-advance, so they have no page records and the switch (which needs it) shows nothing there.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER
