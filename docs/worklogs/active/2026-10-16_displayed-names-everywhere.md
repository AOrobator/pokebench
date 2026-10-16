# Displayed place names everywhere (completes `displayed-place-names-v1`)

Parent: `docs/worklogs/active/2026-10-16_prelaunch-fixes.md` (bundle-v-control pre-launch fixes, operator-approved).
Branch `claude/displayed-names-everywhere`, worktree `/private/tmp/pokebench-names-everywhere`. Owned by the long-run-loop review thread from 2026-10-16 02:45 EDT; The operator: "fix the harness bug and you can merge it to main when you get approvals from ... the cloud models".
No new switch: this finishes `displayed-place-names-v1` (default off, ON in both arms of bundle-v-control).

## Problem

Showcase run `2026-10-16T02-23-17_qwen36-gpu1_sh02` (switch ON): the readout's Location line and warps say
"GMREEN's HOUSE 1F", but other text in the same tool result still uses source-symbol names from JSON `location`:
auto-advance page headers (seq 997, 1037: "7. turn 57 · LITTLEROOT TOWN BRENDANS HOUSE 1F (map 1/0) · at 8,8 · MOM: …"),
press results ("warped during this press: LITTLEROOT TOWN BRENDANS HOUSE 1F [map 1/0] (8,8) -> …", seq 1494, 1613, 2006, 2120, 2396),
supervisor/stall briefings (loop_guard map_cycle seq 2783, milestone_drought seq 3616: "walked between LITTLEROOT TOWN (map 0/9)
and LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4)", dialogue quotes "turn 68, LITTLEROOT TOWN BRENDANS HOUSE 2F (map 1/1)").
24 tool results mix both names.

## Design

- Python: JSON `location` unchanged (milestones key on it). With the switch ON and a displayed name for the current map,
  state JSON carries `location_display`; with it OFF the key is absent (state JSON byte-identical).
- TS: `location_display` optional in the state schema; dialogue pages carry optional `map_display`. Every model-facing room/place
  name renders `location_display ?? location`; identity keys (`roomKey`, dedupe) stay on raw `location` + map id.
- Sites: auto-advance page header, get_dialogue map filter, press result / transition press result `place()`, dialogue log
  (`roomOf`, recall_dialogue room filter), loop supervisor and stall briefing (via `roomOf`), instruction ledger (via `roomOf`),
  navigation memory rooms, objective record facts / location condition message.

## Milestones

- [x] RED: Python state_json test; TS tests from cook #2's recorded state/pages (seq 2314 press result, seq 2376/2378 pages) + OFF paths (OFF state JSON byte-identity is the existing golden test)
- [x] GREEN: implementation, schema regen, explainer + feature text update
- [x] Gates: test, lint, build, coverage, verify-vendor
- [ ] Review: Codex + grok
- [ ] Merge main into branch, re-run suites

## Deferred

- Objective record facts keep the JSON `location`: `objective-tracking-v1` conditions match that raw value, so showing the displayed name there would let the model set a location condition that never matches. Off in bundle-v-control.

## Log

- 2026-10-16 02:55 EDT RED: `test_state_json_carries_the_displayed_location_only_when_the_switch_names_this_map` fails (KeyError); TS `displayed-names-everywhere.test.ts` 4 fail, `dialogue-auto-advance.test.ts` 1 fails.
- 2026-10-16 03:05 EDT GREEN: Python `state_json` adds `location_display` from `displayed_places` for the current map (absent when off). TS: optional `location_display` (state) and `map_display` (auto-advance page) in the schema, `schemas/events.v1.json` regenerated; `place()` in press-result, auto-advance `place()` and get_dialogue map filter, dialogue-log `roomOf` (so supervisor, stall briefing, ledger, recall_dialogue room filter), navigation-memory `room()` render the displayed name; `roomKey`/dedupe stay raw. Explainer section "One name everywhere"; feature text updated.
- Gates: `just test` agent 1406, viewer 797, Python 2018 (2 skipped) pass. `just coverage` agent lines 99.08 / branches 94.56 / functions 97.98; viewer 97.61 / 90.43 / 93.59; Python 97.08 / 92.67 / 100 (floor 90). `just lint`: tsc, eslint, ruff, format clean; mypy clean when run with the main checkout's venv (this worktree's venv lacks the native mGBA binding, so `mgba._pylib` is unresolvable there; file untouched). `just build` 0, `just verify-vendor` OK, `just pages-check` on the explainer clean.

## Principles self-review

| ID | Score | Note |
|---|---|---|
| PB1 | PASS | Milestones still read raw `location`; no grading change. |
| PB2 | N/A | No run accounting touched. |
| PB3 | N/A | No result claimed. |
| PB4 | PASS | Displayed names are text the game itself prints on its signs for this save; declared in the explainer. No route or destination added. |
| PB5 | PASS | Completes one existing switch; OFF is byte-identical (golden test + absent keys). |
| PB6 | PASS | Bug found in a 60-min watched run (cook #2), fixed with its recorded seqs as tests. |
| PB7 | PASS | `map_display` recorded on each page in events; schema regenerated. |
| PB8 | N/A | |
| PB9 | PASS | Pure rendering change with tests on both switch states. |
| PB10 | PASS | No thresholds or excludes changed. |
| PB11 | PASS | Vendor verified at pin. |
| PB12 | N/A | |
| PB13 | PASS | Explainer and feature card text updated. |
