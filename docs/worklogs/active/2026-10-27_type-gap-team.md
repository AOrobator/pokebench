# Type gap, supplies and untalked people in gym

The operator approved three bundle-only, default-off switches at 1:33 PM NY on 2026-10-27, in the thread "Design type-gap-team switch". The spec is runs/designs/type-gap-team-v1.md (gitignored scratch); this worklog records what was built from it.

Branch `claude/type-gap-team`, worktree /private/tmp/pb-type-gap-team. No live run, GPU, probe or viewer restart is touched. Local only.

## Switches

- **type-gap-team-v1** (observation, server + agent). For each gym whose badge flag is clear and whose type this run has evidence for, a block with: the gym's types and their quoted sources (foe battlers in trainer battles on the gym map; the gym guide's sentence in the ROM guides' patterns; the gym sign, typed only by "X-loving"); the attacking types the ROM type chart makes super effective against them, with multipliers; which of those no party species type or damaging move has; the party; wild POKéMON met this run with gap types (or the wild foe at a wild decision); balls; controls. Triggers: a wild decision whose foe has a gap type; the first field result after a loss to a GYM LEADER (once per loss); the first field result after a gym's type first becomes known (once per gym). The server adds `type_gap` (party species types, move types/power, ROM gTypeEffectiveness rows) only with the switch.
- **supplies-v1** (observation, agent). "Supplies: ₽… · balls: … · healing and status items: … · party N of 6 · places on this map that sell things: …" at the first field result after arriving on a map that sells things or has a door into one (once per arrival), and whenever a buy list opens. Reworked 2026-10-27 at the operator's request ("walking into the Pokemart is a little bit too late"): Astra (429f) decided to shop on the town map 0–5 turns before each of its six mart visits. Selling maps come from pret scripts (pokemart/pokemartdecoration/pokemartdecoration2, plus the BP, coin, LAVA COOKIE and SODA POP sellers); doors come from the game's map table (GET /pokebench/places).
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

COMMIT: `feat: type-gap-team-v1, supplies-v1 and untalked-in-gym-v1 bundle switches (default off)` (4ad7dba4d)

## Rework after the operator's supplies note (2026-10-27)

Landing was held. Astra 429f, read-only: every one of its six mart visits was decided outside, 0–5 turns before entering (table in the supplies explainer). supplies-v1 now fires on arrival on a selling map or a map with a door into one, names those places and doors, and still fires when the buy list opens. Rebased onto main 511a6f95c first; gates on the rebased tree before the rework: agent 4513, viewer 2044, Python 4439 + test_view (mGBA venv), coverage agent 96.47/92.61/97.49, viewer 95.88/91.67/95.36, Python 97.40/93.55/99.78. Production-path RED re-proved for the new supplies wiring.

Gates after the rework: agent 4517, viewer 2044, Python 4439 (test_view passes with the mGBA venv), trainer cards 3/3, lint and schema clean; coverage agent 96.47/92.61/97.48 (supplies.ts 98.82/97.46/95.23), viewer 95.87/91.67/95.36, Python 97.40/93.55/99.78.

## Multi-Model Review Log

Round 1 (base 511a6f95c, head 9223d83f2, packet 7939bd86…):
- Claude CLI (~/.claude-review): no review produced. The runner placed the prompt after --add-dir, which consumed it ("Input must be provided"). Rerun in round 2 with the prompt on stdin.
- GPT (Codex CLI gpt-5.6-sol): BLOCKING.
  - #1: a gym leader win is counted as a loss before the badge flag is set. Fix: count a loss only when the first field state shows the leader's trainer flag clear. pret battle_setup.c CB2_EndTrainerBattle sets trainer flags on a win; the badge is set later in the leader's post-battle script. Test added.
  - #2: a failed GET /pokebench/places is retried on every result. Fix: one read per run, a failure included. Test added.
  - #3: test runtime shape (map.json reads, ROM scans per parameter, replay find). Rebut: it asks for operation counts and scaling receipts, which the triage rule excludes; the suites run in seconds.
- Fallback (fresh read-only Sonnet subagent): BLOCKING on the same leader-win bug (Fix above). Follow-ups noted, not in this branch: a once-per-battle latch for the wild block; Hidden Power and fixed-damage moves; doors named before the player has seen them (the map-table approach was operator-approved).

Round 2 (base 511a6f95c, head df41b738f, packet 7e7614c9…):
- Claude CLI (~/.claude-review, prompt on stdin): LGTM. Follow-up: the wild list's turn list grows (handled by fix 4 below).
- Fallback (fresh Sonnet subagent): LGTM. Follow-ups: guide-pattern pages from gym trainers count as "said"; scripted non-person objects in the untalked list; KeyError in type_gap.py name tables; first places read can wait up to the 15 s fetch timeout.
- GPT (Codex CLI gpt-5.6-sol): BLOCKING, five findings. Round cap reached; The operator picked (b) on the decision card: fix 1, 2, 4 and the wording in 3, push back on 5 and the people-ledger half of 4.
  - #1 Fix: a wild foe that has a gym's own type (said/signed, else shared by every POKéMON met in its battles) never shows the block. Test: wild GEODUDE ROCK/GROUND after the ROCK guide → none.
  - #2 Fix: type_chart rows are (0–17, 0–17, 0|5|10|20) or exactly (254,254,0). Tests reject [18,253,7] and [0,5,7].
  - #3 Wording: the untalked line comes ahead of the readout, after headers such as harness-trust-v1's. Description and explainer corrected; production-path test with harness-trust-v1 on.
  - #4 Fix: wild species are shown with battle count and first/latest turn ("2 battles, turns 10 to 40"), not every turn. Rebut the people-ledger half: PeopleLedger's per-state memory is the existing class shared with people-ledger-v1.
  - #5 Rebut: repeat of round 1's runtime-shape request with no new evidence.
