# Training and catching switches

The operator picked "both sets" on 2026-10-21 at 09:50 AM ET, after the Rustboro strategy report (http://127.0.0.1:8791/reports/rustboro-strategy/index.html). Branch `claude/training-catching-switches`, worktree `.claude/worktrees/training-catching-switches`, based on local main 9f2f77ea. Approved by the operator 2026-10-21 09:55 AM ET: "go for it" (defaults kept: Training block on every field observation; the not-owned mark stays). mart-stock-readout-v1 is out of scope: it has its own thread, "Mart stock readout".

## Problem Statement

11 runs reached the RUSTBORO CITY GYM between Oct 19 and Oct 21. Eight fought ROXANNE 17 times and lost every time. Each brought a lone TORCHIC at Lv13–15, and none got past her second GEODUDE. Evidence is in `runs/reports/rustboro-strategy/`.

- **Training never turns into a target.** The model never sees EXP. POINTS or NEXT LV. (0 deliveries in 1331). 97a0 challenged ROXANNE 22 EXP short of Lv16, which brings evolution and DOUBLE KICK. 35df, fd95, 2e93 and a8f9 were 279–397 short on their last tries. A gym trainer is worth 147–294 EXP; a wild POKéMON on Route 104 is worth 17–45.
- **Rematches repeat the loss.** 6 of 9 rematches started with exactly the EXP of the loss before (6abf three times in a row at 1,500). Money halves with each loss.
- **Trainers are skipped.** After losing, the control runs never fought TOMMY or MARC (0 of 4 runs).
- **Catching is instruction-following.** Runs met WATER or GRASS POKéMON 36 times across 10 runs and threw no balls at them. The only two catches answered MOM's line (1331 turn 497). The battle readout already shows foe types and moves. Nothing links them to what the game has said or to the party's gaps.

The operator (09:22): the switches must work together, so the model reasons from its EXP; and catching matters for the rest of the game, not only for ROXANNE.

## Skills Loaded

feature-worklog, feature-switch, pokebench-game-state, feature-explainer, experiment-queue, close-the-loop, agent-observability, multi-model-review (cloud lanes only).

## Game grounding (pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, ROM US f3ae0881)

- **EXP. POINTS and NEXT LV.**
  - The labels are `gText_ExpPoints` "EXP. POINTS" and `gText_NextLv` "NEXT LV." (src/strings.c:501-502).
  - The summary screen computes `expToNextLevel = gExperienceTables[gSpeciesInfo[species].growthRate][level + 1] - exp` (src/pokemon_summary_screen.c:3451). At MAX_LEVEL it shows 0.
  - ROM: gExperienceTables is at 0x0831F72C (101 u32 per growth rate, already read in daycare.py), and gSpeciesInfo is at 0x083203CC (growthRate at +19).
  - The party's `experience` is already decoded.
- **EXP gained.** `sText_PkmnGainedEXP` "{B_BUFF1} gained{B_BUFF2}\n{B_BUFF3} EXP. Points!" (src/battle_message.c:56). B_BUFF2 is " a boosted" for traded POKéMON. The pages already arrive as `dialogue_auto_advance` battle pages.
- **POKéDEX.** SaveBlock2 +0x18 holds `struct Pokedex`: owned[52] at +0x10 and seen[52] at +0x44, indexed by national dex number - 1 (include/global.h:206). The list screen's counts come from `GetHoennPokedexCount(FLAG_GET_SEEN/FLAG_GET_CAUGHT)` (src/pokedex.c:1627). SEEN and OWN are drawn labels on the list screen, so the exact words get checked against a screenshot in M1. gSaveBlock2Ptr is at 0x03005D90 (as in menu_aux.py).
- **Trainers.** heal-before-trainers-v2 already lists every trainer template on the current map, with its trainer flag (TRAINER_FLAGS_START 0x500 + id). The leader class is TRAINER_CLASS_LEADER 0x20, as in gym-readiness.ts.
- **Type lines.** Field pages with an "X-type" word, as gym-readiness-readout-v1 already collects them, for example the RUSTBORO GYM GUIDE: "The ROCK type is very durable, but it can't stand WATER-type and GRASS-type moves." (data/maps/RustboroCity_Gym/scripts.inc:121).

## Architecture

There are seven switches, all default off, bundle arms only, with control OFF. Each switch's OFF state is today's readout.

**Training set.** Its switches share one `Training (game numbers):` block in the field readout, out of battle. A line appears only while its switch is on, and the block appears only if at least one line exists.

| Switch | Side | ON |
|---|---|---|
| exp-next-level-v1 | server readout | Each party line gains `EXP. POINTS n · NEXT LV. m` (in battle and field party lines too). The Training block repeats it for the lead. |
| exp-earned-ledger-v1 | agent | "EXP. Points the game printed, by source this run": per source kind (trainer battles, by trainer name; wild POKéMON, by species) the amounts from the game's "gained … EXP. Points!" pages, for the last 10 battles, plus the min–max per kind |
| leader-attempt-ledger-v1 | agent | On a gym map, and at a battle decision against a GYM LEADER: each earlier battle with that leader this run, with the party's level and EXP, the bag, her POKéMON fainted or the HP left, the outcome and the money before and after |
| seen-trainers-ledger-v1 | agent | Trainers listed in the readout (heal-before-trainers-v2) on maps visited this run, per map, with not beaten / battled, not beaten / beaten. Only maps the player stood on, and only trainers the readout listed there. |

**Catching set.** These switches live in battle details at wild and trainer battle decisions, and on the field party line.

| Switch | Side | ON |
|---|---|---|
| party-coverage-v1 | agent | At battle decisions: per party move, what the game printed when it hit each foe type this run (from the effectiveness-heard fold, grouped by the foe's types from the battle state), then "Foe types none of your moves has drawn "It's super effective!" against: …" for the types met this run |
| said-type-matches-v1 | agent | Every "X-type" line the game printed on any map this run is kept with its map. At battle decisions, each foe move and party move whose type is named gets the quoted line and the map. |
| pokedex-own-v1 | server readout | Once the POKéDEX is received, `POKéDEX SEEN n · OWN m` (Hoenn counts), `Party 1/6` and the bag's balls on the field party header. A wild foe whose species is not owned gets `not in your POKéDEX OWN list`. |

**Wiring.** The agent switches use the appended-part wrapper from effectiveness-heard.ts, around observe/press/navigate_to/battle_action and semantic walks. The server switches go through the readout feature flags, like move-learn-question-v1.

## Invariants

- **INV-1: OFF is byte-for-byte today.** Rationale: A/B control. Test: OFF goldens for the readout and the tool results on recorded fixtures.
- **INV-2: game words or game numbers only.** No advice, no "you should", no evolution levels, no leader team before battle, no places or NPCs to visit. Test: exact-text fixtures, plus a banned-words test (should|recommend|evolve|train|go to|level target).
- **INV-3: NEXT LV. equals the summary screen's value.** Test: unit test over growth rates and levels 1, 15, 99 and 100. A fixture check uses 97a0's TORCHIC (exp 2513 → NEXT LV. 22) and 1331's (1619 → 416).
- **INV-4: seen-only.** Trainers only from maps the player stood on and from readout listings; foe moves only as the battle readout already shows them; type lines only as printed. Test: an unvisited map's trainers are absent, and a type line from a map not yet visited is absent.
- **INV-5: EXP attribution matches the battle.** The source is the trainer (battle_active) or the wild species at that page's state_seq; a page without a matching state is dropped, never guessed. Test: 1331's recorded pages (JOSH 184, wild 17).
- **INV-6: POKéDEX counts match the game.** Test: a raw-RAM fixture before and after 1331's WURMPLE catch; the counts change by OWN +1. Screenshot check of the label words.
- **INV-7: the production path honours each switch.** Test: factory/route tests plus delete-the-guard receipts.
- **INV-8: no model-facing truncation** (memory rule). The ledgers bound themselves by the number of battles shown (last 10), stated in the line. Text is never clipped.

## Security Review

There are no new inputs, subprocesses, network or file access. The server reads ROM tables and SaveBlock2 through the existing reader. The agent folds recorded events it already receives.

## Milestones

**M1 — server switches: exp-next-level-v1, pokedex-own-v1**
- [x] Fixtures: six raw-RAM archives (`env/tests/env/fixtures/training-*.json.gz`, provenance `training-raw.provenance.json` with run, source archive, state seq, turn, sha256): 1331 pre-POKéDEX (turn 109), wild WURMPLE before the catch (497), after the catch (505), RUSTBORO CITY field with TORCHIC 1619 (660), ROXANNE battle (662); 97a0 RUSTBORO CITY field with TORCHIC 2513 (705).
- [x] Tests: `env/tests/env/test_training_readout.py` (NEXT LV. = summary formula for 6 growth rates × 3 levels, MAX_LEVEL 0, unknown species none, clause wording, party line field/battle/97a0, POKéDEX counts across the catch, inconsistent copies not counted, unreadable save, field line, no line before the POKéDEX, wild not-owned / owned, none in trainer battles, OFF parity readout + state JSON per archive, state JSON party_next_level only ON, independence, registry); `packages/agent/src/training-catching-switches.test.ts` (registry order, titles, needs, presets default off, server env).
- ROM grounding found during M1: sSpeciesToNationalPokedexNum at 0x0831DC82 and sHoennToNationalOrder at 0x0831DFB8 (found by their value runs; 0x0831DC82 + 822 bytes = 0x0831DFB8, matching src/pokemon.c table order). SaveBlock2 pokedex at +0x18 (owned +0x10, seen +0x44); SaveBlock1 seen1 +0x988, seen2 +0x3B24. Design change: the "balls in the bag" part of pokedex-own-v1 is dropped (the Bag line already shows them); "party k of 6" stays. The agent's Training block reads `party_next_level` from the state JSON, present only while exp-next-level-v1 is on.
- [x] COMMIT: `test: exp-next-level-v1 and pokedex-own-v1 readouts on recorded 1331 and 97a0 RAM; registry for seven training and catching switches (RED)` (869dc48a). RED: `pokebench_env.pokedex_own` missing (collection error); 3 registry tests fail.
- [x] Implement: `env/pokebench_env/training_readout.py` (next_level_exp, exp_clause) and `pokedex_own.py` (read_pokedex with the game's three-copy check, Hoenn counts, national numbers, wild_foes, dex_lines); `game_state._with_training` fills `party_next_level` and `pokedex` after the rest of the state; rerender flags; Party line clause and the POKéDEX lines after the Party line; `state_json` adds `party_next_level` only when on; agent StateBodySchema `party_next_level` (optional) and regenerated schemas/events.v1.json; registry for all seven (features.ts, play-preset.ts, next-run.ts, legacy-features.ts; SERVER_FEATURES and the Python default-off list for the two server ids).
- [x] Registry collateral: agent tests shifted for the 7 appended ids (positions, counts, POKEBENCH_FEATURES_OFF strings; 8 older experiment-incumbent tests add the 7 ids to their own "registered later" exclusion lists, as they do for every later switch); experiments/pending-field-dialogue-v1.json incumbent declares the 7 ids false (its test requires every current switch). Python: recorded-readout tests add the two server ids to their "registered later" off sets; SERVER_FEATURES index tests shifted by 2; test_feature_switches pops party_next_level like map_grid. Viewer workbench-offthread size-ratio fixture raised from 5000 to 6000 heavy splits (the live card's feature list grew by 7; the test still asserts the projection is 20× smaller).
- [x] Gates: `just lint` ok; `just build` ok; `just coverage` agent 3285 tests (97.26/93.12/97.71/99.2), viewer 1601 (95.41/91.32/94.33/97.9), pytest 3630 (lines 97.25, branches 92.96, functions 100); pokedex_own.py 96%, training_readout.py 94%.
- [x] COMMIT: `feat: exp-next-level-v1 shows the summary screen's EXP. POINTS and NEXT LV. and pokedex-own-v1 the POKéDEX counts and wild foes not owned; registry for seven training and catching switches (default off)` (9dfeb4f8)
- [ ] Screenshot: the POKéDEX list in a recorded run frame, to confirm the SEEN/OWN words

**M2 — agent training set: exp-earned-ledger-v1, leader-attempt-ledger-v1, seen-trainers-ledger-v1, shared Training block**
- [x] Fixture: one run covers all three parts, so one fixture instead of three: `packages/agent/src/fixtures/training-fd95.jsonl.gz` (run 2026-10-21T04-27-11_qwen36-gpu1_fd95, bundle arm: every state event slimmed to the fields the folds read, every dialogue_auto_advance and milestone event; ROXANNE lost at turns 501, 538 and 591, JOSH/TOMMY/MARC beaten in between, 36 "gained … EXP. Points!" pages).
- [x] Tests: `training-block.test.ts` (whole block exact on the gym field before the third ROXANNE battle; each switch alone adds only its part; party part needs the server's NEXT LV.; field only, leader part also at a leader battle decision, nothing at a wild decision; leader part off the gym absent; page without a recorded state dropped; banned-words; playGameTools factory ON/OFF).
- [x] COMMIT: `test: training block (EXP earned, leader attempts, seen trainers, NEXT LV.) on recorded run fd95 (RED)` (5a2e4522). RED: `./training-block.js` missing.
- [x] Implement: `training-block.ts` (TrainingBlock fold: battle index per state so each EXP page is attributed through the state it names, never guessed; leader battles keyed by trainer class LEADER with party/EXP/BAG/money at the first battle state, each foe slot's last HP, the game's outcome and the money on the first field state after; seen trainers per map stood on from heal_before_trainers; party part from party_next_level) and `withTrainingBlock` in play-wiring around game-said-goals. Field observations get every part that is on; a ready battle decision against a GYM LEADER gets the leader part only.
- [x] Gates: lint ok, build ok; coverage agent 3293 (97.29/93.07/97.74/99.21), viewer 1601 (95.42/91.33/94.33/97.9), pytest 3630 (97.25/92.96/100).
- [x] COMMIT: `feat: exp-earned-ledger-v1, leader-attempt-ledger-v1 and seen-trainers-ledger-v1 build one Training block …` (5174e666)

**M3 — agent catching set: party-coverage-v1, said-type-matches-v1**
- [x] Fixture: one run has the guide line, then ROXANNE and a wild GRASS foe, so one fixture: `packages/agent/src/fixtures/catching-6abf.jsonl.gz` (run 2026-10-21T02-26-37_qwen36-gpu1_6abf, control arm, slimmed the same way as training-fd95; GYM GUIDE lines at turn 689, four ROXANNE losses, wild SHROOMISH with ABSORB and STUN SPORE at seq 30081).
- [x] Tests: `catching-block.test.ts` (coverage rows by foe type with uses and printed lines, the no-"super effective" type list; decisions only; tutorial party excluded; type names; said-type marks on SHROOMISH and on ROXANNE's GEODUDE; nothing before the guide line, and the earlier WINGULL's WATER GUN once it was said; decisions only; banned words; playGameTools factory ON/OFF per switch).
- [x] COMMIT: `test: party-coverage-v1 and said-type-matches-v1 on recorded run 6abf (RED)` (b3a3e65c). RED: `./catching-block.js` missing.
- [x] Implement: `catching-block.ts` (PartyCoverage: uses attributed through the page's state, player's own party only, single battles; rows for types with a printed line plus the current foe's; the no-"super effective" list over every type met. SaidTypeMatches: field pages with an "X-type" word kept once with their map; foe then player battlers' type and move types matched; TYPE_NAMES as battle_details.py names them) and `withCatchingBlocks` in play-wiring around the Training block.
- [x] Gates: lint ok, build ok; coverage agent 3303 (97.31/93.03/97.76/99.22), viewer 1601 (95.42/91.33/94.33/97.9), pytest 3630 (97.25/92.96/100).
- [x] COMMIT: `feat: party-coverage-v1 … said-type-matches-v1 … (default off)` (a3f2e486)

**M4 — bundle arms, pending experiments, explainers, review, land**
- [x] Sync: merged local main (25 commits: mart-stock-readout-v1, gym-door-label-v1, party HP bar) into the branch. Python sources kept both sides (main's switches first, ours appended after mart-stock-readout-v1); every conflicted test and registry file taken from main, then the registry re-applied after mart-stock-readout-v1 and the collateral redone. Python 3679 pass after re-shifting SERVER_FEATURES indices.
- [x] Bundle arms: the 7 ids in `switches` and `base.features: false` of bundle-v-control, bundle-cook-1h, whole-map-cook-1h and whole-map-pair-2h (the four mart-stock-readout-v1 went into); control OFF. Viewer test asserts bundle ON / control OFF / next-run OFF for all four.
- [x] Pending `experiments/<id>.json` ×7 (incumbent = bundle arm of bundle-v-control with only that switch off; activation STARTER_CHOSEN for exp-next-level, pokedex-own, exp-earned-ledger, party-coverage; RUSTBORO_CITY_GYM for leader-attempt, seen-trainers, said-type-matches; primary ROXANNE_DEFEATED), readiness rows in docs/experiments/readiness.md. open-goal-prompt's incumbent test adds the 7 ids to its "registered later" exclusions.
- [x] Explainers ×7 (`docs/explainers/<id>.html`: ON/OFF readout from the recorded runs, wiring diagram with the one changing owner highlighted, game grounding, status), README lines, FEATURE_EXPLAINERS; panels.test and server.test cover all seven; `just pages-check` prints nothing. Viewer 1610 pass.
- [x] Delete-the-guard receipts, Python (runs/training-catching-switches/mutations.txt): rerender EXP flag (8 red), rerender POKéDEX flag (6 red), three-copy OWN check (1), trainer-battle wild-foe guard (1), state_json party_next_level gate (7), POKéDEX-received gate (1); each restored, 41 green.
- [x] Delete-the-guard receipts, agent (same file): EXP page without a recorded state (1 red), field-only gate (1), leader part only on a gym field (1), party part needs exp-next-level-v1 (2), coverage switch gate (1), said switch gate (1), tutorial-party guard (1), battle-text pages kept out of said lines (1), said waits for a ready decision (1), catching wiring in play-wiring (1), training wiring (1). The last three got new discriminating tests after the first pass left them green. Redundant by design: withTrainingBlock's any-switch gate and block()'s leaderActive test (each part checks its own switch; deleting either changes no output).
- [x] Gates on the merged tip: lint ok, build ok, verify-vendor ok; coverage agent 3310 (97.31/93.04/97.76/99.22), viewer 1610 (95.41/91.32/94.33/97.9), pytest 3679 (lines 97.28, branches 93.03, functions 100). Agent collateral redone by a helper subagent (test expectations only), checked: heal-first and story-battle-heal-gate drop the 7 ids from the bundle arm before comparing with their older pending incumbents, as main already does for gym-door-label-v1 and mart-stock-readout-v1.
- [ ] Cloud review: Claude and Grok/GPT lanes LGTM on the frozen packet. No local reviewers.
- [ ] Land with `git merge --ff-only` once the review is clean (standing rule), then `just viewer-main` and the live check

## Open questions for the operator

1. Should the Training block show on every field observation, or only on gym maps and after a battle ends? Default: every field observation, because the operator wants the model to reason from EXP when choosing what to do next.
2. pokedex-own-v1's "not in your POKéDEX OWN list" mark: Emerald's battle screen does not show a caught icon, but the POKéDEX itself shows it. Default: keep the mark.

## Closing the Loop

Tests prove the readouts on recorded RAM and events. No live probe (long runs only, operator 2026-10-17). The bundle cook runs measure it.

## Session Log

- 2026-10-21 10:0x AM ET: grounding and body drafted; waiting for approval.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER
