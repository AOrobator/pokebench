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

- [x] RED: Python tests (sign label male/female, warp (14,8) and Location, OFF byte-identical, unknown gender, observation route) and TS registry tests
- [x] GREEN: implementation, registry, preset, defaults, explainer, pending experiment
- [x] Gates: test, lint, build, coverage, verify-vendor
- [x] Real-ROM probe from fast-text CLOCK_SET.state: ON vs OFF readout at Littleroot
- [x] Review: Codex + grok

## Session Log
- RED: `env/tests/env/test_displayed_place_names.py` (collection fails: no `pokebench_env.displayed_names`), OFF goldens rendered by fa09dbe6
  (`env/tests/env/fixtures/displayed-names-off-*-fa09dbe6.{txt,json}`); TS: features.test (registry, last), play-preset.test (omitted → OFF), next-run.test (default OFF). 2 TS failures + Python collection error.
- GREEN: `env/pokebench_env/displayed_names.py` (ROM sign-script shapes, gender from SaveBlock2+8, {PLAYER} from the save, Littleroot PLACES), `world.read_targets(sign_label=)`,
  `read_game_state(displayed_names_enabled=)` + `GameState.displayed_places`, readout Location / warp destinations / world destinations, server feature last + default off;
  TS registry (last in SWITCHABLE/FEATURES/SERVER/playHarnessFeatures), preset optional default OFF, DEFAULT_NEXT_RUN OFF; index/count updates in older tests.
  Tests: agent 1268, viewer 786, python 1980 passed (2 ROM skips). Wiring deletion checks: dropping `displayed_names_enabled` from rerender.read_state → 2 red
  (observation route, passthrough); dropping `places.get` in destinations → 3 red. Restored. Lint: ruff/eslint/tsc clean; mypy only the missing mgba._pylib binding (worktree).
- First real-ROM look (probe 2026-10-16T01-05-17_probe_aa70, CLOCK_SET, bedroom 2F): Location "AAA's HOUSE 2F", warp (7,1) -> "AAA's HOUSE 1F (map 1/0)", but the
  Notebook and GameCube (MSGBOX_SIGN furniture) were relabelled "Sign text ...". RED: verified non-sign catalog names (Notebook, GameCube) keep their name; 2 red.
- GREEN: `world._background_name`: a verified catalog name without the word "Sign" keeps its name; signs (and unidentified events) take their text. python 1984 passed.
- Real-ROM probe (CLOCK_SET fast text, player AAA, male): ON run `runs/2026-10-16T01-13-43_probe_6aac` seq 163 (Littleroot after walking out), seq 203 pressing A at (12,9)
  facing the sign: game Dialog "PROF. BIRCH'S HOUSE". OFF run `runs/2026-10-16T01-15-26_probe_1094` seq 166, identical presses. Control-arm rerender of the same raw RAM
  (00000026) and Route 101 rerender from c406 raw-ram/00001200 (sign (5,9) "ROUTE 101 | ↑ OLDALE TOWN", previously identity unavailable).
- RED: viewer panels.test (explainer mapping + content) and server.test (allowlist serves it); 2 red.
- GREEN: explainer `docs/explainers/displayed-place-names-v1.html` (+README), FEATURE_EXPLAINERS mapping, pending `experiments/displayed-place-names.json`
  (provisional source.commit 37896367, repin at merge), readiness row. test_rerender: the dc0e fixture predates the switch, so its recorded off list gains it
  (production decision probes derive OFF from the recorded harness features). just test: agent 1268, viewer 787, python 1986 passed.
- Gates: just coverage — agent 97.61/94.2/97.86/99.03 (stmt/branch/func/line), viewer 95.08/90.39/93.55/97.6, python lines 97.04 / branches 92.59 / functions 100 (floor 90);
  added two branch tests (gender values other than 0/1; FC controls in sign text) → displayed_names.py 100%. just lint clean (mypy passes once mgba binding copied into the worktree venv), just build OK, just verify-vendor OK.
- Review (delta: whole branch): Codex gpt-5.6-sol LGTM (no blocking; notes: provisional experiment pin, worklog boxes); grok cursor-grok-4.5-high LGTM
  (notes: PLACES table is hardcoded for the pinned ROM, catalog gate is the word "Sign", explainer SVG clipped). Widened the OFF/ON SVG panels; boxes ticked.
  An earlier review attempt wrote to a shared scratchpad file that another session overwrote (its verdict concerned loop-supervisor.ts in another worktree); re-run in a private dir.

- 2026-10-16 01:55 AM EDT (integrator): merged main (blocked-batch-result-v1, transition-loop-detection-v1, bedroom-exit split) into the branch; registries keep all three switches (order: displayed-place-names, transition-loop-detection, blocked-batch-result); `.at(-N)` registry tests bumped, observation group 18, switchboard rows 55. Agent 1350, viewer 794, pytest 1986 passed (2 skipped); lint clean apart from the worktree mypy binding.
