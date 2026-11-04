# Rotating-gate readouts: correct positions, rules on the map, navigate_to stops at arms

**Started:** 2026-11-04
**Status:** built on `claude/rotating-gate-readouts`, local only, not landed. Multi-model review and full suites not run.
**Branch:** `claude/rotating-gate-readouts` (from main `c046cc642`), worktree `/private/tmp/pb-rotating-gate`.
**Approval:** The operator approved all work items, relayed by the coordinator 2026-11-04. Item 5: The operator's "the gate switches should be on in both arms" reached this thread through the coordinator, 2026-11-04.

## Problem statement

Run 274b entered FORTREE CITY GYM at turn 2043 and made no milestone in the next 120+ turns. `_sprite_state` labels a gate "transitioning" when sprite byte 0x3F bit 0x20 (affineAnimEnded) is clear. A loaded, never-rotated gate sits at 0x3F=0x50 with data[1]=0 forever, so every on-screen unpushed gate vanishes from the readout: no arms on the map, Next tiles says clear. The orientation byte at saveblock1+0x139C is right the whole time and is what the game's collision uses. navigate_to ignores gates, plans through arms and reports a vague "blocked".

## Game rules (pret 731ad5bf, src/rotating_gate.c)

- `CheckForRotatingGatePuzzleCollision`: stepping across an arm's line checks `RotatingGate_HasArm`, then `RotatingGate_CanRotate`. If it can rotate the orientation changes at once and the function returns FALSE, so the player steps through. If it cannot, it returns TRUE (COLLISION_ROTATING_GATE) and the player stays.
- `sRotatingGate_RotationInfo*`: walking north into a west arm is clockwise, into an east arm anticlockwise, and so on: the arm always moves the way the player walks.
- `RotatingGate_CanRotate`: each present arm's swept tile (`sRotatingGate_ArmPositions*`) must not have collision 1. Objects do not stop a gate.
- `RotatingGate_InitPuzzle` runs on map transition and resets every orientation.

## Switches (registry default OFF; OFF is byte-identical to today)

| Item | Switch | Where |
|---|---|---|
| 1 | `rotating-gate-positions-v1` | server: orientation byte only, every gate listed |
| 2 | `rotating-gate-rules-v1` | server: short rules block, gate maps only, never the system prompt |
| 3 | `rotating-gate-map-v1` | server: one line per gate, legend only for what is present |
| 3 | `map-code-aliases-v1` | server: one Codes letter per element token |
| 4 | `rotating-gate-navigation-v1` | agent: arm edges blocked, stops before an arm and names it |

## Milestones

- [x] M1: registry and server switches (items 1, 2, 3)
- [x] M2: navigate_to (item 4)
- [x] M3: recipe (item 5), explainer, replay check on 274b dumps

## Log

- M1 GREEN: 155 passed across test_rotating_gate_readouts, test_map_rotating_elements, test_map_observation, _wiring, _consistency, test_player_map_visibility_v2.
- M2 GREEN: 147 passed across rotating-gate-navigation, navigation-tool-switches, bike-navigation, surf-navigation, navigation-strides, features, play-preset. Removing the `rotatingGates` factory wiring failed two tests (walks up to the arm; presses nothing), then restored.
- Replay on 274b dumps 00057101, 00057155, 00057425, 00057467: every gate listed, no transitioning, rules once per readout. Files in `runs/rotating-gate-readouts/`.
- Test-first order was not kept: implementation and tests landed together, so no separate RED commit exists.
- Item 5: `rejected-movement-prefix-v1` moved from `switches` to onInBoth, base true, mirrored in the plain-run preset. The five new switches stay off in both arms until the operator confirms.
- Replay of real state 00057155: planNavigation from (4,19) to (4,18) off = UP, on = no route; (2,21) still routes on. All four dumps: pivots equal the raw orientation bytes.
- Not done: live emulator proof, no-pause checkpoint decision for 274b (waiting on the operator), viewer restart.
- Five gate switches moved to onInBoth, base true, mirrored in the plain-run preset. Relayed instruction, local branch only.

## Multi-Model Review Log

Round 1, packet c046cc642..3b3b7cdf3, diff SHA-256 858ce7cde3a29b2a9c75f15c6ce1c4c521832e861c6df6af3e42d1a8522c25fb.
- Principles self-review: zero FAIL rows.
- Claude CLI: BLOCKING on B1 (key named gate glyphs a local view did not draw). Accepted, fixed. H1 multi-tile edges: not reachable on either gate map. H2 navigation fails open when the gate read is unavailable: the readout reports it; follow-up. H3 player-map-visibility-v2 filters gates: off in both arms. H4 navigate_to_target: the Navigation line naming the arm stays in the result text, no change.
- GPT (Codex CLI gpt-5.6-sol): LGTM.
- Grok (Cursor): usage limit until 11/17, so the standing fallback applies.
- Fallback read-only subagent: LGTM.

## Gates

`just build`, `just test` (agent 2453, viewer 804, env 2893, gateway 38, floors and no-io-proof), `just verify-vendor` passed at 3b3b7cdf3. `just lint` stopped at mypy on `mgba._pylib`, absent in this worktree; mypy over 141 files passed against the main env's interpreter, and the gateway lint steps passed.

Round 2, fix delta 3b3b7cdf3..09ba77d78, diff SHA-256 708fc389b21cb39ea1edeb6088311488f2823b0901335df997256cb434e29bd7: Claude CLI LGTM, GPT LGTM, fallback subagent LGTM. Grok unavailable (Cursor usage limit). Follow-ups: table-driven view-edge test for the key bounds; the key's `--` is a single `-` at compact width.

Before landing: `just test` and `just lint` at the final head. After landing: combined `just test` on main, then `just viewer-main` before any launch from this pin.
