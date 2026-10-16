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
- [ ] RED: TS tests from recorded events (4caa T272/T273, sh02 T74, Birch "come by my POKéMON LAB later"), OFF identity, factory, registry; Python places reader tests
- [ ] GREEN: places.py + endpoint, story-destinations.ts, registry, presets, DEFAULT_NEXT_RUN, wiring
- [ ] Gates: `just test`, `just lint`, `just build`, `just coverage` (≥90)

### M2
- [ ] Explainer `docs/explainers/story-destinations-v1.html`, README, `FEATURE_EXPLAINERS`
- [ ] Pending `experiments/story-destinations.json`, readiness line
- [ ] Precision measurement on recent runs
- [ ] Principles self-review; cloud review (Claude, Grok, Codex) until LGTM; sync with main before the final round

## Closing the Loop

## Session Log
- 2026-10-16 (New York): worklog drafted from the operator's go-ahead.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER
