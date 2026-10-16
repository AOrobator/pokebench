# Displayed place names (pre-launch fix F3, switch `displayed-place-names-v1`)

Parent: `docs/worklogs/active/2026-10-16_prelaunch-fixes.md` (prelaunch branch), milestone M2. Operator-approved there.
Branch `claude/displayed-place-names`, worktree `/private/tmp/pokebench-m2-names`. Left unmerged for the integrator.

## Problem

The readout names signs from their script symbols and building maps from their map constants, not from what the game shows the player.
For a male player the sign at Littleroot (12,8) prints "PROF. BIRCH'S HOUSE" (pokeemerald `data/maps/LittlerootTown/scripts.inc` 402–412,
`LittlerootTown_Text_ProfBirchsHouse`), but the readout says "Mays House Sign", and named-warp-destinations-v1 calls warp (14,8)
"LITTLEROOT TOWN MAYS HOUSE 1F". Both qualification runs went to Birch's lab (control-2919.md bug 3, bundle-3f21.md bug 1).

## Design

- Server switch `displayed-place-names-v1`, default OFF; ON in both arms (integrator wires it).
- Sign label: for a background event whose script, read from ROM at its pointer, is exactly `msgbox TEXT, MSGBOX_SIGN; end`
  or the `checkplayergender` / `call_if_eq VAR_RESULT, MALE|FEMALE` branch to `msgbox TEXT, MSGBOX_DEFAULT; return`,
  the target name becomes `Sign text "<the text the game prints>"`, with `{PLAYER}` filled from the save and the branch picked
  by SaveBlock2.playerGender (0 male, 1 female). Any other script shape, other placeholder, unknown gender or undecodable text keeps today's name.
- Building names: the Littleroot buildings the game itself names by sign (players' houses 1F/2F, Birch's lab) get the sign text
  for this save's gender (+ floor) in the Location line, the named-warp destinations (Warps line, candidates) and world-destinations lines.
- JSON target `name` carries the sign label under ON, so the TS supervisor / dialogue log see it too. Location in JSON is unchanged (milestones key on it).

## Milestones

- [ ] RED: Python tests (sign label male/female, warp (14,8) and Location, OFF byte-identical, unknown gender, observation route) and TS registry tests
- [ ] GREEN: implementation, registry, preset, defaults, explainer, pending experiment
- [ ] Gates: test, lint, build, coverage, verify-vendor
- [ ] Real-ROM probe from fast-text CLOCK_SET.state: ON vs OFF readout at Littleroot
- [ ] Review: Codex + grok

## Session Log
- RED: `env/tests/env/test_displayed_place_names.py` (collection fails: no `pokebench_env.displayed_names`), OFF goldens rendered by fa09dbe6
  (`env/tests/env/fixtures/displayed-names-off-*-fa09dbe6.{txt,json}`); TS: features.test (registry, last), play-preset.test (omitted → OFF), next-run.test (default OFF). 2 TS failures + Python collection error.
- GREEN: `env/pokebench_env/displayed_names.py` (ROM sign-script shapes, gender from SaveBlock2+8, {PLAYER} from the save, Littleroot PLACES), `world.read_targets(sign_label=)`,
  `read_game_state(displayed_names_enabled=)` + `GameState.displayed_places`, readout Location / warp destinations / world destinations, server feature last + default off;
  TS registry (last in SWITCHABLE/FEATURES/SERVER/playHarnessFeatures), preset optional default OFF, DEFAULT_NEXT_RUN OFF; index/count updates in older tests.
  Tests: agent 1268, viewer 786, python 1980 passed (2 ROM skips). Wiring deletion checks: dropping `displayed_names_enabled` from rerender.read_state → 2 red
  (observation route, passthrough); dropping `places.get` in destinations → 3 red. Restored. Lint: ruff/eslint/tsc clean; mypy only the missing mgba._pylib binding (worktree).
