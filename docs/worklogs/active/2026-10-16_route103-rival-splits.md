# Route 103 rival splits (measurement only)

Operator ask (the operator, 2026-10-16 02:55 and 03:13 EDT; plan OK 03:44 EDT): more milestones between Oldale and the Pokédex, and rival battle started split from rival battle won.

## Grounding (pokeemerald 731ad5bf, verified on run 2026-10-16T02-23-17_qwen36-gpu1_sh02 raw RAM)

- Route 103 rival is an object script (no coord trigger): `Route103_EventScript_Rival` → `trainerbattle_no_intro TRAINER_{MAY,BRENDAN}_ROUTE_103_{TREECKO,TORCHIC,MUDKIP}` (opponents.h 520/523/526/529/532/535) → `AfterMayBattle` talk → `RivalExit` → `RivalEnd` sets VAR_BIRCH_LAB_STATE 4, FLAG_DEFEATED_RIVAL_ROUTE103 (0x82), VAR_OLDALE_RIVAL_STATE (0x40C7) 1.
- gTrainerBattleOpponent_A 0x02038BCA (122 literal-pool refs in the ROM); gBattleTypeFlags 0x02022FEC, BATTLE_TYPE_TRAINER = bit 3. Trainer flag = TRAINER_FLAGS_START 0x500 + id.
- sh02: frame 148843 opponent 0→535 with trainer bit; 151983 flag 0x717 set (battle won); 152367 flag 0x82 set (scene over, recorded RIVAL_BATTLE_WON 03:14 EDT). Afterwards lab 4, Oldale rival 1.
- `OldaleTown_EventScript_RivalFinish` sets Oldale rival state 2 after the "let's go back" scene; `LittlerootTown` OnTransition also sets 2 when it is still 1, so the Oldale split needs the 1→2 change inside Oldale.

## Design

- New reader field `route103_rival` {battle_active, defeated, oldale_stage} beside game_stats, NOT inside `story`: loop detection fingerprints `story` as progress, and `story.text()` is the model readout. Readout text bytes stay identical.
- `RIVAL_BATTLE_WON` keeps its flag and meaning (no model-visible timing change: hint, objectives and stall clocks key off it). Viewer label becomes "Rival sends you back".
- New measurement-only splits (feature `route103-rival-splits-v1`), in order after ROUTE_103:
  - RIVAL_BATTLE_STARTED: battle_active (in battle, trainer bit, opponent in the six ids).
  - RIVAL_BATTLE_DEFEATED: any of the six trainer flags; precedes RIVAL_BATTLE_WON.
  - (RIVAL_BATTLE_WON existing)
  - RIVAL_OLDALE_SEND_OFF: settled OLDALE TOWN at Oldale rival 1, then settled OLDALE TOWN at 2.
  - ROUTE_101_AFTER_RIVAL_BATTLE: witness lab 3, settled OLDALE TOWN at lab 4, settled ROUTE 101 at lab 4.
  - LITTLEROOT_AFTER_RIVAL_BATTLE: witness lab 3, settled ROUTE 101 at lab 4, settled LITTLEROOT TOWN at lab 4.
- Viewer derives the two lab-state splits for older logs; the three reader splits need the new field.

## Milestones

- [x] M1 Python reader: RED/GREEN, readout bytes unchanged, coverage ≥90
  - RED: test_route103_rival.py fails at import (no pokebench_env.route103_rival).
  - GREEN: pytest 2150 passed; Python coverage lines 97.15 / branches 92.80 / functions 100 (route103_rival.py 100%); ruff clean. mypy reports only the pre-existing mgba._pylib import (no native build in this worktree). Updated shape-golden tests: state_json key list, GameState equality, displayed-names json golden pops only route103_rival.
- [x] M2 TS schema, tracker, qualification, viewer, frontier, features: RED/GREEN, gates
  - RED: agent route103-rival.test.ts 5 failing; viewer frontier 5, frontier-recording 1, panels 1 failing.
  - GREEN: agent 1440/1440 (cov 97.75 st / 94.64 br / 98 fn / 99.09 ln), viewer 826/826 (95.2 / 90.68 / 93.56 / 97.65), tsc+eslint clean, schemas/events.v1.json regenerated. Recorder refuses a run that declares route103-rival-splits-v1 when the reader omits the field (fake-server fixtures now send route103_rival:null). Name-plate milestone totals 40→45. Explainer docs/explainers/route103-rival-splits-v1.html (pages-check clean) mapped in FEATURE_EXPLAINERS.
- [ ] M3 Explainer, reviews (Codex + grok), operator approval, local merge
  - Review 1: Codex gpt-5.6-sol BLOCKING (frontier-recording compact() drops route103_rival so receipts fail qualification; rivalWitness accepts post-defeat/in-battle lab-3 states). grok cursor-grok-4.5-high BLOCKING (loop-detection nativeProgress counts measurement-only story splits as progress, resetting the guard). All accepted. RED: agent 3, viewer 2 failing.
