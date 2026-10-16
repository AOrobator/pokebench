# surf-gated-exits: exits across water are not listed as exits until Surf can be used

Branch `claude/surf-gated-exits` in worktree `agent-a04189da47fcbdfa8`, cut from local main `84802ce9`. Local only: no push, no PR, no remote. The coordinator lands the reviewed head with `--ff-only`.

## Problem Statement

Operator rule (the operator, verbatim): "For the exit lists, if an exit requires surf, but the user doesn't have the HM or the gym badge that enables surf, we shouldn't mark it as an exit."

A top-runs analysis found this lure cost about 50 minutes across 5 runs. In run `2026-10-16T12-42-29_qwen36-gpu0_4caa`, 145 readouts on ROUTE103 said `Exits here you have not taken: (45,6) -> ALTERING CAVE (map 24/106); EAST edge -> ROUTE110 (map 0/25)`. Both are across Route 103's water from every tile the player could walk to (raw RAM, state seq 4767, archive `raw-ram/00002577.json.gz`: on foot the player reaches 238 tiles, none next to (45,6) or on the east edge; with water passable, 640 tiles, which include both). The player had no badges and only TORCHIC (SCRATCH, GROWL, FOCUS ENERGY).

Affected lists on main: the untaken-exits-v1 readout line; the briefing exit lists (`Exits to maps you have not entered …`, `Listed here that you have not tried yet`, `Not tried yet on other maps …`) in loop-supervisor.ts / stall briefing; the connection-edge-tiles-v1 supervisor bearings line (`Ways off this map across its edge`); and in the server readout the world-destinations Map connections lines (with connection-edge-tiles, `stand on one of these edge tiles and press RIGHT`), the Map interaction candidates warp lines and the `Warp destination at` lines.

## Skills Loaded

feature-worklog, execute-worklog (Landing on main), feature-switch, feature-explainer, pokebench-game-state, agent-observability, close-the-loop, multi-model-review.

## Decision: bug fix behind a switch

Listing an exit the player cannot use is a false message, so this is a bug fix. It still ships behind a registered switch, `surf-gated-exits-v1`, whose OFF state is today's text byte for byte, and it is meant to be ON in both arms of bundle-v-control (`onInBoth`), like transition-loop-detection-v1 and readout-truth-v1. This branch does not edit `experiments/fixed/bundle-v-control.json`; the bundle owner wires `onInBoth`. Default OFF in presets so recorded presets and the OFF arm keep today's bytes.

Where the exit goes:
- Exit lists (untaken exits, briefing unentered / untried / untried elsewhere, supervisor edge bearings): the Surf-gated exit is dropped, as the operator said. When dropping it would make a "none" line false (every exit taken), the line says "every exit you can walk to".
- Server readout map facts (Map connections, Map interaction candidates, Warp destination lines): a factual note instead of dropping. These lines describe the game's map (the local map's `?` pointer refers to Map connections); deleting the connection would make the readout say the map has no east edge, a false message of its own. The walk instruction ("stand on one of these edge tiles and press RIGHT") is replaced by the note, because that instruction is the lure.

## Architecture

Server side (`env/pokebench_env/surf_gate.py`, new server switch `surf-gated-exits-v1`):
- `can_surf`: pokeemerald 731ad5bf `GetInteractedWaterScript` (field_control_avatar.c:448-452) starts Surf only when `FlagGet(FLAG_BADGE05_GET)` (SYSTEM_FLAGS + 0xB, the Balance Badge) and `PartyHasMonWithSurf()` (field_player_avatar.c:1297: a party Pokémon that knows MOVE_SURF, 57; checked only while not already surfing). `PLAYER_AVATAR_FLAG_SURFING` (1 << 3, gPlayerAvatar.flags) means the player is surfing now. can_surf = surfing or (badge and party Surf); unknown when a party Pokémon's moves did not decode.
- Water-only exits: from the player's tile, flood the current map on foot (collision 0, not TILE_FLAG_SURFABLE water, ledges hop in their arrow direction) and again with water passable. A warp is water-only when neither it nor a neighbour is reachable on foot but one is with water. A walking connection is water-only when none of its foot edge tiles is reachable on foot, but an edge tile crossable with water allowed is reachable with water. Elevation, edge walls and objects are ignored on purpose: each can only add on-foot connectivity, so an error keeps an exit listed (today's behavior) rather than dropping a reachable one.
- `surf_gate` state JSON field (present only with the switch): `{can_surf, balance_badge, party_surf, surfing, warps:[{x,y}], connections:[direction]}`.
- Readout: notes on the three map-fact lines when `can_surf` is false.

Agent side: `surf-gate.ts` reads `surf_gate` from a state when the switch is on; untaken-exits, loop-supervisor (unentered, open, edges) filter it out.

## Invariants

- INV-1 Switch OFF: readout, state JSON and every list unchanged byte for byte. Test: real-ROM fixture OFF equals the recorded 4caa readout; TS lists OFF equal today's.
- INV-2 An exit is dropped only when `can_surf` is false and the gate computed it water-only from this state's own position. Unknown party moves keep it listed.
- INV-3 Once Surf is available (badge + SURF, or already surfing) the exit is listed again. Test: synthetic fixture.
- INV-4 No exit reachable on foot is dropped. Test: real-RAM re-read across recent runs; every exit a run later took on foot was not gated.
- INV-5 Nothing sent to the model is clipped.

## Security Review

Read-only RAM decoding and text. No subprocesses, no network, no new endpoints. Run dirs are read-only inputs for fixtures (RAM windows only, never ROM bytes).

## Milestones

**M1 — RED**
- [x] Python (`env/tests/env/test_surf_gate.py`): real-ROM fixture `surf-gate-4caa.json.gz` (RAM windows of tool results 4770 and 16069, never ROM or Flash bytes): OFF reproduces the recorded readout; ON notes exactly three lines; gate JSON; surfing brings them back; surf_use truth table; reachable/water_only synthetic; note wording
- [x] TS (`packages/agent/src/surf-gated-exits.test.ts`): fixture `surf-gate-4caa.jsonl.gz` (4caa seq 0-6219, trimmed; surf_gate added per overworld state from its own raw RAM by the server code): untaken-exits OFF byte-equal / ON; supervisor briefings 5271 and 6219 OFF byte-equal / ON; Surf-available relists; untried and edge bearings; factory wiring; schema; registry and presets
- [x] COMMIT RED

**M2 — GREEN**
- [ ] surf_gate.py, readout notes, state JSON, rerender/observation threading
- [ ] TS schema (`just schema`), surf-gate.ts, consumers, features registry, presets, next-run default, panels explainer map
- [ ] Gates: `just test`, `just coverage` ≥90, `just lint`, `just build`
- [ ] COMMIT GREEN
- [ ] Guard deletion receipts

**M3 — proof, explainer, pending experiment**
- [ ] Measure on 4caa: readouts and briefings that change
- [ ] False-drop check across other recent runs
- [ ] Explainer `docs/explainers/surf-gated-exits-v1.html`, README, `just pages-check`
- [ ] `experiments/surf-gated-exits.json` (pending), readiness row
- [ ] COMMIT

**M4 — review**
- [ ] Merge main, gates
- [ ] Principles self-review PB1–PB13, zero FAIL
- [ ] Claude, Grok, GPT lanes `VERDICT: LGTM` on one frozen packet
- [ ] Report the reviewed head to the coordinator (it lands with --ff-only)

## Session Log

- 2026-10-16 (New York): worklog created after read-only discovery of the 4caa events, its raw RAM at seq 4767, and pokeemerald 731ad5bf.
- 2026-10-16 2:48 PM New York: RED. Python: 29 tests fail at import (no `pokebench_env.surf_gate`); TS: suite fails at import (no `./surf-gate.js`). The TS fixture's surf_gate values were produced by the uncommitted GREEN server code from each state's raw RAM (1441 overworld states; ROUTE103 350 states all `warps [(45,6)]`, `connections [EAST]`, `can_surf false`; every other map empty).
