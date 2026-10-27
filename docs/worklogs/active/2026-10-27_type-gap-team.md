# Type gap, supplies and untalked people in gym

The operator approved three bundle-only, default-off switches at 1:33 PM NY on 2026-10-27, in the thread "Design type-gap-team switch". The spec is runs/designs/type-gap-team-v1.md (gitignored scratch); this worklog records what was built from it.

Branch `claude/type-gap-team`, worktree /private/tmp/pb-type-gap-team. No live run, GPU, probe or viewer restart is touched. Local only.

## Switches

- **type-gap-team-v1** (observation, server + agent). For each gym whose badge flag is clear and whose type this run has evidence for, a block with: the gym's types and their quoted sources (foe battlers in trainer battles on the gym map; the gym guide's sentence in the ROM guides' patterns; the gym sign, typed only by "X-loving"); the attacking types the ROM type chart makes super effective against them, with multipliers; which of those no party species type or damaging move has; the party; wild POKéMON met this run with gap types (or the wild foe at a wild decision); balls; controls. Triggers: a wild decision whose foe has a gap type; the first field result after a loss to a GYM LEADER (once per loss); the first field result after a gym's type first becomes known (once per gym). The server adds `type_gap` (party species types, move types/power, ROM gTypeEffectiveness rows) only with the switch.
- **supplies-v1** (observation, agent). "Supplies: ₽… · balls: … · healing and status items: … · party N of 6" at the first field result of each POKé MART visit and when the buy list opens.
- **untalked-in-gym-v1** (observation, agent). On a gym map's field, results start with the people on the map never talked to this run (people ledger record plus auto-talks). untalked-people-header-v1 covers every map since the last story milestone inside harness-trust-v1's header, so this one is narrow: gym maps only, this run, first in the result.

## Game grounding

- gTypeEffectiveness at ROM 0x0831ACE8 (336 bytes, right before gTypeNames 0x0831AE38). `env/tests/env/test_type_gap.py` reads the real ROM: every row equals pret battle_main.c in order, 0xFF follows the last row, "NORMAL" follows the table.
- Gym guide sentences, from pret data/maps/*Gym*/scripts.inc GymGuideAdvice: "is a user of", "commands", "uses", "use", "is a master of" X-type POKéMON. The test finds each of the seven type-naming sentences encoded in the ROM. PETALBURG names no type.
- Gym signs: only RUSTBORO's names a type ("The ROCK-loving honors student!").
- Badge per gym: each gym statue script's goto_if_set FLAG_BADGE0N_GET.
- Healing and status items: pret items.h medicine, PP and SACRED ASH items without vitamins and BLUE FLUTE, plus PERSIM BERRY.

## Milestones

- [x] M1 server: `type_gap.py`, GameState/state_json/rerender wiring, SERVER_FEATURES and the default-off list; ROM tests.
- [x] M2 agent: `type-gap-team.ts`, `supplies.ts`, `untalked-in-gym.ts`, `PeopleLedger.untalkedThisRun`; registry, presets, defaults, current.json bundle list, schema; wiring in `playGameTools`.
- [x] M3 tests: d41e t335 post-loss block, guide-time block, GRASS catch clears GRASS, no block in a trainer battle or with no gym type, OFF byte-identical (unit and production path), registry. Production-path RED: removing the three wrappers from play-wiring.ts turned all three tests in type-gap-wiring.test.ts red; restored green.
- [x] M4 explainers: docs/explainers/type-gap-team-v1.html, supplies-v1.html, untalked-in-gym-v1.html, themed, pages-check clean, mapped in FEATURE_EXPLAINERS.
- [x] M5 gates and commit (SHA recorded below after commit).
- [ ] Landing: needs the review loop; the coordinator's 17:35Z note allows landing with Claude + GPT + one fallback reviewer under the operator's standing waiver once vLLM-lane has landed.

## Deviations from the spec draft

- d41e's real t335 block lists "met in battle: JOSH's GEODUDE ROCK/GROUND, ROXANNE's GEODUDE ROCK/GROUND" (d41e fought gym trainer JOSH; it never saw NOSEPASS), and ICE ×2 joins the strong types from GEODUDE's ROCK/GROUND pair. Its wild line says none: d41e's own wild battles before the loss were ZIGZAGOON, POOCHYENA, RALTS (tutorial) and WURMPLE.
- With several sources, the super-effective and gap lines sit under each gym line, indented, so two gyms do not mix.
- The wild foe line says "(its types in this battle)" instead of "as its summary page shows": the types come from battle RAM, not a summary screen the model opened.
- A gym leader's name is shown only once the game showed it in battle (trainer_opponent); before that the line says "GYM LEADER not defeated".
- The d41e fixture's `type_gap` is rebuilt from d41e's own battle RAM (TORCHIC's types and move types/power), because d41e ran before the switch existed.

## Gates

- just test: agent 4510 passed; viewer 2037 passed (one run each had a load-timing failure, live-human.test.ts and the server socket test; both passed when rerun, neither touched); Python 4439 passed, 1 failed: test_view.py needs the mGBA binding, absent from this worktree's fresh uv venv; it passes with the main checkout's venv. Trainer-card check 3 passed after `just trainer-card-art` built the gitignored art.
- just lint: tsc, eslint, ruff and ruff format pass; mypy fails only on mgba._pylib in this venv and passes with the main venv (134 files).
- just coverage: agent lines 96.47 / branches 92.61 / functions 97.49; viewer 95.86 / 91.66 / 95.35; Python gate 97.40 / 93.55 / 99.78 (type_gap.py 100%). The recipe stopped on the same test_view failure; the gate was run on its JSON.
- Explainers: pages-check clean; 8791 links return 200; headless screenshots at 1280, 1440 and 375 opened, no horizontal overflow, zero off-origin requests (runs/mockups/type-gap-team/shots/).
