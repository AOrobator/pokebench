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
- Bug 4: status names from the STATUS1 bits (include/constants/battle.h:114-125); poison adds what the field does (field_control_avatar.c:637-660 UpdatePoisonStepCounter: every 4th step; field_poison.c:120 DoPoisonFieldEffect: -1 HP, can faint).

## Invariants

- INV-1 Each switch OFF reproduces today's readout text and state JSON byte for byte (recorded fixture frames re-rendered at base `00b2b317` and stored as the golden OFF text).
- INV-2 Each switch ON changes only its own lines (diff of OFF vs ON readouts on the fixture frames).
- INV-3 Every RAM fact is from a recorded raw archive (fixture = RAM windows only, never ROM bytes).

## Milestones

**M1 - RED** (all five switches)
- [x] Fixture `env/tests/env/fixtures/readout-truth-fixes.json.gz` from dc5a 10618/11525, f551 8716, 93eb 16529/758, b671 8838/11566, e962 9904, fe15 9631, 0e05 693/798, bd60 18617/19141 (OFF golden text at base)
- [x] RED tests (Python and TS) for each switch, failing for the right reason
- [ ] COMMIT RED

**M2 - GREEN**
- [ ] Implementation per switch, registry, presets, DEFAULT_NEXT_RUN, SERVER_FEATURES (TS and Python), default-off env list
- [ ] Wiring deletion receipts
- [ ] Gates: just test, just lint, just build, just coverage (>=90)
- [ ] COMMIT GREEN

**M3 - explainers and pending experiments**
- [ ] Five explainers, README, FEATURE_EXPLAINERS + panels/server tests, `just pages-check`
- [ ] Five pending `experiments/<id>.json`, `just experiments-check`, readiness rows
- [ ] COMMIT

**M4 - STOP** before the review loop; report to the thread.

## Log

- RED (M1): reproduced every bug at base 00b2b317 from the recorded archives: dc5a raw 10618/11525 and f551 raw 8716 decode party_owner "unknown" with "invalid move or PP" (moves 33,0,0,0 / PP 35,40,30,0); 93eb seq 16529 "Party (tutorial): UNKNOWN LvNone"; b671 8838/11566, e962 9904, fe15 9631 end in "save data is not initialized or valid"; 0e05 693 and 93eb 758 read "PETALBURG CITY (dynamic warp; map 0/0)" (0e05 798 reads LITTLEROOT TOWN); bd60 18617/19141 "STATUS 8". The golden OFF readouts are an ordered subsequence of the 10 recorded tool results (the agent inserts its own lines). None is already fixed on main. RED runs: pytest 50 failed / 114 passed in test_readout_truth_fixes.py + test_surf_gate.py; vitest agent readout-truth-fixes.test.ts 15 failed / 2 passed (the two passing are OFF characterizations); viewer readout-truth-fixes.test.ts 5 failed.
