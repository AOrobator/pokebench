# Respawn readout (`respawn-readout-v1`)

Status: reviewed (Claude + Grok LGTM, round 2). Ready for the coordinator to land. Part of `heal-respawn-sight` (M2 there). The operator approved the plan at 3:41 PM ET on 2026-10-20.
Shared design and evidence: the coordinator's `2026-10-20_heal-respawn-sight.md` (scratchpad). Worktree
`~/dev/pokebench-worktrees/respawn-readout-v1`, branch `claude/respawn-readout-v1`, from main 6c88d424.

## Problem

Run `2026-10-20T13-54-28_qwen36-gpu0_b300` never entered a POKéMON CENTER (`used_pokecenter 0`). It went
straight into the Rustboro Gym past the center door at (16,38), blacked out to HIKER MARC and woke up in its
bedroom in Littleroot, 9 map changes back. Nothing in the readout said where a blackout sends it.

## Game facts (pret/pokeemerald 731ad5b)

- `SaveBlock1.lastHealLocation` (+0x1C, `struct WarpData`: s8 mapGroup, s8 mapNum, s8 warpId, s16 x, s16 y),
  `include/global.h`. Set by `SetLastHealLocationWarp` (`src/overworld.c`) from `setrespawn`.
- Every `*_PokemonCenter_1F/scripts.inc` OnTransition runs `setrespawn HEAL_LOCATION_<TOWN>`; so does the truck
  intro (house 2F) and the Hall of Fame. The heal location is the town map tile below the center door
  (`src/data/heal_locations.json`, e.g. RUSTBORO CITY (16,39)), or the bedroom (house 2F (4,2)).
- `DoWhiteOut` (`src/overworld.c`): `SetMoney(money / 2)`, heal party, warp to lastHealLocation. The loss is
  `money - money / 2`; Emerald has no badge/level formula. No field text follows (`FieldCB_WarpExitFadeFromBlack`).
- Battle text: `sText_PlayerWhiteout` "is out of usable POKéMON!", `sText_PlayerWhiteout2` "whited out!".

## Design

A server readout line, default OFF, bundle only, placed right after `Money:`. On a started game, on the overworld
screen, out of battle:

`If your party faints, you wake up at your house in LITTLEROOT TOWN (9 map changes from here) and lose half your money (₽3222 of ₽6444).`

- Center respawn: `outside the POKéMON CENTER in RUSTBORO CITY` (the heal location is the tile below the door).
- Map changes: fewest changes over the ROM map table's warps and connections, both ways: a port of
  `hopsFrom` in `low-hp-trainer-warning.ts` (the server renders the readout, so it cannot call the TS).
  Counted to the map you wake on. `(on this map)` at 0; omitted when unreachable.
- Second sentence for each exit of this map (or this map) that is a POKéMON CENTER 1F whose heal location is not
  the saved one: "This town has a POKéMON CENTER you have not entered: RUSTBORO CITY POKEMON CENTER 1F at (16,38).
  Entering a POKéMON CENTER makes it the place you wake up if your party faints."
  "Entered" comes from what this server saw: centers it read the player standing in, plus the center behind every
  lastHealLocation it read. Only when the server saw the game from before the save existed is "not entered" claimed;
  otherwise (checkpoint start, re-render) the sentence says only that it is not where you wake up.
- No event: the line is an observation recorded with the readout; agent-observability asks for events for
  interventions and diagnostics. No timeline change.

## Milestones

- [x] M1 RED: `env/tests/env/test_respawn_readout.py` (hops, heal kinds, wording, money rule, placement, OFF bytes,
      memory) + registry/preset tests.
- [x] M1 GREEN: `env/pokebench_env/respawn.py`, GameState/read_game_state/readout/rerender/observation wiring,
      registry, presets, defaults.
- [x] Explainer `docs/explainers/respawn-readout-v1.html`, FEATURE_EXPLAINERS, pending `experiments/respawn-readout.json`.
- [x] b300 replay at state seqs 14716 (turn of seq 14724), 15196 (after seq 15195) and 15755 (turn of seq 15776).
- [x] Gates, sync main, Claude + Grok review (2 rounds max).

## Session log

- 2026-10-20 ~4:00 PM ET: read brief, skills, game source. b300 raw RAM: lastHealLocation (1,1,-1,4,2) =
  BRENDANS HOUSE 2F at all three seqs; hops from RUSTBORO CITY 8, from the gym 9, in the bedroom 0 (house 1F
  is 8 from the gym: the brief's "8" counted the 1F).
- RED: `env/tests/env/test_respawn_readout.py` 27 failing against a stub `respawn.py` (heal points, map changes,
  reading, wording, money rule, memory, placement, OFF bytes, battle/off-field); `packages/agent/src/respawn-readout.test.ts`
  2 failing (registry, order).
  COMMIT: `test(respawn-readout-v1): RED for the respawn readout line and its registry entry` (2bc8c3f1)
- GREEN: `respawn.py` (HEAL_POINTS/CENTERS from heal_locations.json + setrespawn scripts, map_changes port of
  hopsFrom, LinkCache, read_respawn, RespawnMemory, respawn_line); GameState.respawn; read_game_state
  `respawn_links`; readout line after Money; rerender/observation wiring (LinkCache + RespawnMemory only when ON).
  Registry, presets, DEFAULT_NEXT_RUN, LEGACY_ALL_ON (off). Server-list suffix indexes and features-off strings in
  older tests advance by one; historical experiment vectors exclude the new switch; dc0e rerender fixture runs it off.
- Tests: respawn 30/30; agent vitest 2899/2899; viewer 1423/1423; pytest 2935 passed + 1 pre-existing failure
  (test_view: the fresh worktree venv had no mgba binding; `just build-mgba` run, rechecked under coverage).
- Wiring mutations: observation render with `respawn_memory=None` -> 1 failed (endpoint memory test); rerender
  `respawn_links=None` -> 3 failed. Both restored, 40/40 (respawn + rerender).
- b300 replay (raw RAM, run's own server switches + this one, memory folded from the recorded states):
  14716 RUSTBORO CITY: house, 8 changes, ₽3142 of ₽6284, + the unentered center at (16,38);
  15196 GYM: house, 9 changes, ₽3222 of ₽6444; 15755 bedroom: house (on this map), ₽1643 of ₽3286.

- Coverage after GREEN: agent 97.19/92.89/97.68 (stmts/branch/funcs), viewer 95.09/91.04/93.85, Python lines 97.00
  branches 92.56 functions 100 (respawn.py 99%). pytest 2936 passed once mgba was built.
- Explainer `docs/explainers/respawn-readout-v1.html` (b300 replay text, map-change chain, game grounding, wording
  table, wiring), README entry, FEATURE_EXPLAINERS + panels/server tests; `just pages-check` clean. Pending
  `experiments/respawn-readout.json` (shared incumbent, flips only this switch, no queuePosition; source.commit =
  implementation commit, repin on landing) and a readiness.md row. `experiment-cli check`: only the pre-existing
  starter-decision-salience ledger problems.

## Surprises

- The brief's "8 map changes" from the gym counted the house 1F (heal-before-trainers' home). The respawn map is
  the 2F, 9 changes away. The line states 9.
- Emerald's blackout loss really is half (`DoWhiteOut`), not the later games' badge/level table.

## Multi-Model Review Log

Round 1, packet base ee95b866 head 6e501415, diff sha256 cd7c97d8...560ca (after `git merge main`, gates green).
- Grok (cursor-agent cursor-grok-4.5-high): VERDICT: LGTM. Non-blocking: adjacency rebuilt per call, unlocked
  `knows()`, worklog checkboxes (follow-ups / fixed in worklog).
- Claude: `claude -p` (default and ~/.claude-review) failed: OAuth session expired. Cursor Claude (opus-5, sonnet-5):
  usage limit until 11/17. Fallback: fresh read-only Claude subagent (Plan type) on the same packet:
  VERDICT: BLOCKING. B1 (Fix): a new game's zeroed SaveBlock1 (ClearSav1) reads as PETALBURG CITY (0,0) in the
  truck before its setrespawn runs. Fixed: lastHealLocation counts only with warpId == WARP_ID_NONE, which
  SetLastHealLocationWarp always stores; RED test with 8 zero bytes (failed, then passes); b300 truck states 813,
  823, 831 now give no line. H1-H4 follow-ups (SSTidalCorridor/Lavaridge setrespawn without a center entry,
  field-poison Lavaridge respawn, missed center between observations, unlocked LinkCache fill): not in the
  Roxanne window; recorded, not changed.

Round 2, packet base ee95b866 head 47449683, cumulative diff sha256 a00c4aa6...669c6e08. Gates on that tip:
agent 2899/2899, viewer 1424/1424, pytest 2937 passed; coverage agent 97.19/92.89/97.68, viewer 95.09/91.04/93.85,
Python lines 97.00 branches 92.56 functions 100; lint and build clean.
- Grok (cursor-grok-4.5-high): VERDICT: LGTM (B1 fix verified against overworld.c/maps.h; H1-H4 follow-ups).
- Claude (read-only Claude subagent fallback; CLI auth expired, Cursor Claude over its usage limit): VERDICT: LGTM.
  Confirmed every lastHealLocation writer goes through SetLastHealLocationWarp with WARP_ID_NONE.
- Codex lane waived by the coordinator (2026-10-20). This commit touches only this worklog.

## Boy Scout Log
