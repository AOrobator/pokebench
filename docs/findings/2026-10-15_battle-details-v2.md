# battle-details-v2: battle actions, refusals and full battle facts

Reference: pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` (clean checkout at `/Users/user/dev/pokeemerald`). ROM: US SHA1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7` (the recorded archives carry this `rom_sha1`). Code: `env/pokebench_env/battle_details.py`, gated in `env/pokebench_env/readout.py` by `battle-details-v2` (needs `expanded-menu-battle-information-v1`, default OFF).

## Addresses used (all previously verified; no new address)

| Symbol | Address | Verified by |
|---|---|---|
| gBattleTypeFlags | 0x02022FEC | `battle_choices.TYPE_FLAGS`; recorded `battle_type` 20 (IS_MASTER, FIRST_BATTLE) in the Birch rescue of c406/c497/9d86, 4 (IS_MASTER) in the wild battle of 258d |
| gBattleMons (0x58 each) | 0x02024084 | ROM literal 0x0803C994 (docs/findings/battle-choices.md) |
| gStatuses3 | 0x020242AC | `runs/battle-state-proof/rom-symbols.json` (docs/findings/2026-10-14_battle-state.md) |
| gActionSelectionCursor / gMoveSelectionCursor | 0x020244AC / 0x020244B0 | same receipts |
| gPlayerParty / count | 0x020244EC / 0x020244E9 | existing party reader |
| gBattleMoves (12-byte rows) | 0x0831C898 | existing battle reader; recorded move types/power/accuracy match source (SCRATCH 0/40/100, TACKLE 0/35/95, GROWL 0/0/100) |
| gSpeciesInfo (28-byte rows) | 0x083203CC | `daycare.SPECIES_INFO` |
| gItems (44-byte rows) | 0x085839A0 | `pokemon.ITEMS`, item names and ids checked per row |

Struct offsets come from the pinned source: `struct BattlePokemon` (include/pokemon.h): stats +2..+0xB, statStages +0x18 (HP, Atk, Def, Spe, SpA, SpD, Acc, Eva; 6 neutral), ability +0x20, types +0x21/+0x22, pp +0x24, item +0x2E, status1 +0x4C, status2 +0x50. `struct SpeciesInfo`: types +6/+7, abilities +0x16/+0x17. `struct Item`: holdEffect +0x12, battleUsage +0x20. Party ability: `GetMonAbility` uses abilityNum, bit 31 of the misc substructure word at +4 (the same word whose bit 30 is isEgg in `pokemon.py`). Type names: `include/constants/pokemon.h` order. Ability names: `src/data/text/abilities.h` gAbilityNames, embedded verbatim.

## Game rules the readout follows

- Menu: `gText_BattleMenu` (battle_message.c:1275) always draws FIGHT, BAG, POKéMON, RUN; `HandleInputChooseAction` never skips one. Refusals happen after the choice in `HandleTurnActionSelectionState` (battle_main.c:4129+), so each verdict appears only for an action the game can refuse.
- FIGHT: no action-level refusal. Action menu skipped when status2 has MULTIPLETURNS (bit 12) or RECHARGE (bit 22) (battle_main.c:4161-4167). All moves at 0 PP: Struggle. A 0-PP move is refused in the move menu with "There's no PP left for this move!" (battle_message.c:360).
- BAG: "Items can't be used now." when gBattleTypeFlags has LINK, FRONTIER_NO_PYRAMID, EREADER_TRAINER or RECORDED_LINK (battle_main.c:4220-4233). Items with battleUsage 0 cannot be used. Balls: `Cmd_handleballthrow` blocks them in trainer battles ("The TRAINER blocked the BALL!" / "Don't be a thief!") after `ItemUseInBattle_PokeBall` already removed the ball (item_use.c:938-956); refused with "The BOX is full" when party and storage are full.
- POKéMON: party always opens; switching refused with "X can't be switched out!" when wrapped or MEAN LOOK/BLOCK (status2), INGRAIN (STATUS3_ROOTED) or Battle Arena; "Y's ABILITY prevents switching!" for an opposing SHADOW TAG, ARENA TRAP (unless Flying or LEVITATE) or MAGNET PULL against a Steel type (battle_main.c:4240-4256). Per member (party_menu.c:5800-5850): fainted, EGG, already in battle.
- RUN, in order: Frontier/Trainer Hill trainer battle asks to forfeit; trainer battle (not link) "No! There's no running from a TRAINER battle!"; then `IsRunningFromBattleImpossible` (battle_main.c:4021-4083): SMOKE BALL (holdEffect 37), link and RUN AWAY always escape; SHADOW TAG / ARENA TRAP / MAGNET PULL "X prevents escape with ABILITY!"; wrapped, MEAN LOOK, INGRAIN "Can't escape!"; FIRST_BATTLE "PROF. BIRCH: Don't leave me like this!". Otherwise a wild single battle escapes for sure when the player's speed stat is at least the foe's, else with (speed×128÷foe speed + 30×runTries) > random 0–255 (`TryRunFromBattle`, battle_util.c:407-475).
- Physical/special by type (IS_TYPE_PHYSICAL, include/battle.h:466); power 0 is a status move; power 1 marks a variable-power move.

## Evidence

Fixtures are byte copies of recorded raw-RAM archives (windows over IWRAM battle globals, gBattleTypeFlags, BufferA heads, the battle core 0x02024060–0x020244C0 and the party):

- `runs/2026-10-14T22-13-05_think-fast_c406/raw-ram/00001266.json.gz` (frame 78044, action select on FIGHT) and `00001269.json.gz` (frame 78196, move select on SCRATCH): the PROF. BIRCH rescue.
- `runs/2026-10-15T07-42-49_think-fast_c497/raw-ram/00001557.json.gz` (frame 64320, turn 2, both Atk −1, BAG highlighted).

No recorded run has a trainer battle (every recorded `battle_type` is 20 or 4), so the trainer fixture flips the c497 flags to TRAINER|IS_MASTER. ROM rows in tests are written from source data because the ROM never enters git. This session could not read the ROM (blocked by the local permission rules), so no live-ROM replay of the archives was run; the decoded `battle` JSON recorded with each archive (produced on the real ROM) matches the fixture values for species, stats, types, abilities, moves and PP.

## Deferred (not read, never guessed)

- Disable, Taunt, Torment (status2 bit 31 is shown as a condition, but the per-move lock is not), Imprison, Encore, Choice Band locked move: `gDisableStructs` and `gBattleStruct` fields at derived addresses without a ROM literal or raw-RAM receipt.
- runTries for the escape odds: `gBattleStruct->runTries`, derived. The readout prints the formula with both speeds.
- ENIGMA BERRY hold effect: `gEnigmaBerries`, derived; RUN says "unknown" when it is held.
- Battle text (`gDisplayedStringBattle`): derived address.
- Script-owned YES/NO prompts ("Use next POKéMON?", learn a move): still reported as resolving. `gBattlescriptCurrInstr` 0x02024214 and the cursor `gBattleCommunication[1]` 0x02024333 are verified, but identifying which battle script owns the box needs script-address receipts that do not exist yet.
- Battle Pyramid run odds and bag, multi-battle partner slots, Safari actions, opponent party size: need `CurrentBattlePyramidLocation`, the partner slot mapping and the enemy party count, none verified.
- Turn order (priority, paralysis, stat stages, Quick Claw) is not computed; raw speed stats are shown.
