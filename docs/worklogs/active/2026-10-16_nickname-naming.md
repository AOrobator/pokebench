# Nickname naming readout and no-nickname guidance (pre-launch fixes F10, F11; bundle switches)

Parent: readiness thread pre-launch worklog (`docs/worklogs/active/2026-10-16_prelaunch-fixes.md` on `claude/prelaunch-fixes`), F10 and F11. Operator decisions (the operator, 2026-10-16 01:01 AM EDT, Route 101 thread): both are bundle switches, default off, OFF = today; the Route 101 thread lands them on main itself (01:14 AM). Branch `claude/nickname-naming`, worktree `/private/tmp/pokebench-m5c-nickname`.

## Problem

Showcase bundle run `2026-10-16T00-34-26_qwen36-gpu1_show`: PROF. BIRCH offered a nickname at turn 252 (12:50 AM EDT), the model answered YES and was still in the nickname editor at turn 330+ (12:57 AM), buffer " ,VQ", trying to type "MOM". Two causes:
1. Bug: the naming readout (`Name being edited` / `Naming keyboard` / selected key) only exists before the game starts. `read_naming` is called only on the pre-game early return (`env/pokebench_env/game_state.py`), so in-game `state.naming` is None; with `expanded-menu-battle-information-v1` OFF the naming_editor interface line is hidden too ("Dialog: detailed menu text unprovided"). The model had only the screenshot.
2. Strategy: nothing tells a speed run to decline nicknames.

## Design

- **F10 `in-game-naming-readout-v1`** (observation, server, needs `naming-cursor-v1`): in-game naming screens (callback2 0x080E4F59 with the field initialized: nickname, box, caught mon, Walda) carry the same `NamingState` readout as player naming, in the same place (after the Story line). State JSON `naming` is filled too. OFF: None, as today.
- **F11 `no-nickname-guidance-v1`** (guidance, agent prompt): one system-prompt paragraph: decline nickname offers; if already in a nickname editor, START then A on OK without editing (an empty nickname keeps the species name, pokeemerald `naming_screen.c` SaveInputText).

## Invariants

- OFF byte-identical readout/state JSON (recorded showcase readouts seq 4993/5043/8548) and prompt.
- Readout values come from game RAM only; no truncation.

## Milestones

**M1 — RED**
- [x] Python: showcase raw-RAM fixtures (4993 transition, 5043 editor, 8548 later editor) OFF = recorded text; ON adds the naming lines with the live text/key; registered server switch default off; reader threads the switch
- [x] TS: registry/presets/defaults/server env for both; prompt ON/OFF; factory path; explainer mappings

**M2 — GREEN, gates, review**
- [x] Implement; gates (agent 1331 97.64/94.31/97.89; viewer 793 95.1/90.45/93.59; pytest 1970 97.04/92.60/100; lint, build, schema, verify-vendor clean); delete-the-wiring checks: dropping `in_game_naming_enabled` from rerender turns 3 ON tests red; dropping the prompt line turns 2 prompt tests red; both restored
- [x] Real-ROM probe from `runs/auto-advance-qualify/states/lab-yesno.state`: ON readout in the editor; START then A keeps TORCHIC
- [x] Explainers (`docs/explainers/in-game-naming-readout-v1.html`, `no-nickname-guidance-v1.html`, README, FEATURE_EXPLAINERS), pending `experiments/in-game-naming-readout.json` and `no-nickname-guidance.json` (activation BIRCH_RESCUE_COMPLETE, primary ROUTE_103), readiness rows (likely BLOCKED, 0 of 4 think-fast runs reached BIRCH_RESCUE_COMPLETE)
- [ ] Multi-model review

## Session Log

- 2026-10-16 01:45 AM EDT: Took over the worktree from the readiness thread (it had left three raw-RAM fixtures and their OFF readouts, untracked). Fast-forwarded to main 342a2d51.

## Surprises

## Multi-Model Review Log
- 2026-10-16 01:55 AM EDT: RED. `env/tests/env/test_in_game_naming.py` 8 failing (unknown switch in POKEBENCH_FEATURES_OFF; reader has no `in_game_naming_enabled`); expected ON lines checked against the run's own active_ui values (4993 transition, 5043 'AAAAAAA' key A, 8548 ' ,VQ' key B). `packages/agent/src/nickname-naming.test.ts` 5 failing (unknown features); viewer explainer mapping/allowlist/defaults red.
- 2026-10-16 02:05 AM EDT: Real-ROM probe, live servers 8463 (ON) / 8464 (OFF) from `lab-yesno.state` (Birch's nickname YES/NO, YES highlighted): A opens the editor; ON readout adds `Name being edited: ''` / `Naming keyboard: uppercase; cursor column 0, row 0 (zero-based); selected key 'A'` / `Naming input: ready` / hint after the Story line, state JSON naming filled; OFF has neither. START then A on ON with nothing typed returns to the field with party nickname `TORCHIC`; A, START, A on the other server sets nickname `A`. So the guidance's "START then A keeps the species name" is game behavior, not an assumption.
- 2026-10-16 02:15 AM EDT: GREEN. Test-position updates for the two appended switches (features.test, blocked-batch-result.test, dialogue-auto-advance.test, battle-details-v2 server position now a membership check; controls observation counter derived from FEATURES).
- 2026-10-16 02:25 AM EDT: Review round 1: Grok LGTM, Opus LGTM, Fable LGTM, Codex BLOCKING (1) the in-game readout keeps naming the old buffer after OK is pressed (phases 6-9: saving, sent-to-PC message, fade-out) — accepted, RED test_in_game_readout_stops_once_ok_is_pressed; (2) the viewer's RESET TO DEFAULT turns every registered switch on — rejected as a blocker: pre-existing next-run UI behavior shared by every default-off switch, not the experiment control arm (definitions set switches explicitly). Fable: viewer lint failed on `${observed}` (number) — fixed with String().
- GREEN: naming.editor_open gates the in-game readout to phases 0-5 (STATE_FADE_IN..STATE_WAIT_PAGE_SWAP); player naming path unchanged.
