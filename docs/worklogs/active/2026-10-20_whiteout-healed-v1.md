# whiteout-healed-v1: say that a whiteout heals the party

## Operator asks

- 2026-10-20 6:31 PM ET, the operator: "lets build it, bundle only" (relayed by the coordinator).
- Evidence: run `2026-10-20T16-14-34_qwen36-gpu1_c6c2`. After losing to MAY at turn 256 (result seq 6924, state 6922) the readout said `TORCHIC Lv5 HP 20/20`, yet turns 257–263 planned to "go to the POKéMON CENTER to heal my TORCHIC" before fighting MAY again; turn 264 noticed the full HP. The same run whited out to MAY again at turn 277 (state 7942).

## Grounding

- pokeemerald `src/overworld.c` `DoWhiteOut`: `SetMoney(money / 2)`, then `HealPlayerParty()` (`src/script_pokemon_util.c`: HP to max, PP, status) before `SetWarpDestinationToLastHealLocation(); WarpIntoMap();`. So the first overworld state after the warp already shows the healed party.

## Design

- Bundle-only, default off, agent-side (no server switch), `needs: null` (each part works on its own).
- Recap clause: when the battle-loss-recap-v1 line is for a whiteout, append the party as the first overworld state after the warp read it (`BattleOutcomes` stores it on the whiteout): "Whiting out restored your whole party: TORCHIC 20/20 HP." Every non-egg party Pokémon with HP and max HP from RAM. When any is not at max or unread: "After whiting out, the game state showed your party: ..." with what it showed. A loss without a whiteout gets nothing.
- Prompt clause: TRAINER_HEAL_SECTION's blackout sentence gains ", with your whole party healed" before its period. That sentence exists only there (`play-config.ts`; the recorded 4caa fixture is data).
- blackout-readout-v1 already says "healed your party" in its notice: unchanged. respawn-readout-v1 (server line "If your party faints, you wake up ... and lose half your money") and the supervisor warnings' blackout sentence: unchanged, to keep the switch minimal and agent-only (the respawn line is server text behind another switch).

## M1

- [x] RED: c6c2 fixture (seq 6700–8000 trimmed, party kept); recap clause ON at 6924 and 7942-era result, OFF unchanged; not-full and unread party wording; no clause without a whiteout; prompt ON/OFF; registry; production wiring. 13 tests: 10 red, 3 green (OFF c6c2 recaps equal the recorded lines; prompt without trainer-heal; loss without whiteout).
- [x] GREEN: `BattleOutcomes` keeps the non-egg party (species, hp, max_hp) on the whiteout only with the switch on, and `recap` appends `healedParty`; `playSystemPrompt` adds the clause to TRAINER_HEAL_SECTION's blackout sentence. Registry (SWITCHABLE_FEATURES, FEATURES, playHarnessFeatures last), presets, legacy fixture, DEFAULT_NEXT_RUN off. Registry index churn across ~50 agent tests. Wiring deletions: `false&&` in recap turns the playGameTools test red; `false ?` in the prompt turns the prompt test red; both restored.
- [x] Explainer `docs/explainers/whiteout-healed-v1.html` (pages-check clean), README, FEATURE_EXPLAINERS + server test; pending `experiments/whiteout-healed-v1.json` (incumbent with battle-loss-recap-v1 and trainer-heal-guidance-v1 on); readiness row; bundle arm of bundle-v-control and bundle-cook-1h. `just fixed-run check` reads the main checkout's definitions (fixed-cli `mainCheckout`), so the worktree definitions were checked by calling the same `main(["check",id])` with root = worktree and start saves from the main runs dir: both pass (sha256 1f3e9fe2… and f135b120…), whiteout-healed-v1 last in bundle switches.
- [x] Gates: build, lint clean; agent 2977, viewer 1436, pytest 2998; coverage agent 97.21/92.96/97.6/99.16 (stmts/branches/funcs/lines), viewer 95.09/91.06/93.85/97.7, Python 97.09/92.62/100
- [ ] Review: Claude + Grok (max 2 rounds)
