# readout-truth-fixes: four readout bugs from the 2026-10-17 top-50 run analysis, plus surf-gated-exits-v2

Branch `claude/readout-truth-fixes` in `/private/tmp/pokebench-readout-truth-fixes`, cut from local main `00b2b317`. Local only: no push, no PR, no remote, no merge into main (the thread runs reviews and lands).

## Problem Statement

Operator ask (the operator, 1:55 PM New York, run-analysis thread): "address all of the observed harness bugs. They should each be under their own switch, and all the fixes need to be included in the bundle." Brief: `runs/reviews/2026-10-17-run-analysis-top50/harness-bug-fixes-brief.md`, Group A. Evidence: `ram-audit.md` items 1, 3 and 6 in the same folder.

1. Wally-scene party_owner. `LoadWallyZigzagoon` (pokeemerald `src/field_specials.c:1423-1435`) builds a Lv7 Zigzagoon with `CreateMon` (Tackle, Growl, Tail Whip with full PP), then sets MOVE2-4 to MOVE_NONE without clearing their PP. `decode_party_mon` rejects a move 0 with PP != 0 as "invalid move or PP", ownership returns `party_decode_unavailable`, the state says `party_owner: "unknown"`, and the agent's schema (`events.ts:456`, `player|tutorial|rental`) rejects the whole state. dc5a T687-885 got "malformed payload" on every call; f551 raw 8716; 93eb seq 16529 "UNKNOWN LvNone".
2. "Save data is not initialized or valid" on mid-frame snapshots. transition-coherence-v1 skips every save read when the main loop is not idle in WaitForVBlank (`game_state.py:252`), and the readout prints the uninitialized-save sentence (98 readouts in 10 runs; b671 raw 4400/5998, e962 raw 5304, fe15 raw 5017).
3. Truck warps labelled PETALBURG CITY. `SaveBlock1.dynamicWarp` is all zero until `InsideOfTruck_EventScript_SetIntroFlags` runs `setdynamicwarp MAP_LITTLEROOT_TOWN, 3, 10`; `_dynamic_warp` treats only (127,127) as unset, so map 0/0 (PETALBURG CITY) is shown (0e05 seq 693-786, 93eb seq 758-2281).
4. Poison shown as "STATUS 8" in the Party line (bd60 seq 18617-19141, 19 turns, HP 13 -> 0 on the field).
5. (Added by the coordinator, operator decision the operator 1:59 PM) `surf-gated-exits-v2`: the surf-gated notes name the Balance Badge and SURF, which the player has not been told about on Route 103 (route foreknowledge, PB4). Reword them; v1 text unchanged when v2 is off.

## Skills Loaded

feature-switch, execute-worklog (stop before the review loop), feature-explainer, experiment-queue, pokebench-game-state. Game source pret/pokeemerald `731ad5bf` (clean). ROM SHA-1 `f3ae0881`.

## Decisions

- Five server switches, default OFF in presets and DEFAULT_NEXT_RUN, appended to every registry list, bundle arm only (the bundle owner wires `experiments/fixed/*`; not edited here).
  - `tutorial-party-owner-v1` (bug 1)
  - `mid-frame-readout-v1` (bug 2)
  - `unset-dynamic-warp-v1` (bug 3)
  - `status-names-v1` (bug 4)
  - `surf-gated-exits-v2` (item 5, needs `surf-gated-exits-v1`)
- Bug 1 agent side: the server, with the switch ON, leaves `party_owner` out of the state JSON when ownership cannot be established (the field is already optional in `StateBodySchema`), and keeps `party_ownership` (owner null, source) as evidence. The agent schema and its parse paths are unchanged, so OFF is byte-identical on both stacks and no state is dropped ON. Considered and rejected: widening the TS enum to "unknown" (it would change OFF, since the OFF server already emits "unknown"), or gating every parse path on the switch (many entry points).
- Bug 2: option (a), a true readout line when the only reason the save was not read is the mid-frame snapshot. Option (b), settling to the next idle frame, changes emulated timing; left as a follow-up.
- Bug 3: an all-zero WarpData (8 bytes) is unset; the readout then uses its existing "dynamic destination" fallback.
- Bug 4: status names are the game's own labels (gText_Psn/Par/Slp/Frz/Brn "PSN" "PAR" "SLP" "FRZ" "BRN", src/strings.c:627-631) for the one ailment GetAilmentFromStatus (src/party_menu.c:1909-1922) picks, as the party and summary status icons show it; no sleep turns or field-poison note, which the game does not show (operator rule, the operator 2:17 PM, via the coordinator: model-facing text says what the game would show, else only the observable fact). A status with no ailment keeps its number.
- Item 5: EventScript_UseSurf (data/scripts/surf.inc) jumps to EventScript_EndUseSurf and ends silently when no party Pokémon knows SURF, so v2 says only "crosses water you cannot cross yet" (cited in test_readout_truth_fixes.py). The mid-frame line names nothing the game has not shown.

## Invariants

- INV-1 Each switch OFF reproduces today's readout text and state JSON byte for byte (recorded fixture frames re-rendered at base `00b2b317` and stored as the golden OFF text).
- INV-2 Each switch ON changes only its own lines (diff of OFF vs ON readouts on the fixture frames).
- INV-3 Every RAM fact is from a recorded raw archive (fixture = RAM windows only, never ROM bytes).

## Milestones

**M1 - RED** (all five switches)
- [x] Fixture `env/tests/env/fixtures/readout-truth-fixes.json.gz` from dc5a 10618/11525, f551 8716, 93eb 16529/758, b671 8838/11566, e962 9904, fe15 9631, 0e05 693/798, bd60 18617/19141 (OFF golden text at base)
- [x] RED tests (Python and TS) for each switch, failing for the right reason
- [x] COMMIT RED: `test(readout-truth-fixes): RED for tutorial-party-owner-v1, mid-frame-readout-v1, unset-dynamic-warp-v1, status-names-v1, surf-gated-exits-v2` (0bb139d2)

**M2 - GREEN**
- [x] Implementation per switch, registry, presets, DEFAULT_NEXT_RUN, SERVER_FEATURES (TS and Python), default-off env list
- [x] Wiring deletion receipts
- [x] Gates: just test, just lint, just build, just coverage (>=90)
- [ ] COMMIT GREEN

**M3 - explainers and pending experiments**
- [ ] Five explainers, README, FEATURE_EXPLAINERS + panels/server tests, `just pages-check`
- [ ] Five pending `experiments/<id>.json`, `just experiments-check`, readiness rows
- [ ] COMMIT

**M4 - STOP** before the review loop; report to the thread.

## Log

- RED (M1): reproduced every bug at base 00b2b317 from the recorded archives: dc5a raw 10618/11525 and f551 raw 8716 decode party_owner "unknown" with "invalid move or PP" (moves 33,0,0,0 / PP 35,40,30,0); 93eb seq 16529 "Party (tutorial): UNKNOWN LvNone"; b671 8838/11566, e962 9904, fe15 9631 end in "save data is not initialized or valid"; 0e05 693 and 93eb 758 read "PETALBURG CITY (dynamic warp; map 0/0)" (0e05 798 reads LITTLEROOT TOWN); bd60 18617/19141 "STATUS 8". The golden OFF readouts are an ordered subsequence of the 10 recorded tool results (the agent inserts its own lines). None is already fixed on main. RED runs: pytest 50 failed / 114 passed in test_readout_truth_fixes.py + test_surf_gate.py; vitest agent readout-truth-fixes.test.ts 15 failed / 2 passed (the two passing are OFF characterizations); viewer readout-truth-fixes.test.ts 5 failed.
- GREEN (M2): implementation in pokemon.py (`empty_move_pp`), game_state.py (three reader switches, `mid_frame`, `party_owner: str | None`), readout.py (Party owner, PSN labels, mid-frame line, `party_owner` omitted when None, SERVER_FEATURES and default-off list), surf_gate.py (`SWITCH_V2`, plain notes), rerender.py, new readout_fixes.py and status_names.py; agent features.ts (registry, server list, run record), play-preset.ts, untaken-exits.ts (v2 line); viewer next-run.ts. Positional registry assertions in older tests shifted by 5 and the later-switch-off lists extended (no behavior change). surf-gated-exits-v2 also rewords a real recorded line: bd60 T706 (seq 19141) ROUTE104 SOUTH edge.
- Wiring deletion receipts: rerender without `tutorial_owner_enabled` -> 10 failed; without `mid_frame_enabled` -> 9 failed; without `unset_warp_enabled` -> 5 failed; readout `named_status = False` -> 4 failed; `plain = False` -> 4 failed; untaken-exits v2 conditional forced off -> 1 failed; SERVER_FEATURES entries removed -> 6 failed; `...when("status-names-v1")` removed -> 1 failed. All restored.
- Gates on the GREEN tree: just test (vitest agent 2122 passed, viewer 1106 passed; pytest 2667 passed), just lint clean (tsc, eslint, ruff, ruff format, mypy), just build ok, just coverage: agent lines 99.23 / branches 94.42 / functions 98.27; viewer lines 97.62 / branches 91.39 / functions 93.78; Python lines 97.62 / branches 93.77 / functions 100 (floor 90). New modules status_names.py, readout_fixes.py 100%.
