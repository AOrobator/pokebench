# surf-gated-exits: exits across water are not listed as exits until Surf can be used

Branch `claude/surf-gated-exits` in worktree `agent-a04189da47fcbdfa8`, cut from local main `84802ce9`. Local only: no push, no PR, no remote. The coordinator lands the reviewed head with `--ff-only`.

## Problem Statement

Operator rule (the operator, verbatim): "For the exit lists, if an exit requires surf, but the user doesn't have the HM or the gym badge that enables surf, we shouldn't mark it as an exit."

A top-runs analysis found this lure cost about 50 minutes across 5 runs. In run `2026-10-16T12-42-29_qwen36-gpu0_4caa`, 145 readouts on ROUTE103 said `Exits here you have not taken: (45,6) -> ALTERING CAVE (map 24/106); EAST edge -> ROUTE110 (map 0/25)`. Both are across Route 103's water from every tile the player could walk to (raw RAM, state seq 4767, archive `raw-ram/00002577.json.gz`: on foot the player reaches 238 tiles, none next to (45,6) or on the east edge; with water passable, 640 tiles, which include both). The player had no badges and only TORCHIC (SCRATCH, GROWL, FOCUS ENERGY).

Affected lists on main: the untaken-exits-v1 readout line; the briefing exit lists (`Exits to maps you have not entered …`, `Listed here that you have not tried yet`, `Not tried yet on other maps …`) in loop-supervisor.ts / stall briefing; the connection-edge-tiles-v1 supervisor bearings line (`Ways off this map across its edge`); and in the server readout the world-destinations Map connections lines (with connection-edge-tiles, `stand on one of these edge tiles and press RIGHT`), the Map interaction candidates warp lines and the `Warp destination at` lines.

## Skills Loaded

feature-worklog, execute-worklog (Landing on main), feature-switch, feature-explainer, pokebench-game-state, agent-observability, close-the-loop, multi-model-review.

## Decision: bundle-arm switch (operator change, 2:53 PM New York)

First plan: a bug fix ON in both arms (`onInBoth`), like transition-loop-detection-v1. Changed by the operator at 2:53 PM New York ("we need to make sure that the bundle includes the surf exit fix", relayed by the coordinator): the fix goes in the **bundle arm only**, behind its own default-off switch `surf-gated-exits-v1`, and is registered as a **pending** experiment (not queued). OFF is today's text byte for byte. This branch does not edit `experiments/fixed/bundle-v-control.json`; the bundle owner adds the switch to its `switches` list.

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
- [x] surf_gate.py, readout notes, state JSON, rerender/observation threading
- [x] TS schema (`just schema`), surf-gate.ts, consumers, features registry, presets, next-run default (panels explainer map lands with the explainer in M3)
- [x] Gates: `just test` (TS agent 1894, viewer 972, Python 2496 passed, ROM set), `just coverage` (Python lines 97.52 / branches 93.49 / functions 100; agent 98.05 / 94.8 / 98.41; viewer 95.41 / 91.17 / 93.79; surf_gate.py 100%), `just lint` clean (after `just build-mgba` in this worktree; before it mypy failed only on the missing mgba binding), `just build`
- [x] COMMIT GREEN
- [x] Guard deletion receipts

**M3 — proof, explainer, pending experiment**
- [x] Measure on 4caa: 145 of 597 tool results change (all on ROUTE103 tiles where the gate holds; each had the untaken-exits line naming both exits; the readout's three map-fact lines change on the same 145); 12 of 19 supervisor briefings name the two exits (replayed exactly for 5271 and 6219 in the TS test)
- [x] False-drop check: 108 runs `runs/2026-10-1*` with raw RAM, 132,319 overworld states, 11,767 distinct (map, tile) re-read with surf_gate.py: the only gated exits anywhere are ROUTE103 (45,6) and EAST; no run ever moved from a map straight into an exit the gate marked there: 0 false drops. Runs changed: 8b01 149, 230d 145, 4caa 145, 7ccf 47 (untaken-exits on); sh02 172, 54a7 123, e588 97, 7a95 47 readouts (untaken-exits off: only the readout notes). Other field moves: the most-repeated untaken exits across these runs are Oldale doors, Route 102/103 edges and Littleroot doors; none is behind Cut, Rock Smash or Strength, so only Surf is gated
- [x] Explainer `docs/explainers/surf-gated-exits-v1.html` (grid from 4caa raw RAM), README, FEATURE_EXPLAINERS + panels test, `just pages-check` prints nothing
- [x] `experiments/surf-gated-exits.json` (pending, no queuePosition; bundle arm only), readiness row; `just experiments-check` ok (79)
- [x] COMMIT

**M4 — review**
- [x] Merge main (4c805958), gates: `just test` (agent 1894, viewer 995, Python 2496 passed), `just lint` clean, Python coverage gate lines 97.47 / branches 93.46 / functions 99.39, agent coverage 98.05 / 94.8 / 98.41 (viewer coverage: `server-stream.test.ts` "stops reading once a client abandons a long stream" times out at 5 s under coverage instrumentation with load average ~40; it passes in `just test`; the branch does not touch the viewer server)
- [x] Principles self-review PB1–PB13, zero FAIL (below)
- [ ] Claude, Grok, GPT lanes `VERDICT: LGTM` on one frozen packet
- [ ] Report the reviewed head to the coordinator (it lands with --ff-only)

## Principles Adherence

| ID | Verdict | Evidence |
|---|---|---|
| PB1 | PASS | Gate reads game RAM (FLAG_BADGE05_GET via SaveBlock1 flags, party moves, gPlayerAvatar.flags, map grid); no model claims used. |
| PB2 | N/A | No runs launched or graded. |
| PB3 | PASS | No improvement claimed; experiment registered pending, 8 trials per arm when run. |
| PB4 | PASS | New declared switch `surf-gated-exits-v1` in harness_features; state field `surf_gate` declared in the schema; vendor untouched; no RAM writes. |
| PB5 | PASS | One switch, hypothesis in `experiments/surf-gated-exits.json`; bundle arm only per operator. |
| PB6 | PASS | A gated connection gets one note (its Map connections line); a gated warp gets two (its candidate line and its Warp destination line); nothing clipped; lists only drop items. |
| PB7 | PASS | `surf_gate` recorded on every state event when ON, so the decision is replayable; tests replay recorded events. |
| PB8 | N/A | No model tool-call validation change. |
| PB9 | PASS | Placement choice (drop in lists, note in readout facts) recorded and explained; operator change (bundle arm only) applied when relayed. |
| PB10 | PASS | No skips, floor unchanged, no excludes, hooks on; existing tests changed only for registry positions/later-switch lists. |
| PB11 | PASS | Rules checked in pokeemerald 731ad5bf (field_control_avatar.c:448-452, field_player_avatar.c:1297, party_menu.c:119-128) and proved on real 4caa RAM with the pinned ROM. |
| PB12 | PASS | ROM only via POKEBENCH_ROM; fixtures hold RAM windows only. |
| PB13 | PASS | RED 6463417f, GREEN 41f60088, docs 5318ea74, gates, guard receipts; review loop next. |

## Session Log

- 2026-10-16 (New York): worklog created after read-only discovery of the 4caa events, its raw RAM at seq 4767, and pokeemerald 731ad5bf.
- 2026-10-16 2:48 PM New York: RED. Python: 29 tests fail at import (no `pokebench_env.surf_gate`); TS: suite fails at import (no `./surf-gate.js`). The TS fixture's surf_gate values were produced by the uncommitted GREEN server code from each state's raw RAM (1441 overworld states; ROUTE103 350 states all `warps [(45,6)]`, `connections [EAST]`, `can_surf false`; every other map empty).
- 2026-10-16 3:05 PM New York: coordinator relayed the operator's change (bundle arm only, default-off switch, pending experiment). Decision section and the registry copy updated; the TS registry test asserts "bundle arm only" and no "both arms".
- 2026-10-16 3:10 PM New York: GREEN. Existing tests updated only where they count positions or list later switches (`.at(-N)` +1 for the new last switch, later-switch off-lists gain surf-gated-exits-v1, observation count 35 -> 36, server list 38 -> 39, the all-on measurement JSON pops surf_gate like map_grid).
  Guard receipts: (g1) `surf-gate.ts` without the `features["surf-gated-exits-v1"]` check: 7 of 14 TS tests fail (OFF byte-equality on 4caa readouts and briefings, factory wiring); restored, 14 pass. (g2) `rerender.read_state` with `surf_gate_enabled=False`: 6 of 31 Python tests fail (ON notes, state JSON, surfing); restored, 31 pass.
- 2026-10-16 3:45 PM New York: review round 1 on packet f314c6c6 (base 4c805958, head 2da232be): Claude CLI LGTM; Cursor grok (cursor-grok-4.5-high) LGTM; Cursor gpt-5.6-sol-xhigh hit its usage limit (no review), so the GPT lane ran on isolated Codex (`codex exec -m gpt-5.6-sol`, read-only): BLOCKING on (1) repeated ROM/map/RAM fixture loads in test_surf_gate.py and (2) no exact explainer route test or viewer click receipt. Fixes: module-cached owners plus a test that they are built once (32 tests, 0.7 s); a byte-equal route test in server.test.ts with 403/405 checks; a scratch viewer (built worktree, port 8797, scratch runs root with 400 events of 4caa and the switch in harness_features) showed the SURF-GATED EXITS card with `READ EXPLAINER` -> `/explainers/surf-gated-exits-v1.html`, the click opens a new window the pane does not show, and the same URL loaded in the tab rendered the page (title "Surf-Gated Exits", 0 network resources); viewer stopped. Also from the LGTM lanes: `reason()` no longer calls an unread badge missing; the registry and explainer sentence on unread values matches `surf_use`; PB6 row corrected; explainer grid labels no longer overlap. Not changed (hardening): connections are keyed by direction; only Route111 (two WEST, both walkable) and Route124 (sea) have two on one side.
- 2026-10-16 3:55 PM New York: merged main e349269c; gates on the merged tip: `just test` (agent 1897, viewer 1002, Python 2498 passed), `just lint` clean, `just coverage` exit 0 (Python lines 97.55 / branches 93.60 / functions 100; agent 98.05 / 94.8 / 98.42; viewer 95.56 / 91.32 / 93.91). Round 2 packet sealed next, all three lanes.

- 2026-10-16 03:55 PM EDT: Final review on bd50aafa (packet sha256 39d029b2…4f62, base 986cb496): Claude CLI LGTM, Grok cursor-grok-4.5-high LGTM, Codex gpt-5.6-sol LGTM (round 2, after exact-head gates). Note: earlier entries stamped 3:45/3:55 PM actually ran about 3:15-3:40 PM.
- 2026-10-16 03:55 PM EDT: LANDED: main 85d0ef48 (worklog move only) merged into bd50aafa as 49e18c58; `git diff main 49e18c58` byte-identical to the reviewed packet; main fast-forwarded to 49e18c58. On main after `just build`: agent 1897, viewer 1003, pytest 2498 passed. Experiment surf-gated-exits repinned. Bundle arm only (the operator); bundle-v-control owner adds it.
