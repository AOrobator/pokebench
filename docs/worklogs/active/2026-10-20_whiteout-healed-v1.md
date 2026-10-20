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
- [ ] GREEN
- [ ] Explainer, FEATURE_EXPLAINERS, pending experiment, readiness row, bundle arm of bundle-v-control and bundle-cook-1h
- [ ] Gates: test, lint, build, coverage
- [ ] Review: Claude + Grok (max 2 rounds)
